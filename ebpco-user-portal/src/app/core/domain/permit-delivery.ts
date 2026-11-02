import { UserAccount, fullName } from './user.model';

/**
 * Permit delivery (server migration 070, owner request 2026-11-03).
 *
 * The citizen chooses how to receive the issued permit: picked up at the
 * issuing office (the default) or delivered by courier, at their expense,
 * paid to the courier on arrival. Chosen when applying, changeable on the
 * application page until the permit is handed to the courier. The officer
 * records the courier and tracking number; the citizen confirms they received
 * it, which closes the application.
 *
 * Wire shapes are the server's (`GET/PUT /applications/:id/delivery`); the
 * address rules below are the server's `addressProblem`, word for word, so a
 * citizen is told before a round trip what the server would refuse.
 */

export type ReceiveBy = 'pickup' | 'delivery';

export type DeliveryStatus = 'requested' | 'out-for-delivery' | 'delivered' | 'received' | 'closed' | 'returned';

/** What the server accepts as a delivery address. */
export interface DeliveryAddress {
  recipientName: string;
  /** 09XXXXXXXXX or +639XXXXXXXXX. */
  recipientMobile: string;
  /** House number and street, or the purok. */
  addressLine: string;
  barangay: string;
  city: string;
  province: string;
  postalCode?: string | null;
  landmark?: string | null;
}

/** The server's `DeliveryView`. `status` is typed loosely on purpose: an unknown one must never break a screen. */
export interface DeliveryView extends DeliveryAddress {
  status: DeliveryStatus | (string & {});
  requestedAt: string;
  courier: string | null;
  trackingNumber: string | null;
  /** YYYY-MM-DD. */
  sentOn: string | null;
  /** YYYY-MM-DD. */
  deliveredOn: string | null;
  proofReference: string | null;
  receivedAt: string | null;
  closedAt: string | null;
  closeNote: string | null;
  returnedAt: string | null;
  returnReason: string | null;
  /** YYYY-MM-DD: the first day an officer may close it unconfirmed. */
  closableFrom: string | null;
}

/** `GET /applications/:id/delivery`, and the answer to PUT and to `.../received`. */
export interface PermitDeliveryState {
  receiveBy: ReceiveBy;
  delivery: DeliveryView | null;
  /** Until the permit is handed to the courier. */
  canChange: boolean;
  /** While it is with the courier, or delivered and not yet confirmed. */
  canConfirmReceipt: boolean;
  feeNote: string;
  /** Only on the confirmation's answer. */
  lifecycleStatus?: string;
}

export type DeliveryChoiceRequest =
  | { receiveBy: 'pickup' }
  | { receiveBy: 'delivery'; address: DeliveryAddress };

/** The address as the form holds it: every field a string, blanks included. */
export interface DeliveryAddressForm {
  recipientName: string;
  recipientMobile: string;
  addressLine: string;
  barangay: string;
  city: string;
  province: string;
  postalCode: string;
  landmark: string;
}

/** The choice as a form holds it, shared by the wizard and the application page. */
export interface DeliveryChoiceDraft {
  receiveBy: ReceiveBy;
  address: DeliveryAddressForm;
}

/** The server's own `feeNote`, shown until the server's copy has been read. */
export const DELIVERY_FEE_NOTE =
  'Delivery is at your expense: you pay the courier when the permit arrives. The Municipality collects nothing for it.';

const MOBILE = /^(09\d{9}|\+639\d{9})$/;

/** The server's `addressProblem`: why this address cannot be used, in the citizen's words, or null. */
export function deliveryAddressProblem(address: DeliveryAddressForm | DeliveryAddress): string | null {
  const blank = (value: string | null | undefined): boolean => (value ?? '').trim() === '';
  if ((address.recipientName ?? '').trim().length < 2) return 'Give the name of whoever will receive the permit.';
  if (!MOBILE.test((address.recipientMobile ?? '').replace(/[\s-]/g, ''))) {
    return 'Give a mobile number the courier can call (09XXXXXXXXX).';
  }
  if ((address.addressLine ?? '').trim().length < 3) return 'Give the house number and street, or the purok.';
  if (blank(address.barangay) || blank(address.city) || blank(address.province)) {
    return 'Give the barangay, city or municipality, and province.';
  }
  if (!blank(address.postalCode) && !/^[0-9]{4}$/.test((address.postalCode ?? '').trim())) {
    return 'A Philippine ZIP code is four digits.';
  }
  return null;
}

export function blankDeliveryAddress(): DeliveryAddressForm {
  return {
    recipientName: '', recipientMobile: '', addressLine: '', barangay: '', city: '', province: '', postalCode: '', landmark: '',
  };
}

/** Prefilled from the citizen's profile: their name, the account mobile, and their address. */
export function addressFromProfile(user: UserAccount | null | undefined): DeliveryAddressForm {
  if (!user) return blankDeliveryAddress();
  return {
    recipientName: fullName(user),
    recipientMobile: user.mobileNumber ?? '',
    addressLine: user.street ?? '',
    barangay: user.barangay ?? '',
    city: user.city ?? '',
    province: user.province ?? '',
    postalCode: user.postalCode ?? '',
    landmark: '',
  };
}

/** The address a delivery was asked for, back in the form (to change it, or to ask again after a return). */
export function addressFromDelivery(delivery: DeliveryAddress): DeliveryAddressForm {
  return {
    recipientName: delivery.recipientName ?? '',
    recipientMobile: delivery.recipientMobile ?? '',
    addressLine: delivery.addressLine ?? '',
    barangay: delivery.barangay ?? '',
    city: delivery.city ?? '',
    province: delivery.province ?? '',
    postalCode: delivery.postalCode ?? '',
    landmark: delivery.landmark ?? '',
  };
}

/** The PUT body for this choice; blank optional fields go as null. */
export function deliveryChoiceRequest(draft: DeliveryChoiceDraft): DeliveryChoiceRequest {
  if (draft.receiveBy === 'pickup') return { receiveBy: 'pickup' };
  const a = draft.address;
  return {
    receiveBy: 'delivery',
    address: {
      recipientName: a.recipientName.trim(),
      recipientMobile: a.recipientMobile.replace(/[\s-]/g, ''),
      addressLine: a.addressLine.trim(),
      barangay: a.barangay.trim(),
      city: a.city.trim(),
      province: a.province.trim(),
      postalCode: a.postalCode.trim() || null,
      landmark: a.landmark.trim() || null,
    },
  };
}

/** A YYYY-MM-DD date as the portal writes dates, read as a calendar day (not midnight UTC). */
export function formatDay(day: string | null): string {
  if (!day) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!m) return day;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    .toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** The address on one line: street, barangay, city, province, ZIP. */
export function deliveryAddressLine(a: DeliveryAddress): string {
  return [a.addressLine, a.barangay ? `Brgy. ${a.barangay}` : '', a.city, a.province, a.postalCode ?? '']
    .map((part) => (part ?? '').trim())
    .filter((part) => part !== '')
    .join(', ');
}

/**
 * Where the delivery stands, for the citizen: a heading and a sentence. The
 * contract's own meanings; anything the server adds later reads as a
 * delivery by courier rather than breaking the card.
 */
export function deliveryStatusText(delivery: DeliveryView): { title: string; detail: string } {
  switch (delivery.status) {
    case 'requested':
      return { title: 'Delivery requested', detail: 'We’ll send it by courier when your permit is ready.' };
    case 'out-for-delivery':
      return { title: 'On its way', detail: 'The courier has your permit. Follow it with the tracking number below.' };
    case 'delivered':
      return {
        title: 'The courier delivered it',
        detail: 'Please confirm that you received it.',
      };
    case 'received':
      return {
        title: delivery.receivedAt ? `Received on ${formatInstant(delivery.receivedAt)}` : 'Received',
        detail: 'You confirmed you received your permit. This application is complete.',
      };
    case 'closed':
      return {
        title: 'Delivered',
        detail: 'Closed by the office from the courier’s proof of delivery.',
      };
    case 'returned':
      return {
        title: 'The courier brought it back to the office',
        detail: 'You can claim it at the office, or ask for delivery again.',
      };
    default:
      return { title: 'Delivery by courier', detail: 'The office will update this when it has news of your permit.' };
  }
}

function formatInstant(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}
