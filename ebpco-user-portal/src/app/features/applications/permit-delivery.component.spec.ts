import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { PermitDeliveryComponent } from './permit-delivery.component';
import { CitizenApiClient } from '../../core/api/citizen-api.client';
import { ApiError } from '../../core/api/problem';
import { AuthService } from '../../core/session/auth.service';
import {
  DELIVERY_FEE_NOTE, DeliveryChoiceDraft, DeliveryChoiceRequest, DeliveryView, PermitDeliveryState,
} from '../../core/domain/permit-delivery';
import { UserAccount } from '../../core/domain/user.model';

const USER = {
  id: 'u1', firstName: 'Maria', middleName: null, lastName: 'Santos', mobileNumber: '09181234567',
  street: 'Purok 5', barangay: 'San Rafael', city: 'Castilla', province: 'Sorsogon', postalCode: '4713',
} as unknown as UserAccount;

function delivery(over: Partial<DeliveryView> = {}): DeliveryView {
  return {
    status: 'requested', recipientName: 'Juan Dela Cruz', recipientMobile: '09171234567', addressLine: 'Rizal St.',
    barangay: 'Poblacion', city: 'Castilla', province: 'Sorsogon', postalCode: null, landmark: 'Green gate',
    requestedAt: '2026-11-03T01:00:00.000Z', courier: null, trackingNumber: null, sentOn: null, deliveredOn: null,
    proofReference: null, receivedAt: null, closedAt: null, closeNote: null, returnedAt: null, returnReason: null,
    closableFrom: null, ...over,
  };
}

function state(over: Partial<PermitDeliveryState> = {}): PermitDeliveryState {
  return { receiveBy: 'pickup', delivery: null, canChange: true, canConfirmReceipt: false, feeNote: DELIVERY_FEE_NOTE, ...over };
}

interface Testable {
  editing(): DeliveryChoiceDraft | null;
  save(): Promise<void>;
  confirmReceived(): Promise<void>;
}

interface Calls { put: { id: string; body: DeliveryChoiceRequest }[]; received: string[] }

function render(initial: PermitDeliveryState, api: {
  setDelivery?: (id: string, body: DeliveryChoiceRequest) => Observable<PermitDeliveryState>;
  confirmPermitReceived?: (id: string) => Observable<PermitDeliveryState>;
} = {}) {
  const calls: Calls = { put: [], received: [] };
  TestBed.configureTestingModule({
    imports: [PermitDeliveryComponent],
    providers: [
      { provide: AuthService, useValue: { currentUser: () => USER } },
      {
        provide: CitizenApiClient,
        useValue: {
          configured: true,
          setDelivery: (id: string, body: DeliveryChoiceRequest) => {
            calls.put.push({ id, body });
            return api.setDelivery ? api.setDelivery(id, body) : of(state());
          },
          confirmPermitReceived: (id: string) => {
            calls.received.push(id);
            return api.confirmPermitReceived ? api.confirmPermitReceived(id) : of(state());
          },
        } as Partial<CitizenApiClient>,
      },
    ],
  });
  const fixture = TestBed.createComponent(PermitDeliveryComponent);
  fixture.componentRef.setInput('applicationId', 'app-1');
  fixture.componentRef.setInput('state', initial);
  fixture.componentRef.setInput('permitNumber', 'FP-2026-000001');
  fixture.detectChanges();
  const emitted: { stateChange: PermitDeliveryState[]; received: PermitDeliveryState[] } = { stateChange: [], received: [] };
  fixture.componentInstance.stateChange.subscribe((s) => emitted.stateChange.push(s));
  fixture.componentInstance.received.subscribe((s) => emitted.received.push(s));
  return { fixture, calls, emitted, page: fixture.componentInstance as unknown as Testable };
}

const el = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;
const click = async (f: ComponentFixture<unknown>, selector: string) => {
  const button = el(f).querySelector<HTMLButtonElement>(selector);
  expect(button, selector).not.toBeNull();
  button!.click();
  f.detectChanges();
  await f.whenStable();
  // A handler that awaits (a request, the clipboard) settles on a later turn.
  await new Promise((resolve) => setTimeout(resolve, 0));
  f.detectChanges();
};

describe('PermitDeliveryComponent — Receiving your permit (migration 070)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('a pick-up says so, and Change switches it to delivery to the citizen’s own address', async () => {
    const next = state({ receiveBy: 'delivery', delivery: delivery({ recipientName: 'Maria Santos', city: 'Castilla' }) });
    const { fixture, calls, emitted, page } = render(state(), { setDelivery: () => of(next) });
    expect(el(fixture).querySelector('#delivery-choice')?.textContent).toContain('Pick up at the office');

    await click(fixture, '#delivery-change');
    expect(el(fixture).querySelector('#receive-by-pickup')).not.toBeNull();
    // Delivery is offered on the citizen's own profile address.
    const draft = page.editing()!;
    expect(draft.address.recipientName).toBe('Maria Santos');
    expect(draft.address.recipientMobile).toBe('09181234567');
    await click(fixture, '#receive-by-delivery');
    expect(draft.receiveBy).toBe('delivery');
    expect(el(fixture).querySelector('#delivery-fee-note')?.textContent).toContain('you pay the courier when the permit arrives');
    expect(el(fixture).querySelector<HTMLInputElement>('#delivery-recipient-name')?.value).toBe('Maria Santos');

    await page.save();
    expect(calls.put).toEqual([{
      id: 'app-1',
      body: {
        receiveBy: 'delivery',
        address: {
          recipientName: 'Maria Santos', recipientMobile: '09181234567', addressLine: 'Purok 5', barangay: 'San Rafael',
          city: 'Castilla', province: 'Sorsogon', postalCode: '4713', landmark: null,
        },
      },
    }]);
    expect(emitted.stateChange).toEqual([next]);
    expect(page.editing()).toBeNull();
  });

  it('checks the address like the server before sending it', async () => {
    const { fixture, calls, page } = render(state());
    await click(fixture, '#delivery-change');
    const draft = page.editing()!;
    draft.receiveBy = 'delivery';
    draft.address.recipientMobile = '12345';
    await page.save();
    fixture.detectChanges();
    expect(calls.put).toEqual([]);
    expect(el(fixture).querySelector('#delivery-address-problem')?.textContent)
      .toContain('Give a mobile number the courier can call (09XXXXXXXXX).');
  });

  it('shows the server’s refusal when the permit has already left', async () => {
    const refused = new ApiError(409, { detail: 'The permit has already left the office, so how it reaches you can no longer change.' }, false);
    const { fixture, page } = render(
      state({ receiveBy: 'delivery', delivery: delivery() }),
      { setDelivery: () => throwError(() => refused) },
    );
    await click(fixture, '#delivery-change');
    await page.save();
    fixture.detectChanges();
    expect(el(fixture).querySelector('#delivery-address-problem')?.textContent).toContain('already left the office');
  });

  it('out for delivery: the courier, the tracking number (copyable) and the date sent; no Change', async () => {
    const { fixture } = render(state({
      receiveBy: 'delivery', canChange: false, canConfirmReceipt: true,
      delivery: delivery({ status: 'out-for-delivery', courier: 'LBC Express', trackingNumber: 'LBC123456', sentOn: '2026-11-03' }),
    }));
    const text = el(fixture).textContent ?? '';
    expect(el(fixture).querySelector('#delivery-status-title')?.textContent).toContain('On its way');
    expect(el(fixture).querySelector('#delivery-courier')?.textContent).toContain('LBC Express');
    expect(el(fixture).querySelector('#delivery-tracking-number')?.textContent).toBe('LBC123456');
    expect(el(fixture).querySelector('#delivery-sent-on')?.textContent).toContain('2026');
    expect(text).toContain('Juan Dela Cruz');
    expect(el(fixture).querySelector('#delivery-change')).toBeNull();

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await click(fixture, '#delivery-copy-tracking');
    expect(writeText).toHaveBeenCalledWith('LBC123456');
    expect(el(fixture).querySelector('#delivery-copy-tracking')?.textContent?.trim()).toBe('Copied');
  });

  it('"I received my permit" asks first, then closes the application', async () => {
    const done = state({
      receiveBy: 'delivery', canChange: false, canConfirmReceipt: false, lifecycleStatus: 'Completed',
      delivery: delivery({ status: 'received', receivedAt: '2026-11-05T02:00:00.000Z', courier: 'LBC Express', trackingNumber: 'LBC1' }),
    });
    const { fixture, calls, emitted } = render(
      state({
        receiveBy: 'delivery', canChange: false, canConfirmReceipt: true,
        delivery: delivery({ status: 'delivered', courier: 'LBC Express', trackingNumber: 'LBC1', deliveredOn: '2026-11-04', closableFrom: '2026-11-11' }),
      }),
      { confirmPermitReceived: () => of(done) },
    );
    expect(el(fixture).textContent).toContain('the office may close it');

    await click(fixture, '#delivery-received');
    expect(calls.received).toEqual([]);
    expect(el(fixture).querySelector('#delivery-received-confirm')?.textContent).toContain('FP-2026-000001');

    await click(fixture, '#delivery-received-cancel');
    expect(el(fixture).querySelector('#delivery-received-confirm')).toBeNull();

    await click(fixture, '#delivery-received');
    await click(fixture, '#delivery-received-yes');
    expect(calls.received).toEqual(['app-1']);
    expect(emitted.received).toEqual([done]);

    fixture.componentRef.setInput('state', done);
    fixture.detectChanges();
    expect(el(fixture).querySelector('#delivery-status-title')?.textContent).toMatch(/Received on /);
    expect(el(fixture).querySelector('#delivery-received')).toBeNull();
  });

  it('returned: the reason, and Ask for delivery again on the same address', async () => {
    const { fixture, page } = render(state({
      receiveBy: 'delivery', canChange: true,
      delivery: delivery({ status: 'returned', courier: 'PHLPost', trackingNumber: 'RR1PH', returnReason: 'Nobody home after three tries' }),
    }));
    expect(el(fixture).querySelector('#delivery-status-title')?.textContent).toContain('brought it back');
    expect(el(fixture).querySelector('#delivery-return-reason')?.textContent).toContain('Nobody home after three tries');
    await click(fixture, '#delivery-ask-again');
    expect(page.editing()).toEqual({
      receiveBy: 'delivery',
      address: {
        recipientName: 'Juan Dela Cruz', recipientMobile: '09171234567', addressLine: 'Rizal St.', barangay: 'Poblacion',
        city: 'Castilla', province: 'Sorsogon', postalCode: '', landmark: 'Green gate',
      },
    });
  });

  it('a delivery status it does not know still renders', () => {
    const { fixture } = render(state({ receiveBy: 'delivery', delivery: delivery({ status: 'held-at-hub' }), canChange: false }));
    expect(el(fixture).querySelector('#delivery-status-title')?.textContent).toContain('Delivery by courier');
  });
});
