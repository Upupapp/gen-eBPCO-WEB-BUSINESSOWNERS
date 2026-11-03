import { Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { blankFormFor } from '../../core/domain/permit-form-assets';
import { firstValueFrom } from 'rxjs';
import { ApplicationStore } from '../../core/stores/application.store';
import { StatusPillComponent, statusTone } from '../../shared/ui/status-pill.component';
import { ApplicationLifecycleStatus, applicantStatusLabel, applicantStatusOf, isTerminalStatus } from '../../core/domain/status.model';
import { pesos } from '../../core/domain/assessment.model';
import { formatDate, formatDateTime } from '../../core/utils/ids';
import { ToastService } from '../../shared/ui/toast.service';
import { ApplicationDocumentsComponent } from './application-documents.component';
import { PermitReleaseComponent } from './permit-release.component';
import { PermitDeliveryComponent } from './permit-delivery.component';
import { PermitDeliveryState } from '../../core/domain/permit-delivery';
import { DocumentPreviewComponent } from '../../shared/ui/document-preview.component';
import { SavedDocumentFileType } from '../../core/domain/document.model';
import { PermitRelease } from '../../core/api/citizen-api.models';
import { DocumentResubmissionService, toBase64 } from '../../core/api/document-resubmission.service';
import { CitizenApiClient } from '../../core/api/citizen-api.client';
import { RequirementDocument } from '../../core/domain/requirements-catalog';
import { toContractShape } from './demo-document.adapter';
import { ApplicationDocumentResponse, InstructionLetter, TimelineEntryResponse } from '../../core/api/citizen-api.models';
import { duplicateOf } from '../../core/api/problem';
import { BackLinkComponent } from '../../shared/ui/back-link.component';
import { StepperComponent } from '../../shared/ui/stepper.component';
import { ApplicationRecord, applyingAsLabel, propertyOwnerOf } from '../../core/domain/application.model';

/** Same extension-sniffing fallback as my-documents.page.ts / application-wizard.page.ts. */
function fileTypeFromName(name: string): SavedDocumentFileType {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'pdf') return ext as SavedDocumentFileType;
  return 'pdf';
}

/** Everything `app-document-preview` actually reads — not the full `ApplicationDocument` shape, which a real, backend-fetched document has no local checklist/history for. */
interface PreviewableDocument {
  file: File | null;
  fileName: string;
  fileType: SavedDocumentFileType;
  label: string;
}

/** The statuses at which a generated permit exists to fetch. */
const PERMIT_STATUSES: ReadonlySet<ApplicationLifecycleStatus> = new Set<ApplicationLifecycleStatus>([
  'Permit Generated', 'Ready for Release', 'Out for Delivery', 'Released', 'Completed',
]);

/**
 * The statuses at which documents can still be added to the application: the
 * "Still needed" rows show only then (they listed nine "Choose file" buttons on
 * an approved application).
 */
const DOCUMENTS_OPEN: ReadonlySet<ApplicationLifecycleStatus> = new Set<ApplicationLifecycleStatus>([
  'Draft', 'Submitted', 'Received', 'Document Verification', 'Revision Required',
]);

/** What the Next step callout under the tracker asks the citizen to do. */
type NextKind = 'revision' | 'pay' | 'delivery' | 'returned' | 'collect' | 'info';

/** The five stages a citizen follows an application through (house style 2026-11-03). */
const STAGES = ['Submitted', 'Review', 'Payment', 'Approval', 'Release'] as const;

/**
 * The stage in progress at each status, for the tracker only (display; no
 * data or status changes): a stage is done once the application has moved
 * past it. Revision Required is still Review, and a permit on its way by
 * courier is still Release. Released and Completed have every stage done.
 * A status not listed (one the portal does not know yet) shows no tracker,
 * only the "what happens next" line. It replaces a red percentage bar.
 */
const STAGE_OF: Partial<Record<ApplicationLifecycleStatus, number>> = {
  Draft: 0,
  Submitted: 1,
  Received: 1,
  'Document Verification': 1,
  'Under Evaluation': 1,
  'Revision Required': 1,
  Assessed: 2,
  'Payment Submitted': 2,
  'Payment Under Verification': 2,
  'Payment Verified': 3,
  'For Approval': 3,
  Approved: 4,
  'Permit Generated': 4,
  'Ready for Release': 4,
  'Out for Delivery': 4,
  Released: 5,
  Completed: 5,
};

@Component({
  selector: 'app-application-details',
  imports: [
    RouterLink, StatusPillComponent, ApplicationDocumentsComponent, PermitReleaseComponent, PermitDeliveryComponent,
    DocumentPreviewComponent, BackLinkComponent, StepperComponent,
  ],
  styles: [`
    .status-card > .callout, .status-card > .demo-row { margin-top: 16px; }
    .status-card > .callout:first-child, .status-card > app-stepper + .callout { margin-top: 0; }
    .demo-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .next-step-facts { font-variant-numeric: tabular-nums; }
    .revision-remarks {
      padding: 2px 12px; border: 1px solid var(--warning-200); border-radius: var(--radius-md); background: var(--surface);
    }
    .revision-remarks-title { padding-top: 8px; }
    .revision-remark { padding: 6px 0 8px; }
    .revision-remark + .revision-remark { border-top: 1px solid var(--border-light); }
    .revision-remark p { margin: 2px 0 0; white-space: pre-line; color: var(--gray-800); }
    .withdraw-row {
      display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap;
      margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border-light);
    }
    .withdraw-row > .callout { flex: 1 1 100%; }
    .fees-due { margin: -4px 0 12px; }
    .card-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
    .permit-facts { margin-top: 16px; }
    /* Main column and right rail: side by side when both fit, else one column. */
    .detail-layout { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 16px 24px; }
    .detail-main { flex: 999 1 520px; min-width: 0; }
    .detail-rail { flex: 1 1 340px; min-width: 0; }
    .doc-subhead { display: flex; flex-direction: column; gap: 2px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-light); }
    .card-title + .doc-subhead { margin-top: 0; padding-top: 0; border-top: none; }
    .doc-subhead-title { font-size: 13px; font-weight: 600; color: var(--gray-800); }
    .doc-subhead + .doc-list { margin-top: 4px; }
    .doc-upload-input { display: none; }
    /* Status timeline: newest first, a dot per update on one vertical line. */
    .timeline { list-style: none; margin: 0; padding: 0; }
    .timeline-item { position: relative; padding: 0 0 16px 24px; }
    .timeline-item:last-child { padding-bottom: 0; }
    .timeline-item::before {
      content: ''; position: absolute; left: 0; top: 5px; width: 10px; height: 10px; border-radius: 50%;
      background: var(--surface); border: 2px solid var(--gray-300); box-sizing: border-box;
    }
    .timeline-item.timeline-latest::before { background: var(--primary-500); border-color: var(--primary-500); box-shadow: 0 0 0 3px var(--primary-100); }
    .timeline-item::after {
      content: ''; position: absolute; left: 4px; top: 19px; bottom: -2px; width: 2px; border-radius: 2px; background: var(--gray-200);
    }
    .timeline-item:last-child::after { display: none; }
    .timeline-status { font-size: 14px; font-weight: 600; line-height: 20px; color: var(--gray-900); }
    .timeline-step { font-size: 12.5px; line-height: 18px; color: var(--gray-500); }
    .timeline-remarks { margin-top: 4px; font-size: 13px; line-height: 1.45; color: var(--gray-700); white-space: pre-line; }
    .timeline-when { display: block; margin-top: 2px; font-size: 12px; line-height: 18px; color: var(--gray-500); font-variant-numeric: tabular-nums; }
  `],
  template: `
    @if (app(); as a) {
      <div class="page">
        <app-back-link fallback="/applications" fallbackLabel="My Applications" />
        <div class="page-header">
          <div>
            <div class="page-title-row">
              <h1>{{ a.permitType }}</h1>
              <app-status-pill [label]="applicantStatusLabel(a.lifecycleStatus)" />
            </div>
            <div class="subtitle">{{ a.applicationNumber }} · {{ applyingAsLabel(a) }} · {{ a.applicationAction }}</div>
            @if (a.relatedPermitNumber) {
              <div class="small muted">
                {{ a.applicationAction === 'Renewal' ? 'Renewing' : 'Amending' }} permit
                <strong>{{ a.relatedPermitNumber }}</strong>
              </div>
            }
          </div>
        </div>

        <!--
          Where it stands, full width; then two columns when there is room:
          what was filed (details, documents, fees) and a right rail (the
          permit, how it reaches the citizen, the timeline). Each column is a
          stack, so every section is 16px from the next.
        -->
        <div class="stack">
          <div class="card status-card">
            <!--
              A withdrawn, rejected or expired application has no progress to
              show: it read "Cancelled · 100%" under a full bar (QA TC-34,
              2026-10-03). It says how it ended, and when, instead.
            -->
            @if (closedAs(a.lifecycleStatus); as closed) {
              <div class="callout" [class]="closed.tone">
                <strong class="callout-title">{{ closed.title }}</strong>
                <p>
                  @if (closedOn(a.lifecycleStatus); as on) { {{ closed.verb }} on {{ formatDate(on) }}. }
                  {{ closed.detail }}
                </p>
              </div>
            } @else {
              <!-- Where it stands, in the five stages a citizen follows (display only; see STAGE_OF). -->
              @let stage = stageIndex(a.lifecycleStatus);
              @if (stage >= 0) {
                <app-stepper [steps]="stages" [current]="stage" label="Application progress" />
              }

              <!-- Next step: the one thing this status asks of the citizen, right under the tracker. -->
              @switch (nextKind(a)) {
                @case ('revision') {
                  <div class="callout callout-warning" role="region" aria-label="Send back to the office">
                    <strong class="callout-title">
                      {{ returnedNotReplaced().length === 0 ? 'Ready to send back' : 'The office returned this application' }}
                    </strong>
                    @if (letters().length > 0) {
                      <div class="revision-remarks">
                        <div class="small muted revision-remarks-title">What the office needs from you</div>
                        @for (letter of letters(); track letter.letterId) {
                          @for (item of letter.items; track item.id) {
                            <div class="revision-remark">
                              <p>{{ item.remark }}</p>
                              <div class="small muted">Sent {{ formatDateTime(letter.issuedAt) }}</div>
                            </div>
                          }
                        }
                      </div>
                    }
                    @if (returnedNotReplaced().length === 0) {
                      <p>
                        When you have made the changes the office asked for (replace or add documents below), send the
                        application back so the office can continue evaluating it.
                      </p>
                    } @else {
                      <p>
                        Replace {{ returnedNotReplaced().length === 1 ? 'the returned document' : 'the ' + returnedNotReplaced().length + ' returned documents' }}
                        below ({{ returnedNotReplacedNames() }}), then send the application back to the office.
                      </p>
                    }
                    <div class="callout-actions">
                      <button class="btn btn-primary btn-sm" [disabled]="sendingBack() || returnedNotReplaced().length > 0" (click)="sendBack(a.id)">
                        {{ sendingBack() ? 'Sending…' : 'Send back to the office' }}
                      </button>
                      @if (returnedNotReplaced().length > 0) {
                        <button type="button" class="btn btn-secondary btn-sm" (click)="scrollToCard('application-documents')">Go to documents</button>
                      }
                    </div>
                  </div>
                }
                @case ('pay') {
                  @let due = fees();
                  <div class="callout callout-warning">
                    <strong class="callout-title">Pay {{ pesos(due?.balanceCentavos ?? 0) }} to continue</strong>
                    <p>
                      {{ store.nextStepText(a.lifecycleStatus) }}
                      @if (due?.dueDate) { Pay on or before {{ formatDate(due?.dueDate ?? null) }}. }
                    </p>
                    <div class="callout-actions">
                      <a class="btn btn-primary btn-sm" [routerLink]="['/payments', a.id]">Pay Now</a>
                    </div>
                  </div>
                }
                @case ('delivery') {
                  @let d = deliveryState()?.delivery;
                  <div class="callout" [class]="d?.status === 'delivered' ? 'callout-success' : 'callout-violet'">
                    <strong class="callout-title">
                      {{ d?.status === 'delivered' ? 'The courier delivered your permit' : 'Your permit is on its way' }}
                    </strong>
                    <p>
                      {{ d?.status === 'delivered' ? 'Confirm once the permit is in your hands.' : store.nextStepText(a.lifecycleStatus) }}
                    </p>
                    @if (d?.trackingNumber) {
                      <p class="next-step-facts">
                        Tracking no. <strong>{{ d?.trackingNumber }}</strong>@if (d?.courier) { · {{ d?.courier }} }
                      </p>
                    }
                    @if (deliveryState()?.canConfirmReceipt) {
                      <div class="callout-actions">
                        <button type="button" class="btn btn-primary btn-sm" (click)="confirmReceipt()">I received my permit</button>
                      </div>
                    }
                  </div>
                }
                @case ('returned') {
                  <div class="callout callout-warning">
                    <strong class="callout-title">The courier brought your permit back</strong>
                    <p>Claim it at the office, or ask for delivery again.</p>
                    <div class="callout-actions">
                      <button type="button" class="btn btn-secondary btn-sm" (click)="scrollToCard('permit-delivery-card')">See your options</button>
                    </div>
                  </div>
                }
                @case ('collect') {
                  <div class="callout callout-success">
                    <strong class="callout-title">Your permit is ready to collect</strong>
                    <p>{{ store.nextStepText(a.lifecycleStatus) }}</p>
                    <div class="callout-actions">
                      <button type="button" class="btn btn-secondary btn-sm" (click)="scrollToCard('your-permit')">Where and when to collect it</button>
                    </div>
                  </div>
                }
                @default {
                  <div class="callout" [class]="nextTone(a.lifecycleStatus)">
                    <strong class="callout-title">{{ a.lifecycleStatus === 'Completed' || a.lifecycleStatus === 'Released' ? 'All done' : 'Next step' }}</strong>
                    <p>{{ store.nextStepText(a.lifecycleStatus) }}</p>
                  </div>
                }
              }
            }

            @if (!isTerminal(a.lifecycleStatus) && !store.isReal(a.id)) {
              <div class="demo-row">
                <button class="btn btn-secondary btn-sm" (click)="advance(a.id)">Demo: Simulate Office Update</button>
                <span class="small muted">No backend exists yet — this simulates the reviewing office advancing your application.</span>
              </div>
            }

            <!-- Withdrawing is possible, not the point of the page: a quiet button at the foot of the card. -->
            @if (canCancel(a)) {
              <div class="withdraw-row">
                @if (!confirmingCancel()) {
                  <button class="btn btn-danger-outline btn-sm" (click)="confirmingCancel.set(true)">Withdraw application</button>
                  <span class="small muted">
                    Available while your application waits to be received, or while it is returned to you for changes.
                  </span>
                } @else {
                  <div class="callout callout-danger">
                    <strong class="callout-title">Withdraw {{ a.applicationNumber }}?</strong>
                    <p>The Municipality stops processing it and this cannot be undone. You would need to file a new application.</p>
                    <div class="callout-actions">
                      <button class="btn btn-secondary btn-sm" [disabled]="cancelling()" (click)="confirmingCancel.set(false)">Keep my application</button>
                      <button class="btn btn-danger btn-sm" [disabled]="cancelling()" (click)="cancel(a.id)">
                        {{ cancelling() ? 'Withdrawing…' : 'Yes, withdraw it' }}
                      </button>
                    </div>
                  </div>
                }
              </div>
            }
          </div>

          <div class="detail-layout">
            <div class="detail-main stack">
              <!-- What the citizen entered in the Details step (QA TC-23): staff saw it, the citizen never did. -->
              @if (projectDetails(a); as details) {
                <div class="card">
                  <div class="card-title">Project details</div>
                  <dl class="kv">
                    @for (row of details; track row.label) {
                      <div [class.kv-wide]="row.wide"><dt>{{ row.label }}</dt><dd style="white-space:pre-line;">{{ row.value }}</dd></div>
                    }
                  </dl>
                </div>
              }

              <!-- Sent and still-needed documents, one row each: icon, name over file, chip, action. -->
              <div class="card" id="application-documents">
                <div class="card-title">Documents</div>
                @if (contractDocs().length > 0 || missingRequired().length === 0) {
                  <app-application-documents
                    [documents]="contractDocs()"
                    [returned]="a.lifecycleStatus === 'Revision Required'"
                    (replace)="onReplace($event)"
                    (preview)="onPreview($event)"
                  />
                }
                @if (missingRequired().length > 0) {
                  <div class="doc-subhead">
                    <span class="doc-subhead-title">{{ a.lifecycleStatus === 'Revision Required' ? 'Add a document' : 'Still needed' }}</span>
                    <span class="small muted">
                      {{ a.lifecycleStatus === 'Revision Required'
                        ? 'Documents not yet on this application. Add any the office asked for.'
                        : 'The Municipality still needs these to continue reviewing your application.' }}
                    </span>
                  </div>
                  <ul class="doc-list">
                    @for (req of missingRequired(); track req.id) {
                      <li class="doc-row">
                        <span class="doc-icon doc-icon--missing" aria-hidden="true"></span>
                        <div class="doc-main">
                          <div class="doc-name">{{ req.label }}</div>
                          @if (blankFormFor(req.id, req.label); as form) {
                            <div class="doc-sub">
                              Blank form: {{ form.label }} &middot;
                              <a [href]="form.fileName" target="_blank" rel="noopener">View</a> &middot;
                              <a [href]="form.fileName" [attr.download]="form.downloadName">Download</a>
                            </div>
                          } @else {
                            <div class="doc-sub">Not sent yet</div>
                          }
                        </div>
                        <span class="tag">{{ req.required ? 'Required' : 'Optional' }}</span>
                        <div class="doc-actions">
                          <input
                            type="file"
                            class="doc-upload-input"
                            [attr.id]="'missing-doc-' + req.id"
                            accept=".pdf,.jpg,.jpeg,.png"
                            [disabled]="uploadingMissingId() === req.id"
                            (change)="attachMissing(req, $event)"
                          />
                          <label
                            [attr.for]="'missing-doc-' + req.id"
                            class="btn btn-secondary btn-sm"
                            style="cursor:pointer;"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>
                            {{ uploadingMissingId() === req.id ? 'Sending…' : 'Choose file' }}
                          </label>
                        </div>
                      </li>
                    }
                  </ul>
                }
                @if (previewing(); as p) {
                  <app-document-preview
                    [file]="p.file"
                    [fileName]="p.fileName"
                    [fileType]="p.fileType"
                    [label]="p.label"
                    [seeded]="p.file === null"
                    (close)="previewing.set(null)"
                  />
                }
              </div>

              @if (fees(); as asmt) {
                <div class="card">
                  <div class="card-title">Assessment (Order of Payment){{ asmt.opsNumber ? ' · ' + asmt.opsNumber : '' }}</div>
                  @if (asmt.dueDate) {
                    <p class="small muted fees-due">Pay on or before <strong>{{ formatDate(asmt.dueDate) }}</strong>.</p>
                  }
                  <table class="table">
                    <thead><tr><th>Fee</th><th class="num">Amount</th></tr></thead>
                    <tbody>
                      @for (line of asmt.lineItems; track line.code) {
                        <tr><td>{{ line.name }}</td><td class="num">{{ line.amountCentavos !== null ? pesos(line.amountCentavos) : 'Pending' }}</td></tr>
                      }
                    </tbody>
                    <tfoot>
                      <tr><td>Total</td><td class="num">{{ pesos(asmt.totalCentavos) }}</td></tr>
                      <tr>
                        <td>Balance</td>
                        <td class="num">{{ pesos(asmt.balanceCentavos) }}@if (asmt.pendingVerification) { — pending verification }</td>
                      </tr>
                    </tfoot>
                  </table>
                  <!-- Pay sits in the Next step callout when that is the step; here only otherwise. -->
                  @if ((asmt.canPay && nextKind(a) !== 'pay') || asmt.opsNumber) {
                    <div class="card-actions">
                      @if (asmt.canPay && nextKind(a) !== 'pay') {
                        <a class="btn btn-primary btn-sm" [routerLink]="['/payments', a.id]">Pay Now</a>
                      }
                      @if (asmt.opsNumber) {
                        <a class="btn btn-secondary btn-sm" [routerLink]="['/payments', a.id, 'order']">Print Order of Payment</a>
                      }
                    </div>
                  }
                  @if (asmt.pendingVerification) {
                    <p class="small muted" style="margin:12px 0 0;">Your payment is waiting for the Cashier to verify it.</p>
                  }
                </div>
              }
            </div>

            <div class="detail-rail stack">
              <!-- Your permit: only once a permit can exist (it said "No permit has been issued" from the day of filing). -->
              @if (!closedAs(a.lifecycleStatus) && permitCanExist(a.lifecycleStatus)) {
                <app-permit-release
                  id="your-permit"
                  [permitNumber]="permit()?.permitNumber ?? null"
                  [issuedDate]="permit() ? formatDate(permit()!.issuedDate) : null"
                  [release]="release()"
                  [byCourier]="byCourier()"
                  [loading]="permitLoading()"
                >
                  @if (permit(); as p) {
                    @if (!permitLoading()) {
                      <dl class="kv permit-facts">
                        <div><dt>Valid until</dt><dd>{{ p.expiryDate ? formatDate(p.expiryDate) : 'Not recorded by the office' }}</dd></div>
                        <div><dt>Approving office</dt><dd>{{ p.approvingOffice ?? 'Not on file' }}</dd></div>
                      </dl>
                      <div class="card-actions">
                        <a class="btn btn-primary btn-sm" [routerLink]="['/applications', a.id, 'permit']">Preview permit</a>
                      </div>
                    }
                  }
                </app-permit-release>
              }
              <!-- Pick up or delivery by courier (migration 070). -->
              @if (!closedAs(a.lifecycleStatus)) {
                @if (deliveryState(); as delivery) {
                  <app-permit-delivery
                    [applicationId]="a.id"
                    [state]="delivery"
                    [permitNumber]="permit()?.permitNumber ?? null"
                    (stateChange)="deliveryState.set($event)"
                    (received)="onPermitReceived($event)"
                  />
                }
              }

              <div class="card">
                <div class="card-title">Status timeline</div>
                @if (timelineNewestFirst().length === 0) {
                  <div class="empty-state empty-state--loading">
                    <span class="empty-state-title">No updates yet</span>
                    <p>Each step the office takes on your application shows here.</p>
                  </div>
                } @else {
                  <ol class="timeline">
                    @for (t of timelineNewestFirst(); track t.timestamp; let first = $first) {
                      <li class="timeline-item" [class.timeline-latest]="first">
                        <!-- In the pill's words; the office's own step name under it when it differs. -->
                        <div class="timeline-status">{{ timelineLabel(t.status) }}</div>
                        @if (timelineStep(t.status); as step) {
                          <div class="timeline-step">{{ step }}</div>
                        }
                        @if (t.remarks) {
                          <div class="timeline-remarks">{{ t.remarks }}</div>
                        }
                        <time class="timeline-when" [attr.datetime]="t.timestamp">{{ formatDateTime(t.timestamp) }}</time>
                      </li>
                    }
                  </ol>
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    } @else {
      <div class="page">
        <div class="card empty-state empty-state--search">
          <span class="empty-state-title">Application not found</span>
          <p>It may not belong to your account, or the link may be out of date.</p>
          <a routerLink="/applications" class="btn btn-secondary">Back to My Applications</a>
        </div>
      </div>
    }
  `,
})
export class ApplicationDetailsPage {
  /** The blank form a missing document asks the citizen to sign and upload, if it is one. */
  protected readonly blankFormFor = blankFormFor;
  private readonly route = inject(ActivatedRoute);
  protected readonly store = inject(ApplicationStore);
  private readonly toast = inject(ToastService);
  private readonly resubmission = inject(DocumentResubmissionService);
  protected readonly api = inject(CitizenApiClient);

  protected readonly applicantStatusOf = applicantStatusOf;
  protected readonly applicantStatusLabel = applicantStatusLabel;
  /** "Residential", or the business's name (migration 067). */
  protected readonly applyingAsLabel = applyingAsLabel;
  protected readonly formatDate = formatDate;
  protected readonly formatDateTime = formatDateTime;
  protected readonly pesos = pesos;

  private id(): string {
    return this.route.snapshot.paramMap.get('id')!;
  }

  app() {
    return this.store.applicationById(this.id());
  }

  docs() {
    return this.store.documentsFor(this.id());
  }

  /**
   * Real documents, from `GET /applications/{id}/documents` — already built
   * (`CitizenApiClient.listDocuments`) since before this connection work
   * began, just never called from here. `null` means "not fetched" (or the
   * id belongs to a local demo application, which 404s harmlessly against
   * the real backend and is left to fall back to `docs()`); `contractDocs()`
   * below prefers this the moment it is non-null, the same "real once
   * fetched" pattern `ApplicationStore.myApplications` uses.
   */
  private readonly realDocuments = signal<ApplicationDocumentResponse[] | null>(null);

  /**
   * Real history, from `GET /applications/{id}/timeline` — same "fetch once,
   * prefer if present" shape as `realDocuments` above. Added alongside the
   * `advanceForDemo` gating fix: before this, a real application's Status
   * Timeline silently showed nothing (the page only ever read the local demo
   * `timelineByApp` map), which was mistakeable for "the office hasn't acted
   * yet" rather than "this view was never wired to the real endpoint."
   */
  private readonly realTimeline = signal<TimelineEntryResponse[] | null>(null);

  /**
   * Documents the office returned (Revision Required or Rejected) that no
   * newer upload replaces yet — the same test the server's
   * `returned-documents-replaced` precondition applies before it lets the
   * application go back.
   */
  protected returnedNotReplaced(): ApplicationDocumentResponse[] {
    return (this.realDocuments() ?? []).filter((d) =>
      (d.reviewStatus === 'Revision Required' || d.reviewStatus === 'Rejected') && d.supersededByDocumentId === null);
  }
  protected returnedNotReplacedNames(): string {
    return this.returnedNotReplaced().map((d) => d.label).join(', ');
  }

  protected readonly sendingBack = signal(false);

  async sendBack(id: string): Promise<void> {
    this.sendingBack.set(true);
    try {
      const result = await this.store.sendBackReal(id);
      if (!result.ok) {
        this.toast.error(result.error);
        return;
      }
      this.refreshTimeline();
      this.refreshDocuments();
      this.refreshLetters();
      this.toast.success('Sent back to the office for evaluation.');
    } finally {
      this.sendingBack.set(false);
    }
  }

  /** Re-fetches the document list after a write that changes it (a replacement, a send-back). */
  private refreshDocuments(): void {
    this.api.listDocuments(this.id()).subscribe({
      next: (docs) => this.realDocuments.set(docs),
      error: () => {},
    });
  }

  constructor() {
    if (this.api.configured) {
      this.api.listDocuments(this.id()).subscribe({
        next: (docs) => this.realDocuments.set(docs),
        // A local demo application id 404s against the real backend — expected,
        // not an error worth surfacing. Leaves realDocuments null, so
        // contractDocs() falls back to the local demo data below.
        error: () => {},
      });
      this.refreshTimeline();
      this.refreshLetters();
      // The permit is asked for only once one can exist, and again when the
      // status moves (the release details change at Ready for Release). Asking
      // on every visit got "not found" in the browser console for every
      // application not yet at that point (6 Oct 2026 live test).
      let fetchedFor: string | null = null;
      effect(() => {
        const status = this.app()?.lifecycleStatus;
        if (status === undefined || !PERMIT_STATUSES.has(status) || status === fetchedFor) return;
        fetchedFor = status;
        untracked(() => this.store.fetchPermit(this.id()));
      });
      // How the permit reaches the citizen (migration 070): read when the
      // page opens and when the status moves, and on every refresh of the
      // list while the permit is with the courier — the office marking it
      // delivered moves no status, and the citizen should see it.
      let deliveryFor: string | null = null;
      effect(() => {
        const status = this.app()?.lifecycleStatus;
        if (status === undefined || this.closedAs(status) !== null) return;
        const withCourier = untracked(() => {
          const d = this.deliveryState()?.delivery;
          return d?.status === 'out-for-delivery' || d?.status === 'delivered';
        });
        if (status === deliveryFor && !withCourier) return;
        deliveryFor = status;
        untracked(() => this.refreshDelivery());
      });
    }
    // Side-effecting on purpose (writes the store's real-checklist cache) —
    // must live in an effect(), never inside `missingRequired` itself,
    // which is a computed() and has to stay pure. Skips 'Business Permit'
    // the same way `missingRequired` already does below.
    effect(() => {
      const permitType = this.app()?.permitType;
      if (permitType && permitType !== 'Business Permit') {
        this.store.ensureRequiredDocumentsLoaded(permitType);
      }
    });
  }

  /**
   * The office's reason for returning the application, from its open Letter
   * of Instruction (the Return for Revision remark). Shown in the Send Back
   * card; sending back answers it.
   */
  protected readonly letters = signal<InstructionLetter[]>([]);
  protected readonly confirmingCancel = signal(false);

  private refreshLetters(): void {
    if (!this.api.configured) return;
    this.api.getInstructions(this.id()).subscribe({
      next: (letters) => this.letters.set(letters),
      error: () => {},
    });
  }

  /**
   * The fee card, from the real Order of Payment (`GET /applications`'s
   * `payment.orderOfPayment`). It used to read only the local demo store, so
   * a real application said "Please view your assessment" with nothing to
   * view (found live 2026-09-27). Falls back to the demo store for a demo id.
   */
  protected fees(): {
    lineItems: { code: string; name: string; amountCentavos: number | null }[];
    totalCentavos: number; balanceCentavos: number; opsNumber: string | null;
    canPay: boolean; pendingVerification: boolean; dueDate: string | null;
  } | null {
    const a = this.app();
    const real = this.store.orderOfPaymentFor(this.id());
    if (a && real) {
      const paid = a.paymentStatus === 'Paid';
      return {
        lineItems: [
          { code: 'filing', name: 'Filing Fee', amountCentavos: real.fees.filing },
          { code: 'processing', name: 'Processing Fee', amountCentavos: real.fees.processing },
          { code: 'architectural', name: 'Architectural Fee', amountCentavos: real.fees.architectural },
          { code: 'structural', name: 'Structural Fee', amountCentavos: real.fees.structural },
          { code: 'electrical', name: 'Electrical Fee', amountCentavos: real.fees.electrical },
          { code: 'others', name: 'Other Fees', amountCentavos: real.fees.others },
        // Only the fees that apply: ₱0.00 lines beside the real ones read as charges (QA TC-05).
        ].filter((line) => line.amountCentavos > 0),
        totalCentavos: real.totalCentavos,
        dueDate: real.dueDate ?? null,
        balanceCentavos: paid ? 0 : real.totalCentavos,
        opsNumber: real.number,
        canPay: a.paymentStatus === 'Not Yet Available' || a.paymentStatus === 'Overdue',
        pendingVerification: a.paymentStatus === 'Pending Verification',
      };
    }
    const demo = this.assessment();
    if (!demo) return null;
    return {
      lineItems: demo.lineItems, totalCentavos: demo.totalCentavos, balanceCentavos: demo.balanceCentavos,
      opsNumber: demo.opsNumber, canPay: demo.balanceCentavos > 0, pendingVerification: false, dueDate: null,
    };
  }

  /**
   * How a closed application ended, for the card that replaces its progress
   * bar (QA TC-34); null while it is still open.
   */
  protected closedAs(status: string): { title: string; verb: string; detail: string; tone: string } | null {
    switch (status) {
      case 'Cancelled':
        return {
          title: 'Withdrawn', verb: 'Withdrawn', tone: 'callout-neutral',
          detail: 'The Municipality will not process this application further. You can file a new application at any time.',
        };
      case 'Rejected':
        return {
          title: 'Not approved', verb: 'Rejected', tone: 'callout-danger',
          detail: 'The office\'s reasons are on the timeline below. You can file a new application at any time.',
        };
      case 'Expired':
        return {
          title: 'Expired', verb: 'Expired', tone: 'callout-danger',
          detail: 'This application lapsed without being completed. You can file a new application at any time.',
        };
      default:
        return null;
    }
  }

  /** When the application reached its closing status, from its own timeline. */
  protected closedOn(status: string): string | null {
    const entries = this.realTimeline() ?? [];
    const last = [...entries].reverse().find((entry) => entry.status === status);
    return last?.occurredAt ?? null;
  }

  /** The Details step's answers, labelled; null when none were given. */
  protected projectDetails(a: ApplicationRecord): { label: string; value: string; wide: boolean }[] | null {
    const form = a.form ?? {};
    const text = (key: string): string => (typeof form[key] === 'string' ? (form[key] as string).trim() : '');
    // A residential application names the lot owner when the applicant is not
    // the owner (migration 067); nothing is shown when they own it themselves.
    const owner = a.applyingAs === 'residential' ? propertyOwnerOf(form) : null;
    const ownerText = owner !== null && owner.isApplicant === false && owner.name.trim()
      ? `${owner.name.trim()}${owner.relationship ? ` (${owner.relationship.trim()})` : ''}`
      : '';
    const rows = [
      { label: 'Property owner', value: ownerText, wide: false },
      { label: 'Project / property address', value: (a.location ?? '').trim(), wide: false },
      { label: 'Scope of work / purpose', value: text('scopeOfWork'), wide: true },
      { label: 'Professional in charge', value: text('professionalName'), wide: false },
      { label: 'PRC license no.', value: text('prcNumber'), wide: false },
    ].filter((row) => row.value !== '');
    return rows.length > 0 ? rows : null;
  }

  /** Re-fetches `realTimeline` after a real write on this application (e.g. `cancel()`) — otherwise the Status Timeline kept showing its pre-write history until the next full page reload. */
  private refreshTimeline(): void {
    this.api.getTimeline(this.id()).subscribe({
      next: (entries) => this.realTimeline.set(entries),
      error: () => {},
    });
  }

  /** `GET /applications/{id}/delivery` (migration 070): null until read, or when it cannot be (a local demo id). */
  protected readonly deliveryState = signal<PermitDeliveryState | null>(null);

  /** `GET /applications/{id}/delivery` has answered once, with a state or an error. */
  private readonly deliveryAnswered = signal(false);

  private refreshDelivery(): void {
    this.api.getDelivery(this.id()).subscribe({
      next: (state) => {
        this.deliveryState.set(state);
        this.deliveryAnswered.set(true);
      },
      error: () => this.deliveryAnswered.set(true),
    });
  }

  /**
   * Once a permit can exist, the Your permit card waits for both answers it
   * depends on: the permit (its number) and the delivery (whether it says
   * "Delivery by courier" or where to collect it).
   */
  protected permitLoading(): boolean {
    const status = this.app()?.lifecycleStatus;
    if (status === undefined || !PERMIT_STATUSES.has(status)) return false;
    return !this.store.permitAnsweredFor(this.id()) || !this.deliveryAnswered();
  }

  /**
   * The permit travels by courier: the Your permit card says so instead of
   * where and when to collect it. Not after the courier brought it back —
   * then the claim instructions apply again.
   */
  protected byCourier(): boolean {
    const state = this.deliveryState();
    return state?.receiveBy === 'delivery' && !!state.delivery && state.delivery.status !== 'returned';
  }

  /** "I received my permit" closed the application: its status, timeline and permit release all moved. */
  protected async onPermitReceived(state: PermitDeliveryState): Promise<void> {
    this.deliveryState.set(state);
    this.refreshTimeline();
    await this.store.refreshMine();
    this.store.fetchPermit(this.id());
  }

  /** The real `release` once fetched; the local-demo construction otherwise. See `ApplicationStore.releaseFor`. */
  protected release(): PermitRelease | null {
    return this.store.releaseFor(this.id());
  }

  /** The office's shape, so the documents view is written once against what the server sends. */
  protected contractDocs(): ApplicationDocumentResponse[] {
    const real = this.realDocuments();
    if (real !== null) return real;
    return this.docs().map(toContractShape);
  }

  /**
   * Replace a rejected document.
   *
   * The size is checked BEFORE the file is read, so a citizen with a 5MB scan
   * is told immediately rather than after their phone has encoded it. The
   * idempotency key is owned by the service: stable if they retry the same
   * file, new if they pick a different one — the server treats the file as part
   * of the key's fingerprint and 409s a mismatch.
   */
  /** DOC-003. The document currently open for inspection, or null. */
  protected readonly previewing = signal<PreviewableDocument | null>(null);

  /**
   * Resolve the contract shape back to the file this build kept.
   *
   * The server's document response describes a document; it does not contain
   * one. `contractDocs()` prefers `realDocuments()` the moment it is fetched,
   * so once that has loaded, every id "Preview" is clicked with belongs to
   * the real backend, not the local demo store — looking it up in `docs()`
   * (as this used to, unconditionally) always missed, because a
   * server-generated UUID never matches a seeded demo id, and silently did
   * nothing. Fetches the real signed URL the same way
   * `application-wizard.page.ts`'s `reuseExisting()` already does, and falls
   * back to the local demo lookup only when nothing real was ever fetched.
   */
  protected async onPreview(doc: ApplicationDocumentResponse): Promise<void> {
    if (this.realDocuments() === null) {
      const local = this.docs().find((d) => d.id === doc.id);
      this.previewing.set(local ? { file: local.file, fileName: local.fileName, fileType: local.fileType, label: local.label } : null);
      return;
    }
    try {
      const { url } = await firstValueFrom(this.api.getDocumentContent(doc.id));
      const response = await fetch(url);
      if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
      const blob = await response.blob();
      const file = new File([blob], doc.fileName, { type: blob.type || doc.contentType });
      this.previewing.set({ file, fileName: doc.fileName, fileType: fileTypeFromName(doc.fileName), label: doc.label });
    } catch {
      this.toast.error(`Could not open "${doc.label}". Try again.`);
    }
  }

  /**
   * Required documents this application's own real document list has no
   * match for, by label rather than id — `requiredDocumentsFor` now prefers
   * the real, live checklist (`GET /requirements/{permitType}`, warmed by
   * the `effect()` in the constructor above) the moment it loads, but a
   * citizen's already-uploaded document was matched against whatever id
   * scheme was live at UPLOAD time, which may have been the static
   * fallback. Label is the one thing both id schemes originate from the
   * same source for, so it's still what actually matches an upload here,
   * same as before this fetch existed.
   *
   * A document that exists but was Rejected/Revision Required is NOT
   * missing — it already has its own "Replace this document" action above.
   * This only covers a requirement nothing has ever been sent for.
   */
  protected readonly missingRequired = computed<RequirementDocument[]>(() => {
    const a = this.app();
    // 'Business Permit' is a PublishedPermitType with no requirements-catalog
    // entry of its own (see permit.model.ts) — the same reason the wizard's
    // own carry-over logic (application-wizard.page.ts) guards against it
    // before ever calling `requiredDocumentsFor`.
    if (!a || a.permitType === 'Business Permit') return [];
    // Past Document Verification nothing more can be added: no "Choose file" rows then.
    if (!DOCUMENTS_OPEN.has(a.lifecycleStatus)) return [];
    // While the office has the application returned, optional documents are
    // offered too: "add the lot owner's written consent" is an optional
    // requirement the office can still ask for (found live 2026-09-27).
    const revising = a.lifecycleStatus === 'Revision Required';
    const wanted = this.store.requiredDocumentsFor(a.permitType).filter((d) => d.required || revising);
    const haveLabels = new Set(this.contractDocs().map((d) => d.label));
    return wanted.filter((d) => !haveLabels.has(d.label));
  });

  protected readonly uploadingMissingId = signal<string | null>(null);

  /**
   * First-time attach for a requirement nothing has been sent for yet —
   * `POST /documents` with THIS application's real id, now that the
   * backend actually checks the applicant owns it (see
   * `DocumentsController.upload`'s own ownership check). `requirementCode`
   * is `req.id` only once the store's real checklist has actually loaded
   * for this permit type — sending the static fallback's id as one is a
   * real, honest server refusal (see `ApplicationStore.hasRealRequiredDocuments`).
   */
  protected async attachMissing(req: RequirementDocument, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (this.resubmission.tooLarge(file)) {
      this.toast.error(this.resubmission.explain(new Error('')) || 'That file is too large.');
      input.value = '';
      return;
    }
    this.uploadingMissingId.set(req.id);
    try {
      const contentBase64 = await toBase64(file);
      const permitType = this.app()?.permitType;
      const requirementCode =
        permitType && permitType !== 'Business Permit' && this.store.hasRealRequiredDocuments(permitType)
          ? req.id
          : null;
      const send = (reuseOf: string | null): void => {
        this.api.uploadDocument({
          fileName: file.name, label: req.label, applicationId: this.id(), requirementCode, contentBase64, reuseOf,
        }).subscribe({
          next: () => {
            this.toast.success(`"${req.label}" sent.`);
            this.api.listDocuments(this.id()).subscribe({
              next: (docs) => this.realDocuments.set(docs),
              error: () => {},
            });
          },
          error: (e) => {
            // A file they already have in My Documents: send their copy
            // instead of storing the same file a second time.
            const existing = duplicateOf(e);
            if (existing !== null && reuseOf === null) {
              this.toast.show(`You already had "${existing.fileName}" in My Documents, so that copy was used.`);
              send(existing.id);
              return;
            }
            this.toast.error(this.resubmission.explain(e));
            this.uploadingMissingId.set(null);
          },
          complete: () => this.uploadingMissingId.set(null),
        });
      };
      send(null);
    } catch {
      this.toast.error(`Could not send "${req.label}". Try again.`);
      this.uploadingMissingId.set(null);
    } finally {
      input.value = '';
    }
  }

  protected onReplace(doc: ApplicationDocumentResponse): void {
    if (!this.api.configured) {
      this.toast.show(
        `Replacing "${doc.label}" is not available in this build — the Municipality's system is not connected yet.`,
      );
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.jpg,.jpeg,.png';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (this.resubmission.tooLarge(file)) {
        this.toast.error(this.resubmission.explain(new Error('')) || 'That file is too large.');
        return;
      }
      this.resubmission.resubmit(this.id(), doc.id, doc.label, file).subscribe({
        next: (result) => {
          // Metadata stripped from the file is reported, never silently
          // dropped: a site photograph carries its coordinates and the
          // applicant is entitled to know the LGU removed them.
          const stripped = result.removedMetadata.length
            ? ` ${result.removedMetadata.join(', ')} was removed from the file.`
            : '';
          this.toast.success(`Replacement sent for "${doc.label}".${stripped}`);
          // Without this the list kept showing the returned file as current
          // until a reload, so "Send Back to the Office" stayed disabled.
          this.refreshDocuments();
        },
        error: (e) => this.toast.error(this.resubmission.explain(e)),
      });
    };
    input.click();
  }


  assessment() {
    return this.store.assessmentFor(this.id());
  }

  permit() {
    return this.store.permitFor(this.id());
  }

  timeline() {
    return this.store.timelineFor(this.id());
  }

  /** Real timeline once fetched (mapped to the template's shape); local demo timeline otherwise. */
  protected timelineEntries(): { status: string; timestamp: string; remarks: string | null }[] {
    const real = this.realTimeline();
    if (real !== null) return real.map((t) => ({ status: t.status, timestamp: t.occurredAt, remarks: t.remarks }));
    return this.timeline();
  }

  /** The timeline newest first (equal times keep their newest-last order reversed); display only. */
  protected timelineNewestFirst(): { status: string; timestamp: string; remarks: string | null }[] {
    const time = (iso: string): number => Date.parse(iso) || 0;
    const sorted = [...this.timelineEntries()].reverse().sort((x, y) => time(y.timestamp) - time(x.timestamp));
    // Back-to-back office steps the citizen sees under one word (Received, Document Verification and Under
    // Evaluation all read "Under Review") show once: the newest. An entry with the office's remarks always stays.
    return sorted.filter((t, i) => i === 0 || !!t.remarks
      || this.timelineLabel(t.status) !== this.timelineLabel(sorted[i - 1].status));
  }

  /** A timeline entry in the pill's words ("Under Evaluation" reads "Under Review"); display only. */
  protected timelineLabel(status: string): string {
    return applicantStatusLabel(status as ApplicationLifecycleStatus);
  }

  /** The office's own name for the step, when the pill's word differs from it; null when it is the same. */
  protected timelineStep(status: string): string | null {
    return this.timelineLabel(status) === status ? null : status;
  }

  isTerminal(status: Parameters<typeof isTerminalStatus>[0]): boolean {
    return isTerminalStatus(status);
  }

  protected readonly stages = STAGES;

  /** The stage in progress (see STAGE_OF); STAGES.length when all are done, -1 for a status the portal does not know. */
  protected stageIndex(status: ApplicationLifecycleStatus): number {
    return STAGE_OF[status] ?? -1;
  }

  /**
   * The Next step callout's one action, in this order: send back a returned
   * application, pay, confirm a courier delivery, deal with a returned
   * parcel, collect a ready permit; otherwise only what happens next.
   */
  protected nextKind(a: ApplicationRecord): NextKind {
    if (a.lifecycleStatus === 'Revision Required' && this.api.configured) return 'revision';
    if (this.fees()?.canPay) return 'pay';
    const state = this.deliveryState();
    const delivery = state?.receiveBy === 'delivery' ? state.delivery : null;
    if (delivery && (delivery.status === 'out-for-delivery' || delivery.status === 'delivered')) return 'delivery';
    if (delivery && delivery.status === 'returned' && state?.canChange) return 'returned';
    if (a.lifecycleStatus === 'Ready for Release' && !this.byCourier() && this.release()?.status === 'Ready for Release') {
      return 'collect';
    }
    return 'info';
  }

  /** The plain Next step callout takes the status pill's tone. */
  protected nextTone(status: ApplicationLifecycleStatus): string {
    return `callout-${statusTone(applicantStatusLabel(status))}`;
  }

  /** "Your permit" shows once a permit can exist, not from the day of filing. */
  protected permitCanExist(status: ApplicationLifecycleStatus): boolean {
    return PERMIT_STATUSES.has(status) || !!this.permit();
  }

  private readonly deliveryCard = viewChild(PermitDeliveryComponent);

  /** "I received my permit" in the Next step callout opens the same confirmation on the delivery card. */
  protected confirmReceipt(): void {
    this.deliveryCard()?.askToConfirm();
  }

  /** Brings a card on this page into view (the Next step callout's links). */
  protected scrollToCard(id: string): void {
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  advance(id: string): void {
    this.store.advanceForDemo(id);
    const updated = this.store.applicationById(id);
    if (updated) this.toast.success(`Status updated: ${applicantStatusOf(updated.lifecycleStatus)}.`);
  }

  /**
   * The real lifecycle table (`lifecycle.ts`) only ever grants the
   * APPLICANT actor a `-> Cancelled` transition from four statuses: Draft,
   * Submitted, Received, and Revision Required. `Document Verification` and
   * `Under Evaluation` both precede an Order of Payment too (so the old
   * `assessedAmountCentavos === null` check alone let the button show for
   * them) but have no applicant-cancel transition at all — the server
   * refuses with a 409 every time, previously with nothing but a toast the
   * citizen could easily miss to explain why. Listing the real four
   * statuses here — instead of inferring eligibility from unrelated fields
   * — means the button simply isn't offered where it could never work.
   */
  private static readonly APPLICANT_CANCELLABLE_STATUSES: ReadonlySet<ApplicationLifecycleStatus> = new Set([
    'Draft',
    'Submitted',
    'Received',
    'Revision Required',
  ]);

  protected canCancel(a: { assessedAmountCentavos: number | null; lifecycleStatus: ApplicationLifecycleStatus }): boolean {
    return (
      this.api.configured &&
      a.assessedAmountCentavos === null &&
      ApplicationDetailsPage.APPLICANT_CANCELLABLE_STATUSES.has(a.lifecycleStatus)
    );
  }

  protected readonly cancelling = signal(false);

  async cancel(id: string): Promise<void> {
    this.cancelling.set(true);
    try {
      const result = await this.store.cancelReal(id);
      if (!result.ok) {
        this.toast.error(result.error);
        return;
      }
      this.refreshTimeline();
      this.confirmingCancel.set(false);
      this.toast.success('Application withdrawn.');
    } finally {
      this.cancelling.set(false);
    }
  }
}
