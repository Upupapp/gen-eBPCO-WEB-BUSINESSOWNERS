import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CitizenApiClient } from '../../core/api/citizen-api.client';
import { GcashCheckoutView } from '../../core/api/citizen-api.models';
import { ApiError } from '../../core/api/problem';
import { AuthService } from '../../core/session/auth.service';
import { pesos } from '../../core/domain/assessment.model';
import { formatDateTime } from '../../core/utils/ids';

type LoadState = 'loading' | 'ready' | 'not-found' | 'unavailable';
type Outcome = 'paid' | 'failed' | 'cancelled';

/**
 * The GCash TEST checkout (ebpco-api 071) — PUBLIC, no sign-in, like a
 * payment gateway's hosted page: `/pay/gcash/{checkoutId}?t={secret}`, the
 * `checkoutUrl` the server returns when a citizen chooses "Pay with GCash".
 * The app opens it in the browser too, which is why it needs no session.
 *
 * It is NOT GCash and must never look like it: no GCash logo, colours or
 * styling, eBPCO's own look and a plain "Test mode" label. It stands in for
 * the GCash step until the Municipality has a GCash merchant account, so the
 * rest of the payment (Pending Verification, the Cashier's verification, the
 * official receipt) can be tried end to end. Its three buttons are what the
 * gateway could report: paid, failed, or cancelled by the payer. A paid one is
 * lodged by the server exactly like any citizen payment.
 *
 * The server shows the amount, the references and the permit type, nothing
 * about the person; a wrong or missing secret is a plain 404.
 *
 * Layout: the portal's standalone public page (.auth-screen / .auth-card /
 * .auth-head with the logo, as sign-in and permit verification), one card, a
 * .callout-warning test-mode banner, the facts as label / value rows with the
 * amount as a right-aligned total. Built for a phone browser (the app opens
 * it): full-width stacked buttons, no fixed widths, tighter page padding at
 * 480px and below.
 */
@Component({
  selector: 'app-gcash-checkout',
  imports: [RouterLink],
  styles: [`
    /* Label / value rows: the label left, the value right, amounts in tabular figures. */
    .checkout-facts { margin: 16px 0 0; }
    .checkout-facts > div {
      display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: baseline; gap: 16px;
      padding: 10px 0;
    }
    .checkout-facts > div + div { border-top: 1px solid var(--border-light); }
    .checkout-facts dt { font-size: 13px; line-height: 1.45; color: var(--gray-500); }
    .checkout-facts dd {
      margin: 0; font-size: 14px; font-weight: 600; line-height: 1.45; color: var(--gray-900);
      text-align: right; overflow-wrap: anywhere; font-variant-numeric: tabular-nums;
    }
    /* The total: under a stronger line, the one large figure on the page. */
    .checkout-facts > .checkout-total { border-top-color: var(--border-medium); padding-top: 14px; }
    .checkout-total dt { font-size: 14px; font-weight: 600; color: var(--gray-800); }
    .checkout-total dd { font-size: 20px; font-weight: 700; white-space: nowrap; }

    .checkout-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 20px; }
    .checkout-actions .field.error { margin: 0 0 4px; }

    /* An ended (or unreadable) checkout: a tone icon, a title, one sentence. */
    .checkout-result { text-align: center; margin-top: 20px; }
    .checkout-result-icon { width: 40px; height: 40px; border-radius: 50%; margin: 0 auto 10px; display: grid; }
    .checkout-result-icon--clock { --tile-icon: var(--icon-clock); }
    .checkout-result h3 { margin: 0 0 6px; font-size: 16px; color: var(--gray-900); }
    .checkout-result p { margin: 0 0 8px; }
    .checkout-result .btn { margin-top: 8px; }
    .checkout-back { margin-top: 16px; text-align: center; }

    @media (max-width: 480px) {
      .checkout-screen { padding: 16px 12px; }
      .checkout-result .btn, .checkout-back .btn { width: 100%; }
    }
  `],
  template: `
    <div class="auth-screen checkout-screen" style="background:var(--bg);">
      <div class="card auth-card">
        <div class="auth-head">
          <img src="logo.png" alt="" class="auth-logo" />
          <h2>GCash test checkout</h2>
          <p class="small muted">eBPCO · Municipality of Castilla, Sorsogon</p>
        </div>

        <div class="callout callout-warning" role="note">
          <strong class="callout-title">Test mode — no money is charged</strong>
          <p>This page simulates the GCash payment step, for testing. It is not GCash.</p>
        </div>

        @switch (state()) {
          @case ('loading') {
            <p class="muted" style="text-align:center; margin:20px 0 0;" role="status">Opening the checkout…</p>
          }
          @case ('not-found') {
            <div class="checkout-result">
              <span class="icon-tile icon-tile-warning checkout-result-icon" aria-hidden="true"></span>
              <h3>This checkout link is not valid</h3>
              <p class="small muted">Check that the whole link was opened, or start the GCash payment again from your application.</p>
            </div>
          }
          @case ('unavailable') {
            <div class="checkout-result">
              <span class="icon-tile icon-tile-warning checkout-result-icon" aria-hidden="true"></span>
              <h3>The checkout could not be reached</h3>
              <p class="small muted">The Municipality's system did not answer just now. Try again in a moment.</p>
              <button type="button" class="btn btn-secondary" (click)="load()">Try Again</button>
            </div>
          }
          @case ('ready') {
            @if (view(); as v) {
              @switch (v.status) {
                @case ('Pending') {
                  <dl class="checkout-facts">
                    <div><dt>Merchant</dt><dd>{{ v.merchant }}</dd></div>
                    <div><dt>Application</dt><dd>{{ v.applicationReference }} · {{ v.permitType }}</dd></div>
                    <div><dt>Reference</dt><dd>{{ v.reference }}</dd></div>
                    <div><dt>Expires</dt><dd>{{ formatDateTime(v.expiresAt) }}</dd></div>
                    <div class="checkout-total"><dt>Amount to pay</dt><dd>{{ amount(v) }}</dd></div>
                  </dl>
                  <div class="checkout-actions">
                    @if (actionError(); as message) {
                      <div class="field error" role="alert">{{ message }}</div>
                    }
                    <button type="button" class="btn btn-primary btn-block" [disabled]="acting() !== null" (click)="simulate('paid')">
                      {{ acting() === 'paid' ? 'Paying…' : 'Pay ' + amount(v) + ' (test)' }}
                    </button>
                    <button type="button" class="btn btn-secondary btn-block" [disabled]="acting() !== null" (click)="simulate('cancelled')">
                      {{ acting() === 'cancelled' ? 'Cancelling…' : 'Cancel' }}
                    </button>
                    <!-- Test-only: what a declined GCash payment would report. -->
                    <button type="button" class="btn btn-ghost btn-block" [disabled]="acting() !== null" (click)="simulate('failed')">
                      {{ acting() === 'failed' ? 'Sending…' : 'Simulate a failed payment' }}
                    </button>
                  </div>
                }
                @case ('Paid') {
                  <div class="checkout-result" role="status">
                    <span class="icon-tile icon-tile-success checkout-result-icon" aria-hidden="true"></span>
                    <h3>Payment sent</h3>
                    <p class="small muted">The Cashier verifies it and issues your official receipt.</p>
                  </div>
                  <dl class="checkout-facts">
                    <div><dt>Application</dt><dd>{{ v.applicationReference }} · {{ v.permitType }}</dd></div>
                    <div><dt>Reference</dt><dd>{{ v.reference }}</dd></div>
                    <div class="checkout-total"><dt>Amount paid</dt><dd>{{ amount(v) }}</dd></div>
                  </dl>
                }
                @case ('Failed') {
                  <div class="checkout-result" role="status">
                    <span class="icon-tile icon-tile-danger checkout-result-icon" aria-hidden="true"></span>
                    <h3>Payment failed</h3>
                    <p class="small muted">Nothing was paid (a simulated failure). Start a new GCash payment from your application to try again.</p>
                  </div>
                }
                @case ('Cancelled') {
                  <div class="checkout-result" role="status">
                    <span class="icon-tile checkout-result-icon" aria-hidden="true"></span>
                    <h3>Payment cancelled</h3>
                    <p class="small muted">Nothing was paid. You can start a new GCash payment from your application, or choose another way to pay.</p>
                  </div>
                }
                @case ('Expired') {
                  <div class="checkout-result" role="status">
                    <span class="icon-tile icon-tile-warning checkout-result-icon checkout-result-icon--clock" aria-hidden="true"></span>
                    <h3>This checkout has expired</h3>
                    <p class="small muted">A checkout stays open for 30 minutes. Nothing was paid. Start a new GCash payment from your application.</p>
                  </div>
                }
              }
            }
          }
        }

        <!-- Once it has ended (or the link is not valid): signed in on this browser, back to the application; else back to the app. -->
        @if (showBack()) {
          <div class="checkout-back">
            @if (signedIn()) {
              @if (view()?.applicationId; as applicationId) {
                <a class="btn btn-primary" [routerLink]="['/applications', applicationId]">Back to my application</a>
              } @else {
                <a class="btn btn-primary" routerLink="/applications">Back to my applications</a>
              }
            } @else {
              <p class="small muted" style="margin:0;">You can close this page and return to the eBPCO app.</p>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class GcashCheckoutPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(CitizenApiClient);
  private readonly auth = inject(AuthService);

  protected readonly formatDateTime = formatDateTime;

  protected readonly state = signal<LoadState>('loading');
  protected readonly view = signal<GcashCheckoutView | null>(null);
  /** Which button's answer is awaited, so the three cannot be pressed together. */
  protected readonly acting = signal<Outcome | null>(null);
  /** The server's reason a button was refused while the checkout still reads Pending. */
  protected readonly actionError = signal<string | null>(null);

  private readonly checkoutId = this.route.snapshot.paramMap.get('checkoutId') ?? '';
  private readonly token = this.route.snapshot.queryParamMap.get('t') ?? '';

  constructor() {
    this.load();
  }

  protected signedIn(): boolean {
    return this.auth.isAuthenticated();
  }

  /** Where to go next is offered once there is nothing left to do here. */
  protected showBack(): boolean {
    const state = this.state();
    return state === 'not-found' || (state === 'ready' && this.view()?.status !== 'Pending');
  }

  /** "₱6,820.50": from the exact centavos, never the rounded pesos. */
  protected amount(v: GcashCheckoutView): string {
    return pesos(v.amountCentavos);
  }

  protected async load(): Promise<void> {
    // No id or no secret cannot be a checkout: said at once rather than asked.
    if (this.checkoutId === '' || this.token === '') {
      this.state.set('not-found');
      return;
    }
    if (!this.api.configured) {
      this.state.set('unavailable');
      return;
    }
    this.state.set('loading');
    try {
      this.view.set(await firstValueFrom(this.api.getGcashCheckout(this.checkoutId, this.token)));
      this.state.set('ready');
    } catch (error) {
      this.state.set(error instanceof ApiError && error.status === 404 ? 'not-found' : 'unavailable');
    }
  }

  /**
   * Reports what the gateway would: paid, failed, or cancelled by the payer.
   * A refusal (expired, already settled, the Order of Payment changed) is
   * the server's own sentence; the checkout is then read again, so a closed
   * one shows how it ended rather than buttons that can no longer work.
   */
  protected async simulate(outcome: Outcome): Promise<void> {
    if (this.acting() !== null) return;
    this.acting.set(outcome);
    this.actionError.set(null);
    try {
      const result = await firstValueFrom(this.api.simulateGcashCheckout(this.checkoutId, this.token, outcome));
      this.view.set(result);
    } catch (error) {
      this.actionError.set(
        error instanceof ApiError ? error.citizenMessage : 'The checkout could not be reached. Try again in a moment.',
      );
      await this.refresh();
    } finally {
      this.acting.set(null);
    }
  }

  /** Re-reads the checkout after a refusal, keeping what is shown when that read fails too. */
  private async refresh(): Promise<void> {
    try {
      this.view.set(await firstValueFrom(this.api.getGcashCheckout(this.checkoutId, this.token)));
    } catch {
      // The refusal above is already on screen.
    }
  }
}
