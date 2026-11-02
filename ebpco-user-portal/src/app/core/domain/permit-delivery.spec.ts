import {
  DeliveryAddressForm, DeliveryView, addressFromDelivery, addressFromProfile, blankDeliveryAddress, deliveryAddressLine,
  deliveryAddressProblem, deliveryChoiceRequest, deliveryStatusText, formatDay,
} from './permit-delivery';
import { UserAccount } from './user.model';

const GOOD: DeliveryAddressForm = {
  recipientName: 'Juan Dela Cruz', recipientMobile: '0917 123 4567', addressLine: 'Purok 3, Rizal St.',
  barangay: 'Poblacion', city: 'Castilla', province: 'Sorsogon', postalCode: '', landmark: '',
};

function delivery(over: Partial<DeliveryView> = {}): DeliveryView {
  return {
    status: 'requested', recipientName: 'Juan Dela Cruz', recipientMobile: '09171234567', addressLine: 'Purok 3, Rizal St.',
    barangay: 'Poblacion', city: 'Castilla', province: 'Sorsogon', postalCode: '4713', landmark: 'Beside the chapel',
    requestedAt: '2026-11-03T01:00:00.000Z', courier: null, trackingNumber: null, sentOn: null, deliveredOn: null,
    proofReference: null, receivedAt: null, closedAt: null, closeNote: null, returnedAt: null, returnReason: null,
    closableFrom: null, ...over,
  };
}

/** The server's `addressProblem` (delivery.service.ts), mirrored so the citizen is told before a round trip. */
describe('deliveryAddressProblem — the server’s own rules', () => {
  it('accepts a full address, the mobile written with spaces or dashes, and no ZIP code', () => {
    expect(deliveryAddressProblem(GOOD)).toBeNull();
    expect(deliveryAddressProblem({ ...GOOD, recipientMobile: '0917-123-4567' })).toBeNull();
    expect(deliveryAddressProblem({ ...GOOD, recipientMobile: '+639171234567' })).toBeNull();
  });

  it('says what is missing, in the server’s words', () => {
    expect(deliveryAddressProblem({ ...GOOD, recipientName: 'J' })).toBe('Give the name of whoever will receive the permit.');
    expect(deliveryAddressProblem({ ...GOOD, recipientMobile: '12345' }))
      .toBe('Give a mobile number the courier can call (09XXXXXXXXX).');
    expect(deliveryAddressProblem({ ...GOOD, addressLine: ' 1 ' })).toBe('Give the house number and street, or the purok.');
    for (const key of ['barangay', 'city', 'province'] as const) {
      expect(deliveryAddressProblem({ ...GOOD, [key]: '  ' })).toBe('Give the barangay, city or municipality, and province.');
    }
    expect(deliveryAddressProblem({ ...GOOD, postalCode: '471' })).toBe('A Philippine ZIP code is four digits.');
    expect(deliveryAddressProblem({ ...GOOD, postalCode: '4713' })).toBeNull();
  });
});

describe('the delivery address form', () => {
  it('is prefilled from the profile: their name, the account mobile, and their address', () => {
    const user = {
      firstName: 'Maria', middleName: 'Reyes', lastName: 'Santos', mobileNumber: '09181234567',
      street: 'Purok 5', barangay: 'San Rafael', city: 'Castilla', province: 'Sorsogon', postalCode: '4713',
    } as UserAccount;
    expect(addressFromProfile(user)).toEqual({
      recipientName: 'Maria Reyes Santos', recipientMobile: '09181234567', addressLine: 'Purok 5',
      barangay: 'San Rafael', city: 'Castilla', province: 'Sorsogon', postalCode: '4713', landmark: '',
    });
    expect(addressFromProfile(null)).toEqual(blankDeliveryAddress());
  });

  it('reopens on the address a delivery was asked for', () => {
    expect(addressFromDelivery(delivery({ postalCode: null, landmark: null }))).toEqual({
      recipientName: 'Juan Dela Cruz', recipientMobile: '09171234567', addressLine: 'Purok 3, Rizal St.',
      barangay: 'Poblacion', city: 'Castilla', province: 'Sorsogon', postalCode: '', landmark: '',
    });
  });

  it('sends a pick-up with no address, and a delivery trimmed, blank optional fields as null', () => {
    expect(deliveryChoiceRequest({ receiveBy: 'pickup', address: GOOD })).toEqual({ receiveBy: 'pickup' });
    expect(deliveryChoiceRequest({ receiveBy: 'delivery', address: { ...GOOD, city: ' Castilla ' } })).toEqual({
      receiveBy: 'delivery',
      address: {
        recipientName: 'Juan Dela Cruz', recipientMobile: '09171234567', addressLine: 'Purok 3, Rizal St.',
        barangay: 'Poblacion', city: 'Castilla', province: 'Sorsogon', postalCode: null, landmark: null,
      },
    });
  });

  it('writes the address on one line', () => {
    expect(deliveryAddressLine(delivery())).toBe('Purok 3, Rizal St., Brgy. Poblacion, Castilla, Sorsogon, 4713');
  });
});

describe('deliveryStatusText — where the delivery stands, for the citizen', () => {
  it('names each state the contract lists', () => {
    expect(deliveryStatusText(delivery()).title).toBe('Delivery requested');
    expect(deliveryStatusText(delivery({ status: 'out-for-delivery' })).title).toBe('On its way');
    expect(deliveryStatusText(delivery({ status: 'delivered' })).detail).toContain('confirm');
    expect(deliveryStatusText(delivery({ status: 'received', receivedAt: '2026-11-05T02:00:00.000Z' })).title).toMatch(/^Received on /);
    expect(deliveryStatusText(delivery({ status: 'closed' })).detail).toContain('proof of delivery');
    expect(deliveryStatusText(delivery({ status: 'returned' })).title).toBe('The courier brought it back to the office');
  });

  it('never breaks on a status it does not know', () => {
    expect(deliveryStatusText(delivery({ status: 'lost-in-transit' })).title).toBe('Delivery by courier');
  });
});

describe('formatDay', () => {
  it('reads YYYY-MM-DD as that calendar day', () => {
    expect(formatDay('2026-11-03')).toContain('3');
    expect(formatDay('2026-11-03')).toContain('2026');
    expect(formatDay(null)).toBe('—');
  });
});
