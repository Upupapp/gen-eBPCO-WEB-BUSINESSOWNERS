import {
  BOTH_APPLICANT_KINDS, applicantKindNotOpenMessage, applicantKindsChip, applicantKindsFrom, usualUseNote,
} from './applicant-kinds';
import { FILEABLE_PERMIT_TYPES } from './permit.model';

/**
 * Who may apply for each permit type (migration 068): open to both unless the
 * Municipality restricted it, worded the same in every app.
 */
describe('Who may apply for a permit type', () => {
  it('names the chip the same way everywhere', () => {
    expect(applicantKindsChip(['residential', 'business'])).toBe('Homes & businesses');
    expect(applicantKindsChip(['business'])).toBe('Business only');
    expect(applicantKindsChip(['residential'])).toBe('Residential only');
  });

  it('reads a missing, empty or unknown answer as both, so an older server hides nothing', () => {
    expect(applicantKindsFrom(undefined)).toEqual(BOTH_APPLICANT_KINDS);
    expect(applicantKindsFrom(null)).toEqual(BOTH_APPLICANT_KINDS);
    expect(applicantKindsFrom([])).toEqual(BOTH_APPLICANT_KINDS);
    expect(applicantKindsFrom(['someone else'])).toEqual(BOTH_APPLICANT_KINDS);
    expect(applicantKindsFrom(['business'])).toEqual(['business']);
    expect(applicantKindsFrom(['residential'])).toEqual(['residential']);
    expect(applicantKindsFrom(['business', 'residential'])).toEqual(['residential', 'business']);
  });

  it('says who usually applies only for Sign, Fencing, Interior Design and the Certificate of Occupancy', () => {
    const withNote = FILEABLE_PERMIT_TYPES.filter((type) => usualUseNote(type) !== null).sort();
    expect(withNote).toEqual(['Certificate of Occupancy', 'Fencing Permit', 'Interior Design Permit', 'Sign Permit']);
    expect(usualUseNote('Sign Permit')).toBe('Usually a business sign; a home-based practice can apply as Residential.');
    expect(usualUseNote('Fencing Permit')).toBe('Usually for homes.');
    expect(usualUseNote('Interior Design Permit')).toBe('Usually shop and office fit-outs.');
    expect(usualUseNote('Certificate of Occupancy')).toBe('After the building work is done, before the building is used.');
    expect(usualUseNote(null)).toBeNull();
  });

  it('explains a kind that is not open, with "an" before a vowel and "a" otherwise', () => {
    expect(applicantKindNotOpenMessage('Sign Permit', 'residential'))
      .toBe('Not open for a Sign Permit: the Municipality accepts it only for businesses.');
    expect(applicantKindNotOpenMessage('Fencing Permit', 'business'))
      .toBe('Not open for a Fencing Permit: the Municipality accepts it only from private individuals.');
    expect(applicantKindNotOpenMessage('Interior Design Permit', 'residential'))
      .toBe('Not open for an Interior Design Permit: the Municipality accepts it only for businesses.');
    expect(applicantKindNotOpenMessage('Excavation Permit', 'business'))
      .toBe('Not open for an Excavation Permit: the Municipality accepts it only from private individuals.');
    expect(applicantKindNotOpenMessage('Certificate of Occupancy', 'residential'))
      .toBe('Not open for a Certificate of Occupancy: the Municipality accepts it only for businesses.');
  });
});
