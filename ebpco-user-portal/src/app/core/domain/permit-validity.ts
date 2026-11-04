/**
 * What a printed permit or certificate says when a line has no value (backend
 * 655acc6, 4 Nov 2026). A Certificate of Occupancy has no expiry by design, so
 * it says why rather than "Not recorded by the office"; any other permit with
 * no date, or an old permit with no approving official or office, reads a
 * neutral "Not recorded". The same words as the Admin Portal's copy.
 */

export const NO_FIXED_EXPIRY = "No fixed expiry (valid while the building's use and occupancy stay the same)";
export const NOT_RECORDED = 'Not recorded';

/** The "Valid until" value: the date, formatted; else why there is none. */
export function permitValidityText(
  permitType: string | null | undefined,
  expiryDate: string | null | undefined,
  format: (iso: string) => string,
): string {
  if (expiryDate) return format(expiryDate);
  return permitType === 'Certificate of Occupancy' ? NO_FIXED_EXPIRY : NOT_RECORDED;
}
