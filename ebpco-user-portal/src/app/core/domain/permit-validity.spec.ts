import { NO_FIXED_EXPIRY, NOT_RECORDED, permitValidityText } from './permit-validity';

describe("A permit's validity line (backend 655acc6)", () => {
  const format = (iso: string) => `formatted ${iso}`;

  it('prints the date when there is one', () => {
    expect(permitValidityText('Building Permit', '2027-11-04', format)).toBe('formatted 2027-11-04');
  });

  it('says a Certificate of Occupancy has no fixed expiry, and why', () => {
    expect(permitValidityText('Certificate of Occupancy', null, format)).toBe(
      "No fixed expiry (valid while the building's use and occupancy stay the same)",
    );
    expect(NO_FIXED_EXPIRY).toContain('No fixed expiry');
  });

  it('says a neutral "Not recorded" for any other permit with no date, never "by the office"', () => {
    expect(permitValidityText('Fencing Permit', undefined, format)).toBe('Not recorded');
    expect(NOT_RECORDED).toBe('Not recorded');
  });
});
