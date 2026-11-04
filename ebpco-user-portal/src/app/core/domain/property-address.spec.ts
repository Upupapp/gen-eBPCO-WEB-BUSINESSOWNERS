import { barangayIn, propertyLine, propertyRows } from './property-address';

/** The property a printed document shows: the application's own address first, the business's only when it gave none. */
describe('property-address', () => {
  const business = { street: '123 Rizal Street', barangay: 'Poblacion', city: 'Castilla', province: 'Sorsogon' };

  it('finds the one Castilla barangay an address names, and guesses nothing else', () => {
    expect(barangayIn('Purok 3, San Isidro, Castilla')).toBe('San Isidro');
    expect(barangayIn('purok 3, san isidro')).toBe('San Isidro');
    expect(barangayIn('Sitio Malapad, Castilla, Sorsogon')).toBeNull();
    // Two named: not guessed.
    expect(barangayIn('Cogon Road, Poblacion')).toBeNull();
    // Part of a longer word is not a barangay.
    expect(barangayIn('Oraside Subdivision')).toBeNull();
  });

  it("uses the application's address, with its barangay, over the business's", () => {
    expect(propertyRows(' 12 Rizal St., Poblacion, Castilla ', business)).toEqual([
      { label: 'Barangay', value: 'Poblacion', wide: false },
      { label: 'Street / Location', value: '12 Rizal St., Poblacion, Castilla', wide: true },
    ]);
    expect(propertyRows('Lot 4, Sitio Malapad', undefined)).toEqual([
      { label: 'Street / Location', value: 'Lot 4, Sitio Malapad', wide: true },
    ]);
    expect(propertyLine('Lot 4, Sitio Malapad', business)).toBe('Lot 4, Sitio Malapad');
  });

  it("falls back to the business's address, else 'Not on file'", () => {
    expect(propertyRows(null, business).map((r) => [r.label, r.value])).toEqual([
      ['Barangay', 'Poblacion'],
      ['City / Municipality', 'Castilla'],
      ['Street / Location', '123 Rizal Street'],
      ['Province', 'Sorsogon'],
    ]);
    expect(propertyRows('   ', undefined).every((r) => r.value === 'Not on file')).toBe(true);
    expect(propertyLine(undefined, business)).toBe('123 Rizal Street, Poblacion, Castilla');
    expect(propertyLine(null, undefined)).toBe('Not on file');
  });
});
