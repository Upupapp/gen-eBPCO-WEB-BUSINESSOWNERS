import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { GcashCheckoutPage } from './gcash-checkout.page';
import { CitizenApiClient } from '../../core/api/citizen-api.client';
import { GcashCheckoutStatus, GcashCheckoutView, GcashSimulateResult } from '../../core/api/citizen-api.models';
import { ApiError } from '../../core/api/problem';
import { AuthService } from '../../core/session/auth.service';

/**
 * The public GCash TEST checkout (`/pay/gcash/{id}?t=`, ebpco-api 071): what
 * it shows while open, and how each of its outcomes ends. It must say plainly
 * that it is a test, and never look like GCash itself.
 */
function checkout(status: GcashCheckoutStatus = 'Pending'): GcashCheckoutView {
  return {
    checkoutId: 'chk-1', reference: 'GC-TEST-AB12CD34EF', amount: 6820.5, amountCentavos: 682050, status, mode: 'test',
    merchant: 'Municipality of Castilla — eBPCO', applicationId: 'app-1', applicationReference: 'BP-2026-000123',
    permitType: 'Building Permit', expiresAt: '2026-11-04T08:30:00.000Z', completedAt: null,
  };
}

function settled(status: GcashCheckoutStatus, paymentId: string | null = null): GcashSimulateResult {
  return { ...checkout(status), completedAt: '2026-11-04T08:10:00.000Z', paymentId, replayed: false };
}

function render(options: {
  view?: () => Observable<GcashCheckoutView>;
  simulate?: (outcome: string) => Observable<GcashSimulateResult>;
  signedIn?: boolean;
  token?: string | null;
}) {
  const getGcashCheckout = vi.fn(options.view ?? (() => of(checkout())));
  const simulateGcashCheckout = vi.fn((_id: string, _token: string, outcome: string) =>
    (options.simulate ?? (() => of(settled('Paid', 'pay-1'))))(outcome));
  const token = options.token === undefined ? 'secret' : options.token;
  TestBed.configureTestingModule({
    imports: [GcashCheckoutPage],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: {
          paramMap: convertToParamMap({ checkoutId: 'chk-1' }),
          queryParamMap: convertToParamMap(token === null ? {} : { t: token }),
        } } },
      { provide: CitizenApiClient, useValue: { configured: true, getGcashCheckout, simulateGcashCheckout } },
      { provide: AuthService, useValue: { isAuthenticated: () => options.signedIn ?? false } },
    ],
  });
  const fixture = TestBed.createComponent(GcashCheckoutPage);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const text = () => el.textContent?.replace(/\s+/g, ' ') ?? '';
  const button = (label: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
  return { fixture, el, text, button, getGcashCheckout, simulateGcashCheckout };
}

async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();
  }
  fixture.detectChanges();
}

describe('GcashCheckoutPage', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows an open checkout: test-mode banner, merchant, amount, references, expiry and the three buttons', async () => {
    const { fixture, el, text, button, getGcashCheckout } = render({});
    await settle(fixture);

    expect(getGcashCheckout).toHaveBeenCalledWith('chk-1', 'secret');
    expect(el.querySelector('h2')?.textContent?.trim()).toBe('GCash test checkout');
    // The test-mode banner: the portal's warning callout, with its title.
    expect(el.querySelector('.callout-warning .callout-title')?.textContent?.trim()).toBe('Test mode — no money is charged');
    expect(text()).toContain('This page simulates the GCash payment step, for testing. It is not GCash.');
    // The amount is the total row, under the references.
    expect(el.querySelector('.checkout-total dd')?.textContent?.trim()).toBe('₱6,820.50');
    expect(text()).toContain('Municipality of Castilla — eBPCO');
    expect(text()).toContain('₱6,820.50');
    expect(text()).toContain('GC-TEST-AB12CD34EF');
    expect(text()).toContain('BP-2026-000123 · Building Permit');
    expect(text()).toContain('Expires');
    expect(button('Pay ₱6,820.50 (test)')).toBeDefined();
    expect(button('Simulate a failed payment')).toBeDefined();
    expect(button('Cancel')).toBeDefined();
    // Not GCash: eBPCO's own logo is the only image.
    expect(Array.from(el.querySelectorAll('img')).map((i) => i.getAttribute('src'))).toEqual(['logo.png']);
  });

  it('paid: "Payment sent", with the reference and what happens next, and back to the application when signed in', async () => {
    const { fixture, el, text, button, simulateGcashCheckout } = render({ signedIn: true });
    await settle(fixture);
    button('Pay ₱6,820.50 (test)')!.click();
    await settle(fixture);

    expect(simulateGcashCheckout).toHaveBeenCalledWith('chk-1', 'secret', 'paid');
    expect(text()).toContain('Payment sent');
    expect(text()).toContain('GC-TEST-AB12CD34EF');
    expect(text()).toContain('The Cashier verifies it and issues your official receipt.');
    const back = Array.from(el.querySelectorAll('a')).find((a) => a.textContent?.trim() === 'Back to my application');
    expect(back?.getAttribute('href')).toBe('/applications/app-1');
    expect(button('Simulate a failed payment')).toBeUndefined();
  });

  it('paid, opened from the app (not signed in here): says to return to the app', async () => {
    const { fixture, text, button } = render({ signedIn: false });
    await settle(fixture);
    button('Pay ₱6,820.50 (test)')!.click();
    await settle(fixture);

    expect(text()).toContain('Payment sent');
    expect(text()).toContain('You can close this page and return to the eBPCO app.');
    expect(text()).not.toContain('Back to my application');
  });

  it('failed: says nothing was paid', async () => {
    const { fixture, text, button, simulateGcashCheckout } = render({ simulate: () => of(settled('Failed')) });
    await settle(fixture);
    button('Simulate a failed payment')!.click();
    await settle(fixture);

    expect(simulateGcashCheckout).toHaveBeenCalledWith('chk-1', 'secret', 'failed');
    expect(text()).toContain('Payment failed');
    expect(text()).toContain('Nothing was paid');
  });

  it('cancelled: says so', async () => {
    const { fixture, text, button, simulateGcashCheckout } = render({ simulate: () => of(settled('Cancelled')) });
    await settle(fixture);
    button('Cancel')!.click();
    await settle(fixture);

    expect(simulateGcashCheckout).toHaveBeenCalledWith('chk-1', 'secret', 'cancelled');
    expect(text()).toContain('Payment cancelled');
  });

  it('expired: says to start a new payment, with no buttons left', async () => {
    const { fixture, text, button } = render({ view: () => of(checkout('Expired')), signedIn: true });
    await settle(fixture);

    expect(text()).toContain('This checkout has expired');
    expect(text()).toContain('Start a new GCash payment from your application.');
    expect(text()).toContain('Back to my application');
    expect(button('Pay ₱6,820.50 (test)')).toBeUndefined();
  });

  it("a refusal shows the server's sentence, and the checkout is read again", async () => {
    const detail = 'This checkout has expired. Start a new GCash payment from your application.';
    let reads = 0;
    const { fixture, text, button, getGcashCheckout } = render({
      view: () => of(checkout(++reads === 1 ? 'Pending' : 'Expired')),
      simulate: () => throwError(() => new ApiError(409, { status: 409, detail }, false)),
    });
    await settle(fixture);
    button('Pay ₱6,820.50 (test)')!.click();
    await settle(fixture);

    expect(getGcashCheckout).toHaveBeenCalledTimes(2);
    expect(text()).toContain('This checkout has expired');
  });

  it('a refusal while still open stays on the checkout, with the reason', async () => {
    const detail = 'The Order of Payment changed after this checkout began. Start a new GCash payment from your application.';
    const { fixture, text, button } = render({
      simulate: () => throwError(() => new ApiError(409, { status: 409, detail }, false)),
    });
    await settle(fixture);
    button('Pay ₱6,820.50 (test)')!.click();
    await settle(fixture);

    expect(text()).toContain(detail);
    expect(button('Pay ₱6,820.50 (test)')).toBeDefined();
  });

  it('a wrong link (404) is not a valid checkout', async () => {
    const { fixture, text } = render({ view: () => throwError(() => new ApiError(404, { status: 404 }, false)) });
    await settle(fixture);
    expect(text()).toContain('This checkout link is not valid');
    expect(text()).toContain('You can close this page and return to the eBPCO app.');
  });

  it('a link without its secret is not valid, and is not even asked about', async () => {
    const { fixture, text, getGcashCheckout } = render({ token: null });
    await settle(fixture);
    expect(getGcashCheckout).not.toHaveBeenCalled();
    expect(text()).toContain('This checkout link is not valid');
  });

  it('an unreachable server can be tried again', async () => {
    let reads = 0;
    const { fixture, text, button } = render({
      view: () => (++reads === 1 ? throwError(() => new ApiError(0, null, true)) : of(checkout())),
    });
    await settle(fixture);
    expect(text()).toContain('The checkout could not be reached');
    button('Try Again')!.click();
    await settle(fixture);
    expect(button('Pay ₱6,820.50 (test)')).toBeDefined();
  });
});
