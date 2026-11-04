import type { ApplyingAs } from './application.model';
import type { PermitType } from './permit.model';

/**
 * Who may apply for each permit type (ebpco-api migration 068, 2026-10-23).
 *
 * By law none of the permit types is business-only or residential-only: PD
 * 1096 Sec. 301 and its IRR say "any person, firm or corporation". So every
 * type is open to both by default, the portal says who USUALLY applies, and
 * the Municipality can restrict a type where a Castilla ordinance does; the
 * server enforces that at filing. The same wording is used in every app.
 */
export const BOTH_APPLICANT_KINDS: readonly ApplyingAs[] = ['residential', 'business'];

/**
 * `applicantKinds` as the server sent it, read defensively. Missing, empty or
 * unrecognised (an older server, a bad row) is both: hide nothing rather than
 * shut a citizen out on a guess.
 */
export function applicantKindsFrom(value: unknown): readonly ApplyingAs[] {
  if (!Array.isArray(value)) return BOTH_APPLICANT_KINDS;
  const kinds = BOTH_APPLICANT_KINDS.filter((kind) => value.includes(kind));
  return kinds.length === 0 ? BOTH_APPLICANT_KINDS : kinds;
}

/** The chip on a permit type: who may apply for it. */
export function applicantKindsChip(kinds: readonly ApplyingAs[]): string {
  const residential = kinds.includes('residential');
  const business = kinds.includes('business');
  if (business && !residential) return 'Business only';
  // One name for the applicant kind (design review I6): who applies, not what the building is for.
  if (residential && !business) return 'Private individuals only';
  return 'Homes & businesses';
}

/**
 * Who usually applies, for the few types where that is worth saying. Guidance
 * only: it never holds anyone back (a doctor's home clinic sign is filed by
 * the doctor, as a private individual).
 */
const USUAL_USE: Partial<Record<PermitType, string>> = {
  'Sign Permit': 'Usually a business sign; a home-based practice can apply as a private individual.',
  'Fencing Permit': 'Usually for homes.',
  'Interior Design Permit': 'Usually shop and office fit-outs.',
  'Certificate of Occupancy': 'After the building work is done, before the building is used.',
};

export function usualUseNote(type: PermitType | null, kinds?: readonly ApplyingAs[]): string | null {
  // A type the Municipality restricted to one kind says so in its chip; a note
  // about who USUALLY applies would only contradict it.
  if (kinds !== undefined && kinds.length < 2) return null;
  return type === null ? null : USUAL_USE[type] ?? null;
}

/**
 * Why "Applying as" `kind` cannot be chosen for `type`: the Municipality
 * accepts that type only from the other kind of applicant.
 */
export function applicantKindNotOpenMessage(type: PermitType, kind: ApplyingAs): string {
  const article = /^[AEIOU]/i.test(type) ? 'an' : 'a';
  const onlyFrom = kind === 'residential' ? 'for businesses' : 'from private individuals';
  return `Not open for ${article} ${type}: the Municipality accepts it only ${onlyFrom}.`;
}
