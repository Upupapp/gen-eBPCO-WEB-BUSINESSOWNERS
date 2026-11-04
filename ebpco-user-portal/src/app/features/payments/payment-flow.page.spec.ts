import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { PaymentFlowPage } from './payment-flow.page';
import { CitizenApiClient } from '../../core/api/citizen-api.client';
import { ApplicationSummary, GcashCheckoutStart, PaymentMethodOption } from '../../core/api/citizen-api.models';
import { ApiError } from '../../core/api/problem';
import { ApplicationStore } from '../../core/stores/application.store';

/**
 * The payment page lists the methods the LGU accepts right now (`GET
 * /payment-methods`, ebpco-api 071), Onsite alone when that cannot be read,
 * and never Bank Transfer while the Municipality has published no deposit
 * account (DEFAULT_BANK_INFO is null). GCash opens its checkout: the server
 * names the amount and returns the portal's own checkout page to go to.
 */
const GCASH: PaymentMethodOption = {
  method: 'GCash', label: 'GCash', instructions: 'Pay online with GCash. You are sent to the GCash checkout.', mode: 'test',
};
const ONSITE: PaymentMethodOption = { method: 'Onsite', label: 'Onsite', instructions: 'Pay at the Municipal Hall.' };
const BANK: PaymentMethodOption = { method: 'Bank Transfer', label: 'Bank Transfer', instructions: 'Deposit.' };

const ORDER: NonNullable<ApplicationSummary['payment']['orderOfPayment']> = {
  number: 'OP-2026-000045', assessedAt: '2026-11-04T00:00:00.000Z', dueDate: null, feeScheduleVersion: 'v1',
  fees: { filing: 500000, processing: 182050, architectural: 0, structural: 0, electrical: 0, others: 0 },
  totalCentavos: 682050,
};

function start(checkoutUrl: string): GcashCheckoutStart {
  return {
    checkoutId: 'chk-1', reference: 'GC-TEST-AB12CD34EF', amount: 6820.5, amountCentavos: 682050,
    expiresAt: '2026-11-04T08:30:00.000Z', mode: 'test', checkoutUrl,
  };
}

function render(options: {
  methods: () => Observable<PaymentMethodOption[]>;
  startGcash?: () => Observable<GcashCheckoutStart>;
}) {
  const startGcashPayment = vi.fn(options.startGcash ?? (() => of(start(`${window.location.origin}/pay/gcash/chk-1?t=secret`))));
  TestBed.configureTestingModule({
    imports: [PaymentFlowPage],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ applicationId: 'app-1' }) } } },
      { provide: ApplicationStore, useValue: {
          applicationById: (id: string) => ({ id, applicationNumber: 'BP-2026-000123', permitType: 'Building Permit' }),
          assessmentFor: () => undefined,
        } },
      { provide: CitizenApiClient, useValue: {
          configured: true,
          getPaymentMethods: options.methods,
          getApplication: () => of({ payment: { status: 'Not Yet Available', orderOfPayment: ORDER } }),
          startGcashPayment,
        } },
    ],
  });
  const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(PaymentFlowPage);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const page = fixture.componentInstance as unknown as { leaveTo(url: string): void; method(): string; error(): string | null };
  const radios = () => Array.from(el.querySelectorAll<HTMLInputElement>('input[name="payment-flow-method"]'));
  const cards = () => Array.from(el.querySelectorAll<HTMLElement>('.choice-card')).map((c) => [
    c.querySelector('strong')?.textContent?.trim(),
    c.querySelector('.choice-card-blurb')?.textContent?.trim(),
    c.querySelector('.badge')?.textContent?.trim() ?? null,
  ]);
  const button = (text: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
  const choose = (method: string) => {
    radios().find((r) => r.value === method)!.click();
    fixture.detectChanges();
  };
  return { fixture, el, page, radios, cards, button, choose, navigateByUrl, startGcashPayment };
}

async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();
  }
  fixture.detectChanges();
}

describe('PaymentFlowPage — payment methods, and GCash', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('offers what the server lists, with GCash in test mode, but no Bank Transfer while no account is published', () => {
    const { radios, cards, page } = render({ methods: () => of([BANK, GCASH, ONSITE]) });
    expect(radios().map((r) => r.value)).toEqual(['GCash', 'Onsite']);
    expect(cards()).toEqual([
      // The radio card every method uses; GCash in test mode carries the "Test mode" chip.
      ['GCash', 'Pay online. No real money is charged.', 'Test mode'],
      ['Onsite Payment', 'Pay at the Municipal Hall, then mark it paid here.', null],
    ]);
    // Onsite stays the starting choice, as before.
    expect(page.method()).toBe('Onsite');
  });

  it('GCash: "Pay with GCash" opens the checkout the server returns, on this site', async () => {
    const { fixture, el, choose, button, navigateByUrl, startGcashPayment } = render({ methods: () => of([GCASH, ONSITE]) });
    choose('GCash');
    expect(el.textContent).toContain('You go to the checkout page to pay ₱6,820.50.');
    expect(el.textContent).toContain('no real money is charged');
    expect(button('Mark as Paid')).toBeUndefined();

    button('Pay with GCash')!.click();
    await settle(fixture);

    expect(startGcashPayment).toHaveBeenCalledWith('app-1');
    expect(navigateByUrl).toHaveBeenCalledWith('/pay/gcash/chk-1?t=secret');
  });

  it('GCash: a checkout on another origin is opened with a full page load', async () => {
    const elsewhere = 'https://citizen.castilla.example/pay/gcash/chk-1?t=secret';
    const { fixture, page, choose, button, navigateByUrl } = render({
      methods: () => of([GCASH, ONSITE]),
      startGcash: () => of(start(elsewhere)),
    });
    const leaveTo = vi.spyOn(page, 'leaveTo').mockImplementation(() => {});
    choose('GCash');
    button('Pay with GCash')!.click();
    await settle(fixture);

    expect(leaveTo).toHaveBeenCalledWith(elsewhere);
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it("GCash: shows the server's reason when it will not open a checkout", async () => {
    const detail = 'A payment for this application is already waiting for the Cashier to verify it.';
    const { fixture, el, choose, button, navigateByUrl } = render({
      methods: () => of([GCASH, ONSITE]),
      startGcash: () => throwError(() => new ApiError(422, { title: 'A precondition is unmet', status: 422, detail }, false)),
    });
    choose('GCash');
    button('Pay with GCash')!.click();
    await settle(fixture);

    expect(el.textContent).toContain(detail);
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('falls back to Onsite alone when the methods cannot be read', () => {
    const { el, radios, button } = render({ methods: () => throwError(() => new Error('offline')) });
    expect(radios()).toEqual([]);
    expect(el.textContent).toContain('Pay onsite at the Municipal Hall.');
    expect(button('Mark as Paid')).toBeDefined();
    expect(button('Pay with GCash')).toBeUndefined();
  });

  it('offers GCash alone, straight away, when it is the only method open', () => {
    const { el, radios, button } = render({ methods: () => of([GCASH]) });
    expect(radios()).toEqual([]);
    expect(el.textContent).not.toContain('Pay onsite at the Municipal Hall.');
    expect(button('Pay with GCash')).toBeDefined();
  });
});
