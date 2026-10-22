import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EarlierPermit, RecordClaim } from '../../core/api/citizen-api.models';
import {
  BEFORE_EBPCO_LABEL, BEFORE_EBPCO_NOTE, CLAIM_STATUS,
  businessForEarlierPermit, canRenewEarlierPermit, earlierPermitStanding, manilaToday,
} from '../../core/domain/earlier-records';
import { BusinessStore } from '../../core/stores/business.store';
import { EarlierRecordsStore } from '../../core/stores/earlier-records.store';
import { formatDate } from '../../core/utils/ids';

/**
 * "Issued before eBPCO" on My Applications (ebpco-api migration 069): the
 * permits the Municipality issued on paper before eBPCO, once an officer has
 * matched them to this account, and "Find my earlier permits" for one that is
 * not listed yet.
 *
 * Register records, not filings: no tracking, timeline, download or QR, and
 * never in the application counts above. The section's heading and cards are
 * hidden until there is a permit to show; the "Find my earlier permits" link
 * and the citizen's own requests are always there.
 */
@Component({
  selector: 'app-earlier-permits',
  imports: [FormsModule, RouterLink],
  template: `
    <section class="earlier" aria-label="Issued before eBPCO">
      @if (store.permits().length > 0) {
        <div class="earlier__head">
          <h2 class="earlier__title">{{ label }}</h2>
          <p class="small muted earlier__note">{{ note }}</p>
        </div>
        <div class="earlier__grid">
          @for (p of store.permits(); track p.id) {
            <article class="card earlier-card" [attr.data-permit-number]="p.permitNumber">
              <div class="earlier-card__badges">
                <span class="badge badge-gold earlier-badge">{{ label }}</span>
                @if (standing(p); as s) {
                  <span class="badge earlier-validity" [class.badge-green]="s === 'Valid'" [class.badge-gray]="s === 'Expired'">{{ s }}</span>
                }
              </div>
              <div class="earlier-card__type">{{ p.permitType }}</div>
              <div class="earlier-card__number">{{ p.permitNumber }}</div>
              <dl class="earlier-card__facts">
                <div><dt>Date issued</dt><dd>{{ formatDate(p.dateIssued) }}</dd></div>
                @if (p.validUntil) {
                  <div><dt>Valid until</dt><dd>{{ formatDate(p.validUntil) }}</dd></div>
                }
                @if (p.location) {
                  <div><dt>Location</dt><dd>{{ p.location }}</dd></div>
                }
                @if (p.businessName) {
                  <div><dt>Business</dt><dd>{{ p.businessName }}</dd></div>
                }
              </dl>
              @if (p.registerRef) {
                <div class="earlier-card__ref">Register ref. {{ p.registerRef }}</div>
              }
              @if (canRenew(p)) {
                <div class="earlier-card__actions">
                  <a class="btn btn-secondary btn-sm earlier-renew" [routerLink]="['/permits/apply']" [queryParams]="renewParams(p)">Renew</a>
                </div>
              }
            </article>
          }
        </div>
      }

      <div class="earlier__find">
        <button type="button" class="link-button earlier-find-toggle" [attr.aria-expanded]="formOpen()"
                aria-controls="earlier-claim-form" (click)="toggleForm()">Find my earlier permits</button>
        <span class="small muted">A permit the Municipality issued before eBPCO that is not on your account yet.</span>
      </div>

      @if (formOpen()) {
        <form id="earlier-claim-form" class="card earlier-claim" (ngSubmit)="submit()" novalidate>
          <div class="card-title">Find my earlier permits</div>
          <p class="small muted">
            Give the number on your paper permit. The Municipality checks its register and adds the permit to
            your account if it is yours.
          </p>
          <div class="field">
            <label for="earlier-claim-permit-number">Permit number<span class="required">*</span></label>
            <input id="earlier-claim-permit-number" name="permitNumber" class="input" [(ngModel)]="permitNumber"
                   (ngModelChange)="edited()" maxlength="40" autocomplete="off"
                   placeholder="As printed on the paper permit, e.g. BP-2019-0412" />
          </div>
          <div class="form-row">
            <div class="field">
              <label for="earlier-claim-date-issued">Date issued</label>
              <input id="earlier-claim-date-issued" name="dateIssued" type="date" class="input" [max]="today"
                     [(ngModel)]="dateIssued" (ngModelChange)="edited()" />
            </div>
            <div class="field">
              <label for="earlier-claim-or-number">Official receipt (OR) number</label>
              <input id="earlier-claim-or-number" name="orNumber" class="input" [(ngModel)]="orNumber"
                     (ngModelChange)="edited()" maxlength="40" autocomplete="off" />
            </div>
          </div>
          <p class="small muted earlier-claim__rule">Give the date issued or the OR number — at least one.</p>
          @if (formError(); as message) {
            <div class="field error earlier-claim__error" role="alert">{{ message }}</div>
          }
          @if (sent()) {
            <div class="earlier-claim__sent" role="status">Sent. The Municipality will check its register and tell you.</div>
          }
          <button type="submit" class="btn btn-primary earlier-claim__send" [disabled]="sending()">
            {{ sending() ? 'Sending…' : 'Send' }}
          </button>
        </form>
      }

      @if (store.claims().length > 0) {
        <div class="card earlier-requests">
          <div class="card-title">Your requests</div>
          <ul class="earlier-requests__list">
            @for (c of store.claims(); track c.id) {
              <li class="earlier-request" [attr.data-status]="c.status">
                <div class="earlier-request__main">
                  <strong class="earlier-request__number">{{ c.permitNumber }}</strong>
                  <span class="small muted">{{ claimDetails(c) }}</span>
                  @if (c.note) {
                    <span class="small earlier-request__note">Note from the Municipality: {{ c.note }}</span>
                  }
                </div>
                <span class="badge earlier-request__status" [class]="claimBadge(c)">{{ claimLabel(c) }}</span>
              </li>
            }
          </ul>
        </div>
      }
    </section>
  `,
  styles: [
    `
    .earlier { margin-top: 28px; }
    .earlier__head { margin-bottom: 12px; }
    .earlier__title { font-size: 18px; margin: 0 0 4px; }
    .earlier__note { margin: 0; }
    .earlier__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
      align-items: stretch;
    }
    .earlier__grid > .card + .card { margin-top: 0; }
    .earlier-card { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .earlier-card__badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
    .earlier-card__type { font-size: 13px; font-weight: 600; color: var(--gray-600); }
    .earlier-card__number { font-size: 20px; font-weight: 800; color: var(--gray-900); overflow-wrap: anywhere; letter-spacing: .01em; }
    .earlier-card__facts { margin: 4px 0 0; display: flex; flex-direction: column; gap: 4px; }
    .earlier-card__facts > div { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 8px; font-size: 13px; }
    .earlier-card__facts dt { color: var(--gray-500); }
    .earlier-card__facts dd { margin: 0; color: var(--gray-800); overflow-wrap: anywhere; }
    .earlier-card__ref { font-size: 11.5px; color: var(--gray-500); margin-top: 2px; overflow-wrap: anywhere; }
    .earlier-card__actions { margin-top: auto; padding-top: 10px; }

    .earlier__find { margin-top: 16px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
    .earlier-find-toggle { font-weight: 600; font-size: 14px; }

    .earlier-claim { margin-top: 12px; max-width: 640px; }
    .earlier-claim__rule { margin: -6px 0 12px; }
    .earlier-claim__sent {
      margin-bottom: 12px; padding: 9px 12px; border-radius: var(--radius-sm);
      background: var(--success-100); color: var(--success-text); font-size: 13px; font-weight: 600;
    }

    .earlier-requests { margin-top: 16px; max-width: 640px; }
    .earlier-requests__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .earlier-request {
      display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
      padding: 10px 0; border-top: 1px solid var(--border-light);
    }
    .earlier-request:first-child { border-top: none; padding-top: 0; }
    .earlier-request__main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .earlier-request__number { overflow-wrap: anywhere; }
    .earlier-request__note { color: var(--gray-700); }
    .earlier-request__status { flex-shrink: 0; white-space: nowrap; }
    `,
  ],
})
export class EarlierPermitsComponent {
  protected readonly store = inject(EarlierRecordsStore);
  private readonly businesses = inject(BusinessStore);
  protected readonly formatDate = formatDate;
  protected readonly label = BEFORE_EBPCO_LABEL;
  protected readonly note = BEFORE_EBPCO_NOTE;
  /** The date field's upper bound, and what Valid/Expired is read against. */
  protected readonly today = manilaToday();

  protected readonly formOpen = signal(false);
  protected readonly sending = signal(false);
  protected readonly sent = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected permitNumber = '';
  protected dateIssued = '';
  protected orNumber = '';

  constructor() {
    this.store.revisit();
  }

  protected standing(p: EarlierPermit): 'Valid' | 'Expired' | null {
    return earlierPermitStanding(p.validUntil, this.today);
  }

  protected canRenew(p: EarlierPermit): boolean {
    return canRenewEarlierPermit(p.permitType);
  }

  /** The wizard opens as a Renewal of this permit type with the number filled in; the server still checks it on Continue. */
  protected renewParams(p: EarlierPermit): Record<string, string> {
    const params: Record<string, string> = { type: p.permitType, action: 'Renewal', permitNumber: p.permitNumber };
    const businessId = businessForEarlierPermit(p, this.businesses.myBusinesses());
    if (businessId !== null) params['businessId'] = businessId;
    return params;
  }

  protected toggleForm(): void {
    this.formOpen.update((open) => !open);
  }

  protected edited(): void {
    this.formError.set(null);
    this.sent.set(false);
  }

  protected async submit(): Promise<void> {
    if (this.sending()) return;
    this.sent.set(false);
    const permitNumber = this.permitNumber.replace(/\s+/g, ' ').trim();
    const dateIssued = this.dateIssued.trim();
    const orNumber = this.orNumber.trim();
    if (permitNumber.length < 2) {
      this.formError.set('Type the permit number as it is printed on your paper permit.');
      return;
    }
    if (dateIssued === '' && orNumber === '') {
      this.formError.set('Give the date issued or the OR number — at least one.');
      return;
    }
    this.formError.set(null);
    this.sending.set(true);
    const result = await this.store.claim({
      permitNumber,
      dateIssued: dateIssued === '' ? null : dateIssued,
      orNumber: orNumber === '' ? null : orNumber,
    });
    this.sending.set(false);
    if (!result.ok) {
      this.formError.set(result.error);
      return;
    }
    this.permitNumber = '';
    this.dateIssued = '';
    this.orNumber = '';
    this.sent.set(true);
  }

  protected claimLabel(c: RecordClaim): string {
    return CLAIM_STATUS[c.status]?.label ?? c.status;
  }

  protected claimBadge(c: RecordClaim): string {
    return CLAIM_STATUS[c.status]?.badge ?? 'badge-gray';
  }

  /** What the citizen gave, and when they sent it. */
  protected claimDetails(c: RecordClaim): string {
    return [
      c.dateIssued ? `Date issued ${formatDate(c.dateIssued)}` : null,
      c.orNumber ? `OR ${c.orNumber}` : null,
      `Sent ${formatDate(c.createdAt)}`,
    ].filter((part): part is string => part !== null).join(' · ');
  }
}
