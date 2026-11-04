import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApplicationStore } from '../../core/stores/application.store';
import { DEFAULT_BANK_INFO, PaymentMethod } from '../../core/domain/payment.model';
import { MUNICIPAL_HALL_ADDRESS, MUNICIPAL_TREASURER } from '../../core/domain/lgu-contact';
import { AssessmentView, assessmentViewOf } from '../../core/domain/assessment-view';
import { pesos } from '../../core/domain/assessment.model';
import { ToastService } from '../../shared/ui/toast.service';
import { CitizenApiClient } from '../../core/api/citizen-api.client';
import { ApplicationSummary, PaymentMethodOption } from '../../core/api/citizen-api.models';
import { UploadLimitsService } from '../../core/api/upload-limits.service';
import { toBase64 } from '../../core/api/document-resubmission.service';
import { ApiError, duplicateOf } from '../../core/api/problem';
import { BackLinkComponent } from '../../shared/ui/back-link.component';
import { AssessmentTableComponent } from '../../shared/ui/assessment-table.component';

const KNOWN_METHODS: readonly PaymentMethod[] = ['Bank Transfer', 'GCash', 'Onsite'];

const ONSITE: PaymentMethodOption = { method: 'Onsite', label: 'Onsite', instructions: '' };

/** What this screen offered before the server listed methods: Onsite, and Bank Transfer once an account is published. */
const LOCAL_METHODS: readonly PaymentMethodOption[] = DEFAULT_BANK_INFO
  ? [{ method: 'Bank Transfer', label: 'Bank Transfer', instructions: '' }, ONSITE]
  : [ONSITE];

const METHOD_TITLE: Partial<Record<string, string>> = {
  'Bank Transfer': 'Bank Transfer',
  GCash: 'GCash',
  Onsite: 'Onsite Payment',
};

/** Bank Transfer first once it is offered (as before), else Onsite, else what there is. */
function defaultMethod(offered: readonly PaymentMethodOption[]): PaymentMethod {
  return (offered.find((m) => m.method === 'Bank Transfer') ?? offered.find((m) => m.method === 'Onsite') ?? offered[0]).method;
}

@Component({
  selector: 'app-payment-flow',
  imports: [FormsModule, RouterLink, BackLinkComponent, AssessmentTableComponent],
  styles: [`
    /* A method's name with its chip; the chip's 24px is pulled into the line so the radio stays level with the name. */
    .choice-card-head { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; }
    .choice-card-head .badge { margin: -2px 0; }
    .confirm-pay {
      margin-top: 14px; padding: 12px 14px; border-radius: 10px;
      border: 1px solid var(--primary-100); background: var(--primary-50);
    }
  `],
  template: `
    @if (app(); as a) {
      <div class="page page-narrow">
        <app-back-link fallback="/payments" fallbackLabel="Payments" />
        <div class="page-header">
          <div>
            <h1>Pay Assessment</h1>
            <div class="subtitle">{{ a.applicationNumber }} · {{ a.permitType }}</div>
          </div>
        </div>

        @if (assessment(); as asmt) {
          <!-- The application page's assessment table: fees, then Total amount due and Balance, in one column (design review I15). -->
          <div class="card">
            <app-assessment-table [view]="asmt" />
            <div class="card-actions">
              <a class="btn btn-secondary btn-sm" [routerLink]="['/payments', a.id, 'order']">Print Order of Payment</a>
            </div>
          </div>

          <div class="card">
            <div class="card-title">Payment method</div>
            <!--
              The methods the LGU accepts right now (GET /payment-methods,
              ebpco-api 071; Onsite alone when that cannot be read). Bank
              Transfer is offered only once the Municipality publishes a
              deposit account (DEFAULT_BANK_INFO). Until then it opened first
              on a "not available yet" notice and the citizen had to switch
              (QA TC-25, 2026-10-03): Onsite is the method, shown as such.
            -->
            @if (methods().length > 1) {
              <fieldset class="choice-cards choice-cards--row">
                <legend>Choose how to pay</legend>
                <!--
                  Every method is the same radio card (.choice-cards, as the
                  wizard's "Applying as"); GCash in test mode carries an amber
                  "Test mode" chip, as its checkout page opens on a test-mode banner.
                -->
                @for (m of methods(); track m.method) {
                  <label class="choice-card" [class.selected]="method() === m.method">
                    <input type="radio" name="payment-flow-method" [value]="m.method"
                      [checked]="method() === m.method" (change)="chooseMethod(m.method)" />
                    <span class="choice-card-text">
                      <span class="choice-card-head">
                        <strong>{{ methodTitle(m) }}</strong>
                        @if (m.method === 'GCash' && m.mode === 'test') { <span class="badge badge-amber">Test mode</span> }
                      </span>
                      <span class="choice-card-blurb">{{ methodBlurb(m) }}</span>
                    </span>
                  </label>
                }
              </fieldset>
            }

            <!--
              What happens next, as one info callout (it was a card nested in
              this card, with test mode said three times). Every place to pay
              names the Municipal Treasurer's Office, as the Order of Payment
              the citizen brings does (design review I2).
            -->
            @if (method() === 'GCash') {
              <!--
                GCash (ebpco-api 071): the checkout opens on its own page. Test
                mode until the LGU has a GCash merchant account: the card's
                chip and "test checkout" here say so. It quotes the Order of
                Payment amount, which is what the checkout charges.
              -->
              <div class="callout callout-info">
                <p>
                  You go to the GCash {{ gcashTestMode() ? 'test checkout' : 'checkout' }} to pay {{ pesos(asmt.totalCentavos) }};
                  the {{ treasurer.cashierLabel }} then verifies it and issues your official receipt.
                </p>
              </div>
            } @else if (method() === 'Bank Transfer') {
              @if (bank; as b) {
                <dl class="kv kv-2">
                  <div><dt>Bank</dt><dd>{{ b.bankName }}</dd></div>
                  <div><dt>Account name</dt><dd>{{ b.accountName }}</dd></div>
                  <div><dt>Account number</dt><dd>{{ b.accountNumber }}</dd></div>
                  <div><dt>Branch</dt><dd>{{ b.branch }}</dd></div>
                </dl>
                <div class="field" style="margin-top:12px;">
                  <label for="payment-flow-proof-of-payment-1">Proof of payment<span class="required">*</span></label>
                  <input id="payment-flow-proof-of-payment-1" type="file" accept=".pdf,.jpg,.jpeg,.png" (change)="onProofSelected($event)" />
                </div>
              } @else {
                <!--
                  F-4: never render a placeholder account number here. See
                  DEFAULT_BANK_INFO — this screen asks a user to move real money,
                  so "not yet available" is the only safe empty state.
                -->
                <div class="callout callout-warning">
                  <strong class="callout-title">Bank transfer is not available yet</strong>
                  <p>
                    The Municipality of Castilla has not published a deposit account for permit fees,
                    so this portal has no account details to show you.
                    <strong>Do not transfer permit fees to any account you have not confirmed with the
                    Municipality directly.</strong>
                  </p>
                  <p>
                    Use <strong>Onsite Payment</strong> instead, or confirm the current payment
                    arrangements with the {{ treasurer.name }} at {{ hallAddress }}.
                  </p>
                </div>
              }
            } @else {
              <div class="callout callout-info">
                <p>{{ onsiteWhere }}</p>
              </div>
            }

            @if (error()) { <div class="field error" style="margin-top:10px;">{{ error() }}</div> }
            @if (confirmingOnsite() && asmt) {
              <!--
                Telling us of an onsite payment declares that money changed
                hands, so it is asked once, plainly (QA TC-27, 2026-10-03: one
                click did it, with no confirmation). The OR number is optional:
                the Cashier records the authoritative one when verifying.
              -->
              <div class="confirm-pay" role="alertdialog" aria-labelledby="confirm-pay-title">
                <strong id="confirm-pay-title">Have you paid {{ pesos(asmt.totalCentavos) }} at the {{ treasurer.name }}?</strong>
                <p class="small" style="margin:6px 0 12px;">
                  Tell us only once you have paid and have your Official Receipt. Your balance stays
                  {{ pesos(asmt.balanceCentavos) }} until the {{ treasurer.cashierLabel }} verifies the payment.
                </p>
                <div class="field">
                  <label for="payment-flow-or-number">OR number on your receipt (optional)</label>
                  <input id="payment-flow-or-number" class="input" type="text" maxlength="40" autocomplete="off"
                    aria-describedby="payment-flow-or-number-hint" [ngModel]="orNumber()" (ngModelChange)="orNumber.set($event)" />
                  <div class="hint" id="payment-flow-or-number-hint">Leave it blank if you don't have it. The {{ treasurer.cashierLabel }} records it when verifying.</div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  <button class="btn btn-primary btn-sm" [disabled]="submitting()" (click)="submit(a.id)">
                    {{ submitting() ? 'Sending…' : 'Yes, I Have Paid' }}
                  </button>
                  <button class="btn btn-secondary btn-sm" [disabled]="submitting()" (click)="confirmingOnsite.set(false)">Not Yet</button>
                </div>
              </div>
            } @else if (method() === 'GCash') {
              <div class="card-actions">
                <button class="btn btn-primary btn-phone-block" [disabled]="submitting()" (click)="payWithGcash(a.id)">
                  {{ submitting() ? 'Opening the checkout…' : 'Pay with GCash' }}
                </button>
              </div>
            } @else if (method() !== 'Bank Transfer' || bank) {
              <div class="card-actions">
                <button class="btn btn-primary btn-phone-block" [disabled]="submitting()" (click)="onPay(a.id)">
                  {{ submitting() ? 'Sending…' : (method() === 'Bank Transfer' ? 'Submit Payment' : 'I Have Paid') }}
                </button>
              </div>
            }
          </div>
        } @else {
          <div class="card empty-state">No assessment has been issued yet for this application.</div>
        }
      </div>
    } @else {
      <div class="page page-narrow">
        <div class="card empty-state">
          <p>We couldn't find that application. This can happen after a page refresh, since this demo build keeps data in memory only (no backend yet — see the project README).</p>
          <a routerLink="/payments" class="btn btn-primary">Back to Payments</a>
        </div>
      </div>
    }
  `,
})
export class PaymentFlowPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly store = inject(ApplicationStore);
  private readonly toast = inject(ToastService);
  private readonly api = inject(CitizenApiClient);
  private readonly uploadLimits = inject(UploadLimitsService);

  protected readonly bank = DEFAULT_BANK_INFO;
  protected readonly treasurer = MUNICIPAL_TREASURER;
  protected readonly hallAddress = MUNICIPAL_HALL_ADDRESS;
  /** Where to pay in person, word for word as the Order of Payment says it (design review I2). */
  protected readonly onsiteWhere =
    `Pay at the ${MUNICIPAL_TREASURER.name} (${MUNICIPAL_TREASURER.cashierLabel}), ${MUNICIPAL_TREASURER.place}. Bring your Order of Payment.`;
  /** The Official Receipt number the citizen may give when telling us of an onsite payment; optional. */
  readonly orNumber = signal('');
  protected readonly pesos = pesos;
  /**
   * The methods offered, in the server's order (GET /payment-methods,
   * ebpco-api 071). Until that answers, and in the demo build, the ones this
   * screen always had; Onsite alone when it cannot be read. Bank Transfer
   * only once the Municipality has published a deposit account.
   */
  readonly methods = signal<readonly PaymentMethodOption[]>(LOCAL_METHODS);
  // Onsite unless the Municipality has published a deposit account (QA TC-25).
  readonly method = signal<PaymentMethod>(DEFAULT_BANK_INFO ? 'Bank Transfer' : 'Onsite');
  /** The GCash provider is the test one: no real money moves (the server says so with `mode: 'test'`). */
  protected readonly gcashTestMode = computed(() => this.methods().some((m) => m.method === 'GCash' && m.mode === 'test'));
  /** Asking "have you paid?" before an onsite payment is declared (QA TC-27). */
  readonly confirmingOnsite = signal(false);
  readonly error = signal<string | null>(null);
  readonly submitting = signal(false);
  proofFileName: string | null = null;
  private proofFile: File | null = null;

  /**
   * The real Order of Payment, from `GET /applications/{id}` — `payment
   * .orderOfPayment` (see `ApplicationSummary`). `realChecked` is a separate
   * flag rather than folding "not fetched" into the value itself: `null`
   * has to keep meaning "confirmed — no Order of Payment issued yet" (a
   * real, common state, not an error), which is different from "the
   * request just hasn't come back yet."
   */
  private readonly realChecked = signal(false);
  private readonly realOrderOfPayment = signal<ApplicationSummary['payment']['orderOfPayment'] | null>(null);

  constructor() {
    if (this.api.configured) {
      this.api.getPaymentMethods().subscribe({
        next: (list) => this.useMethods(Array.isArray(list) ? list : []),
        error: () => this.useMethods([]),
      });
      this.api.getApplication(this.id()).subscribe({
        next: (summary) => {
          this.realOrderOfPayment.set(summary.payment.orderOfPayment ?? null);
          this.realChecked.set(true);
        },
        // A local demo application id 404s against the real backend —
        // expected, not an error. Leaves realChecked false, so assessment()
        // falls back to the local demo data below.
        error: () => {},
      });
    }
  }

  private id(): string {
    return this.route.snapshot.paramMap.get('applicationId')!;
  }

  /**
   * What the server listed, less what this screen cannot offer: a method it
   * does not know, and Bank Transfer while no deposit account is published.
   * Nothing left (or nothing read) is Onsite, as before the list existed.
   */
  private useMethods(list: readonly PaymentMethodOption[]): void {
    const usable = list.filter((m) => KNOWN_METHODS.includes(m.method) && (m.method !== 'Bank Transfer' || this.bank !== null));
    const offered = usable.length > 0 ? usable : [ONSITE];
    this.methods.set(offered);
    if (!offered.some((m) => m.method === this.method())) this.method.set(defaultMethod(offered));
  }

  protected chooseMethod(method: PaymentMethod): void {
    this.method.set(method);
    this.error.set(null);
    this.confirmingOnsite.set(false);
  }

  protected methodTitle(m: PaymentMethodOption): string {
    return METHOD_TITLE[m.method] ?? m.label;
  }

  protected methodBlurb(m: PaymentMethodOption): string {
    // In test mode the card's "Test mode" chip says so; the line says what it means.
    // Test mode is said by the card's chip and the checkout callout, once each.
    if (m.method === 'GCash') return 'Pay online.';
    if (m.method === 'Bank Transfer') return "Deposit to the Municipality's account, then upload the proof.";
    return `Pay at the ${MUNICIPAL_TREASURER.short}, then tell us here.`;
  }

  /**
   * Opens a GCash checkout for the Order of Payment in force (`POST
   * /applications/{id}/payments/gcash`) and goes to it. The server names
   * the amount; nothing here is sent but the application. Its refusal (not
   * waiting for payment, a payment already with the Cashier, GCash closed)
   * is shown in its own words.
   */
  async payWithGcash(applicationId: string): Promise<void> {
    this.error.set(null);
    this.submitting.set(true);
    try {
      const checkout = await firstValueFrom(this.api.startGcashPayment(applicationId));
      this.openCheckout(checkout.checkoutUrl);
    } catch (error) {
      this.error.set(
        error instanceof ApiError ? error.citizenMessage : 'The GCash checkout could not be opened. Please try again.',
      );
    } finally {
      this.submitting.set(false);
    }
  }

  /**
   * The checkout is this portal's own `/pay/gcash/{id}?t=…` page, on the
   * same origin in production: opened in place, keeping the session. On
   * another origin (a local build against another portal's API), a full
   * page load there.
   */
  private openCheckout(checkoutUrl: string): void {
    let target: URL;
    try {
      target = new URL(checkoutUrl, window.location.origin);
    } catch {
      this.error.set('The GCash checkout could not be opened. Please try again.');
      return;
    }
    if (target.origin === window.location.origin) {
      void this.router.navigateByUrl(`${target.pathname}${target.search}${target.hash}`);
    } else {
      this.leaveTo(target.toString());
    }
  }

  /** A full page load elsewhere; its own method so a test can see it without leaving the page. */
  protected leaveTo(url: string): void {
    window.location.assign(url);
  }

  app() {
    return this.store.applicationById(this.id());
  }

  /**
   * The assessment this screen asks the citizen to pay, as the application
   * page shows it (`assessmentViewOf`): the real Order of Payment's fees,
   * total and balance, else the local demo store's. Real applications have no
   * "partially paid" state server-side, so balance === total until paid.
   */
  assessment(): AssessmentView | undefined {
    if (this.api.configured) {
      if (!this.realChecked()) return undefined;
      const real = this.realOrderOfPayment();
      return real ? assessmentViewOf(this.app()?.paymentStatus, real, null) ?? undefined : undefined;
    }
    return assessmentViewOf(null, null, this.store.assessmentFor(this.id())) ?? undefined;
  }

  /** The onsite payment's reference: the OR number when the citizen gave one, else a unique placeholder the Cashier replaces at verification. */
  private onsiteReference(): string {
    const or = this.orNumber().trim();
    return or !== '' ? `OR ${or}` : `ONSITE-${Date.now()}`;
  }

  onProofSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.proofFile = file;
    this.proofFileName = file?.name ?? null;
  }

  /** Onsite asks first; a bank transfer carries its own proof and goes straight through. */
  onPay(applicationId: string): void {
    if (this.method() === 'GCash') {
      void this.payWithGcash(applicationId);
      return;
    }
    if (this.method() === 'Onsite') {
      this.error.set(null);
      this.confirmingOnsite.set(true);
      return;
    }
    void this.submit(applicationId);
  }

  async submit(applicationId: string): Promise<void> {
    if (this.method() === 'Bank Transfer' && !this.proofFileName) {
      this.error.set('Please attach your proof of payment.');
      return;
    }

    if (this.api.configured && this.realOrderOfPayment()) {
      await this.submitReal(applicationId);
      return;
    }

    const reference = this.method() === 'Bank Transfer' ? this.proofFileName! : this.onsiteReference();
    this.store.submitPayment(applicationId, this.method(), reference);
    // F-14: nobody will verify this. No payment record leaves the browser.
    this.toast.success('Recorded in this demo. No payment was sent or received.');
    this.router.navigate(['/applications', applicationId]);
  }

  /**
   * Submits for real, against `POST /applications/{id}/payments`.
   *
   * `amountCentavos` is the real Order of Payment's own `totalCentavos` —
   * never derived from anything the citizen typed, since inventing the
   * amount to pay is the one mistake this screen cannot afford. A bank-
   * transfer proof is uploaded for real first (same `POST /documents` path
   * as the application wizard's attachments — Stage 6), and its real id is
   * what travels as `proofDocumentId`; Onsite carries none, matching the
   * existing UI (no file picker shown for that method). `applicationId` goes
   * on the upload itself too — omitted until 2026-09-25, which meant a
   * verifying officer had no way to actually see the proof they were asked
   * to verify: it never appeared as one of the application's own documents
   * anywhere in the Admin Portal, only its bare id sat on the payment row.
   */
  private async submitReal(applicationId: string): Promise<void> {
    const real = this.realOrderOfPayment()!;
    this.submitting.set(true);
    try {
      let proofDocumentId: string | null = null;
      if (this.method() === 'Bank Transfer' && this.proofFile) {
        if (this.proofFile.size > this.uploadLimits.maxFileBytes()) {
          this.error.set(
            `"${this.proofFile.name}" is ${Math.round(this.proofFile.size / 1000)} KB. The Municipality's system ` +
            `accepts up to about ${Math.round(this.uploadLimits.maxFileBytes() / 1000)} KB.`,
          );
          return;
        }
        try {
          const contentBase64 = await toBase64(this.proofFile);
          const proof = this.proofFile;
          const send = (reuseOf: string | null) => firstValueFrom(
            this.api.uploadDocument({
              fileName: proof.name, label: 'Proof of Payment', contentBase64, applicationId, reuseOf,
            }),
          );
          // A retry after a payment that failed past its upload sends the same
          // receipt again, which the server refuses as a file already on
          // record: use that copy rather than stop the payment.
          const uploaded = await send(null).catch((error: unknown) => {
            const existing = duplicateOf(error);
            if (existing === null) throw error;
            return send(existing.id);
          });
          proofDocumentId = uploaded.documentId;
        } catch (error) {
          this.error.set(
            error instanceof ApiError
              ? error.citizenMessage
              : 'Your proof of payment could not be sent to the Municipality. Please try again.',
          );
          return;
        }
      }

      const reference = this.method() === 'Bank Transfer' ? this.proofFile!.name : this.onsiteReference();
      const result = await this.store.submitPaymentReal(applicationId, {
        referenceNumber: reference,
        method: this.method(),
        paidOn: new Date().toISOString().slice(0, 10),
        amountCentavos: real.totalCentavos,
        proofDocumentId,
      });
      if (!result.ok) {
        this.error.set(result.error);
        return;
      }
      // Says what is true now: the balance stands until the Cashier verifies
      // the payment (QA TC-27: "this settles your balance" sat above an
      // unchanged balance).
      this.toast.success(
        result.settles
          ? 'Payment sent for verification. Once the Cashier verifies it, your balance will be settled.'
          : 'Payment sent for verification.',
      );
      this.router.navigate(['/applications', applicationId]);
    } finally {
      this.submitting.set(false);
    }
  }
}
