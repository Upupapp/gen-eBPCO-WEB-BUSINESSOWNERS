import { BALANCE, TOTAL_AMOUNT_DUE } from './assessment-view';

/**
 * The permit's one field map (design review I3, 4 Nov 2026): the office's
 * copy (the Admin Portal's permit preview) and the citizen's disagreed on
 * about six fields for the same permit, which made one of them look forged.
 * Every label the printed permit shows comes from here, in this order, and the
 * Admin Portal's preview prints the same list. Each repo pins its own copy in
 * a spec (permit-document.page.spec.ts here); change both together.
 *
 * Sources: the owner's name, contact and address from the citizen's account
 * (the Admin preview reads the same account; a snapshot on the permit row is a
 * backend job); Location from the application's own site; Business name only
 * on a business application, so the occupancy is the only statement of use.
 */
export const PERMIT_LABELS = {
  permitNo: 'Permit No.',
  applicationNo: 'Application No.',
  dateIssued: 'Date issued',
  validUntil: 'Valid until',
  ownerName: 'Owner / Permittee name',
  businessName: 'Business name',
  contactNumber: 'Contact number',
  address: 'Address',
  location: 'Location',
  applicationType: 'Application type',
  dateApplied: 'Date applied',
  occupancy: 'Use or character of occupancy',
  scope: 'Scope',
  fee: 'Fee',
  amount: 'Amount',
  totalAmountDue: TOTAL_AMOUNT_DUE,
  balance: BALANCE,
  orderOfPaymentNo: 'Order of Payment No.',
} as const;

/** The permit's sections, in order. "Owner / Applicant" mirrors BOX 1 of the LGU's Unified Application Form. */
export const PERMIT_SECTIONS = ['Owner / Applicant', 'Property', 'Project', 'Assessment / Payment', 'Conditions', 'Approval'] as const;

/** What the Conditions section says when the office recorded none: a fact, in normal ink, never a warning. */
export const NO_CONDITIONS_NOTE = 'No conditions were recorded by the office.';
