import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import qrcodegen from 'qrcode-generator';
import { ApplicationStore } from '../../core/stores/application.store';
import { BusinessStore } from '../../core/stores/business.store';
import { NOT_RECORDED, permitValidityText } from '../../core/domain/permit-validity';
import { addressLine, propertyRows } from '../../core/domain/property-address';
import { AuthService } from '../../core/session/auth.service';
import { agencyHeaderFor, documentTitleFor, issuingOfficeFor } from '../../core/domain/generated-document.helpers';
import { fullName } from '../../core/domain/user.model';
import { businessNameOnDocument } from '../../core/domain/application.model';
import { pesos } from '../../core/domain/assessment.model';
import { AssessmentView, assessmentViewOf } from '../../core/domain/assessment-view';
import { NO_CONDITIONS_NOTE, PERMIT_LABELS } from '../../core/domain/permit-fields';
import { formatDate, formatDateTime } from '../../core/utils/ids';
import { occupancyLabelOf } from '../../core/domain/occupancy';
import { CitizenApiClient } from '../../core/api/citizen-api.client';
import { BackLinkComponent } from '../../shared/ui/back-link.component';

type WatermarkText = 'SAMPLE — NOT AN OFFICIAL PERMIT';

interface QrCell {
  x: number;
  y: number;
}

/**
 * The applicant's own real, dynamic generated permit document — replaces
 * the old "Preview Permit Form" link, which just opened the blank official
 * PDF form (kept below as a separate "Blank Reference Form" link, since an
 * applicant may still want the empty form). Every value here comes from
 * this portal's own real stores (AuthService, ApplicationStore,
 * BusinessStore) — never invented. Fields this portal genuinely has no
 * source for (professionals, technical specs, equipment schedules — those
 * are staff-verified data that lives on the Admin Portal side only, and
 * these two apps share no backend) are simply not shown, rather than
 * padded out with a wall of permanent "Pending" placeholders.
 */
@Component({
  selector: 'app-permit-document',
  imports: [RouterLink, BackLinkComponent],
  template: `
    @if (app(); as a) {
      <div class="page" style="max-width:900px;">
        <div class="no-print doc-toolbar">
          <app-back-link [fallback]="'/applications/' + a.id" fallbackLabel="Application" />
          <button class="btn btn-primary btn-sm" (click)="print()">Print / Download</button>
        </div>

        @if (config(); as cfg) {
          <!-- .doc-scroll: on a phone the paper reflows, and anything still wider pans instead of being cut off (design review I1). -->
          <div class="doc-scroll">
          <article class="doc-generated-page">
            @if (watermarkText()) {
              <div class="doc-generated-watermark" aria-hidden="true">{{ watermarkText() }}</div>
            }

            <div class="doc-generated-header">
              <img src="logo.png" alt="" aria-hidden="true" />
              <div class="lines">
                <span>{{ cfg.header.line1 }}</span>
                <span>{{ cfg.header.line2 }}</span>
                @if (cfg.header.line3) {
                  <strong>{{ cfg.header.line3 }}</strong>
                }
                <span class="office-line">{{ cfg.header.officeLine }}</span>
              </div>
            </div>

            <div class="doc-generated-title">
              <h1>{{ cfg.title.title }}</h1>
              @if (cfg.title.subtitle) {
                <p class="subtitle">{{ cfg.title.subtitle }}</p>
              }
            </div>

            <!-- Every label below comes from PERMIT_LABELS, the field map the Admin Portal's preview prints too (design review I3). -->
            <div class="doc-generated-numberblock">
              <div class="num-main">
                <span class="num-label">{{ L.permitNo }}</span>
                <span class="num-value" [class.doc-generated-placeholder]="!permit()">
                  {{ permit()?.permitNumber ?? 'Not yet assigned' }}
                </span>
              </div>
              <div class="num-dates">
                <span>{{ L.applicationNo }}: <strong>{{ a.applicationNumber }}</strong></span>
                <span>{{ L.dateIssued }}: <strong>{{ permit()?.issuedDate ? formatDate(permit()!.issuedDate) : 'Not yet assigned' }}</strong></span>
                <span>{{ L.validUntil }}: <strong data-testid="permit-valid-until">{{ permit() ? validUntil(a.permitType, permit()!.expiryDate) : 'Not yet assigned' }}</strong></span>
              </div>
            </div>

            <section class="doc-generated-section">
              <!--
                "Owner / Applicant" STAYS, and is not swept into the CITIZEN
                vocabulary ruling. This heading mirrors BOX 1 of the LGU's own
                Unified Application Form for Building Permit, which reads
                "OWNER/APPLICANT" and treats Applicant, Owner and Licensed
                Architect / Civil Engineer as three distinct signing roles
                (BOX 3, BOX 4, BOX 5). "Citizen" names WHO uses this portal;
                "Applicant" names WHICH ROLE they signed a statutory form in,
                and one citizen may be the applicant without being the lot
                owner — see the "Owner's Written Consent (if applicant is not
                the lot owner)" requirement. Renaming this would misstate a
                legal document. Guarded by permit-document.page.spec.ts.
              -->
              <h2>Owner / Applicant</h2>
              <dl class="doc-generated-fields">
                <div>
                  <dt>{{ L.ownerName }}</dt>
                  <dd>{{ owner().name }}</dd>
                </div>
                <!-- Only a business application names a business: "Business / Project: Residential" stated a second use beside the occupancy (design review I6). -->
                @if (businessName(a); as name) {
                  <div>
                    <dt>{{ L.businessName }}</dt>
                    <dd>{{ name }}</dd>
                  </div>
                }
                <div>
                  <dt>{{ L.contactNumber }}</dt>
                  <dd>{{ owner().contact }}</dd>
                </div>
                <!-- The whole address, as the Admin Portal prints it; it printed the street alone. -->
                <div style="grid-column: 1 / -1;">
                  <dt>{{ L.address }}</dt>
                  <dd>{{ owner().address }}</dd>
                </div>
              </dl>
            </section>

            <section class="doc-generated-section">
              <h2>Property</h2>
              <!--
                Where the project is, printed once: the application's own site
                (location, from the wizard's Details step), else the business's
                registered address. It printed a Barangay row beside a Street /
                Location row that already named it (4 Nov 2026). See
                core/domain/property-address.ts.
              -->
              <dl class="doc-generated-fields">
                @for (row of propertyFields(); track row.label) {
                  <div [style.grid-column]="row.wide ? '1 / -1' : null">
                    <dt>{{ row.label }}</dt>
                    <dd>{{ row.value }}</dd>
                  </div>
                }
              </dl>
            </section>

            <section class="doc-generated-section">
              <h2>Project</h2>
              <dl class="doc-generated-fields">
                <div>
                  <dt>{{ L.applicationType }}</dt>
                  <dd>{{ a.applicationAction }}</dd>
                </div>
                <div>
                  <dt>{{ L.dateApplied }}</dt>
                  <dd>{{ a.dateSubmitted ? formatDate(a.dateSubmitted) : 'Pending' }}</dd>
                </div>
                <!-- As filed (ebpco-api 071): a Building Permit or Certificate of Occupancy; left out when absent. -->
                @if (occupancy(); as use) {
                  <div style="grid-column: 1 / -1;">
                    <dt>{{ L.occupancy }}</dt>
                    <dd>{{ use }}</dd>
                  </div>
                }
                @if (scope(); as sc) {
                  <div style="grid-column: 1 / -1;">
                    <dt>{{ L.scope }}</dt>
                    <dd>{{ sc }}</dd>
                  </div>
                }
              </dl>
            </section>

            <section class="doc-generated-section">
              <h2>Assessment / Payment</h2>
              <!-- The one assessment (core/domain/assessment-view.ts): fees, Total amount due, Balance, and the Order of Payment number. -->
              @if (assessment(); as asmt) {
                <table class="doc-generated-table">
                  <thead>
                    <tr><th>{{ L.fee }}</th><th class="num">{{ L.amount }}</th></tr>
                  </thead>
                  <tbody>
                    @for (line of asmt.lineItems; track line.code) {
                      <tr>
                        <td>{{ line.name }}</td>
                        <td class="num">{{ line.amountCentavos !== null ? pesos(line.amountCentavos) : 'Pending' }}</td>
                      </tr>
                    }
                    <tr>
                      <td><strong>{{ L.totalAmountDue }}</strong></td>
                      <td class="num"><strong>{{ pesos(asmt.totalCentavos) }}</strong></td>
                    </tr>
                    <tr>
                      <td>{{ L.balance }}</td>
                      <td class="num">{{ pesos(asmt.balanceCentavos) }}</td>
                    </tr>
                  </tbody>
                </table>
                <p class="doc-generated-note">{{ L.orderOfPaymentNo }}: {{ asmt.opsNumber ?? 'Not yet issued' }}</p>
              } @else {
                <p class="doc-generated-note doc-generated-placeholder">No assessment has been issued yet for this application.</p>
              }
            </section>

            <!--
              The office's conditions, in full and verbatim, from
              GET /applications/{id}/permit. Render every item; do not
              summarise, and never substitute our own (it once rendered a
              catalogue validity sentence we wrote). None recorded is stated
              as a fact, in normal ink: the grey-italic "this does not mean
              there are none" warning alarmed anyone shown the permit, and
              named a different office again (design review I3).
            -->
            <section class="doc-generated-section">
              <h2>Conditions</h2>
              @if (conditions().length) {
                <ol class="doc-generated-conditions">
                  @for (c of conditions(); track c) {
                    <li>{{ c }}</li>
                  }
                </ol>
              } @else {
                <p class="doc-generated-empty">{{ noConditions }}</p>
              }
            </section>

            <!-- Removed 2026-09-27: the "Validity" paragraph was this portal's own
                 catalogue sentence (e.g. "Valid for six (6) months from issuance"),
                 not the office's, and it contradicted "Valid until" above. -->

            <section class="doc-generated-section doc-generated-signature">
              <h2>Approval</h2>
              <!-- An issued permit says where the signed copy is; "Pending Authorized Signature" stayed on issued ones (design review). -->
              <div class="sig-pending">{{ permit() ? 'Signed copy available at the release desk' : 'Pending authorized signature' }}</div>
              <div class="sig-line"></div>
              <div class="sig-name">{{ permit()?.approvingOfficial ?? notRecorded }}</div>
              <div class="sig-position">{{ permit()?.approvingOffice ?? issuingOffice() }}</div>
            </section>

            <div class="doc-generated-qr">
              @if (qr(); as q) {
                <svg [attr.viewBox]="'0 0 ' + q.count + ' ' + q.count" shape-rendering="crispEdges">
                  <rect width="100%" height="100%" fill="#ffffff" />
                  @for (cell of q.cells; track cell.x + '-' + cell.y) {
                    <rect [attr.x]="cell.x" [attr.y]="cell.y" width="1" height="1" fill="#000000" />
                  }
                </svg>
                <!-- The address on one line, the number whole on the next, so both can be read and typed. -->
                <p class="qr-caption">Scan to verify at {{ verifyHost }}/verify/<br /><span class="qr-number">{{ permit()?.permitNumber }}</span></p>
              } @else {
                <p class="qr-caption qr-unavailable">QR verification not yet available — this permit has not been issued.</p>
              }
            </div>

            <footer class="doc-generated-footer">
              @if (gateCleared()) {
                <p>This is a system-generated document issued by the Municipality of Castilla, Sorsogon.</p>
              } @else {
                <p>
                  This is a system-generated <strong>preview</strong> produced by the eBPCO portal. It is
                  not an issued permit and has no legal effect. Only the Municipality of Castilla,
                  Sorsogon issues permits.
                </p>
              }
              <!-- The application's reference number, never its internal id. -->
              <p>Document Ref. {{ a.applicationNumber }} &middot; Generated {{ generatedOn }} &middot; Page 1 of 1</p>
            </footer>
          </article>
          </div>
        }

      </div>
    } @else {
      <div class="page">
        <div class="card empty-state">
          <p>We couldn't find that application.</p>
          <a routerLink="/applications" class="btn btn-primary">Back to My Applications</a>
        </div>
      </div>
    }
  `,
})
export class PermitDocumentPage {
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(ApplicationStore);
  private readonly businessStore = inject(BusinessStore);
  private readonly auth = inject(AuthService);
  private readonly api = inject(CitizenApiClient);

  /**
   * Separate route/component from `application-details.page.ts` — no shared
   * signals, so this needs its own trigger for the real permit fetch.
   * `permit` below picks it up automatically once `ApplicationStore.permitFor`
   * has it, same "real once fetched" pattern used throughout this portal.
   */
  constructor() {
    if (this.api.configured) this.store.fetchPermit(this.id());
  }

  protected readonly formatDate = formatDate;
  protected readonly notRecorded = NOT_RECORDED;

  /** "Valid until": the date; a Certificate of Occupancy's "No fixed expiry (…)"; otherwise "Not recorded". */
  protected validUntil(permitType: string | null | undefined, expiryDate: string | null | undefined): string {
    return permitValidityText(permitType, expiryDate, (date) => formatDate(date));
  }
  protected readonly pesos = pesos;
  protected readonly L = PERMIT_LABELS;
  protected readonly noConditions = NO_CONDITIONS_NOTE;
  /** The business's name on a business application; null (no row) on a private individual's (migration 067, design review I6). */
  protected readonly businessName = businessNameOnDocument;
  protected readonly generatedOn = formatDateTime(new Date().toISOString());
  /** The host the QR's caption names, e.g. citizen.castilla-ebpco.online. */
  protected readonly verifyHost = window.location.host;

  private id(): string {
    return this.route.snapshot.paramMap.get('id')!;
  }

  protected readonly app = computed(() => this.store.applicationById(this.id()));
  /**
   * The Owner / Applicant fields: the citizen's account, as the Admin
   * Portal's preview reads it too, with the whole address (street, barangay,
   * city, province; it printed the street alone). Both copies change if the
   * profile is edited after release until the backend snapshots these on the
   * permit row when it is generated (a backend follow-up of design review I3).
   */
  protected readonly owner = computed(() => {
    const u = this.auth.currentUser();
    const address = u ? addressLine([u.street, u.barangay, u.city, u.province]) : '';
    return {
      name: u ? fullName(u) : 'Not on file',
      contact: u?.mobileNumber?.trim() || 'Not on file',
      address: address || 'Not on file',
    };
  });
  protected readonly business = computed(() => {
    const a = this.app();
    return a ? this.businessStore.businessById(a.businessId) : undefined;
  });
  /** The Property rows: the address the applicant gave (`location`), else the business's (core/domain/property-address.ts). */
  protected readonly propertyFields = computed(() => propertyRows(this.app()?.location, this.business()));
  protected readonly permit = computed(() => this.store.permitFor(this.id()));
  /** What the Building Official wrote the permit covers when generating it. */
  protected readonly scope = computed(() => this.store.permitScopeFor(this.id()));
  /** "Group A — Residential, Dwellings", from the application's own form; null when none was given. */
  protected readonly occupancy = computed(() => occupancyLabelOf(this.app()?.form));
  /**
   * The one assessment (`assessmentViewOf`): the real Order of Payment's fees,
   * Total amount due, Balance and number, as the application page and the pay
   * page show them; the local demo store's for a demo id. A real application
   * whose Order of Payment the store does not hold still prints its total.
   */
  protected readonly assessment = computed<AssessmentView | null>(() => {
    const a = this.app();
    const view = assessmentViewOf(a?.paymentStatus, this.store.orderOfPaymentFor(this.id()), this.store.assessmentFor(this.id()));
    if (view) return view;
    if (a?.assessedAmountCentavos == null) return null;
    return {
      lineItems: [],
      totalCentavos: a.assessedAmountCentavos,
      balanceCentavos: a.paymentStatus === 'Paid' ? 0 : a.assessedAmountCentavos,
      opsNumber: null,
      dueDate: null,
      pendingVerification: a.paymentStatus === 'Pending Verification',
      canPay: false,
    };
  });

  /** The office the permit type's documents name as issuer (OFFICES, design review I5). */
  protected readonly issuingOffice = computed(() => issuingOfficeFor(this.app()?.permitType));

  protected readonly config = computed(() => {
    const a = this.app();
    if (!a) return null;
    return {
      header: agencyHeaderFor(this.issuingOffice()),
      title: documentTitleFor(a.permitType),
    };
  });

  // Every stage gets the SAME watermark rather than a "DRAFT" / "FOR REVIEW"
  // progression that reads as if the document itself were becoming more real
  // as it moves along. Castilla is live now, so whether an issued permit
  // keeps "SAMPLE" (and its footer's "issued by the Municipality") is the
  // owner's decision, pending since the design review of 4 Nov 2026 (I12).
  //
  // `cleared` still tracks whether this is a genuinely ISSUED permit record
  // (it gates the QR code and the print button below) — the provenance check
  // stays load-bearing for that, since the demo lifecycle advance can mint a
  // permit row without a backend ever setting `issued` — but the watermark
  // text itself no longer varies with it.
  private readonly gate = computed(() => {
    const watermarkText: WatermarkText = 'SAMPLE — NOT AN OFFICIAL PERMIT';
    const cleared = this.permit()?.provenance === 'issued';
    return { cleared, watermarkText };
  });

  protected readonly watermarkText = computed(() => this.gate().watermarkText);
  protected readonly gateCleared = computed(() => this.gate().cleared);

  /** The office's conditions for this permit. Empty until the office supplies them. */
  protected readonly conditions = computed<readonly string[]>(() => this.permit()?.conditions ?? []);

  protected readonly verificationUrl = computed(() => {
    const p = this.permit();
    if (!p || !this.gate().cleared) return null;
    return `${window.location.origin}/verify/${p.permitNumber}`;
  });

  protected readonly qr = computed<{ count: number; cells: QrCell[] } | null>(() => {
    const url = this.verificationUrl();
    if (!url) return null;
    const qr = qrcodegen(0, 'M');
    qr.addData(url);
    qr.make();
    const count = qr.getModuleCount();
    const cells: QrCell[] = [];
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) cells.push({ x: col, y: row });
      }
    }
    return { count, cells };
  });

  protected print(): void {
    window.print();
  }
}
