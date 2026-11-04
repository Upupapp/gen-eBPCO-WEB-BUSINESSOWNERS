import { Business } from './business.model';
import { CASTILLA_BARANGAYS } from './ph-reference-data';

/**
 * The property an application is for, as its printed documents (the permit,
 * the payment receipt, the Order of Payment) show it.
 *
 * The application's own project / property address (`location`, typed in the
 * wizard's Details step) comes first: a Residential application names no
 * business, so reading the business's address printed "Not on file" for every
 * home (4 Nov 2026). The business's registered address is used only for an
 * application that gave none. The same rule as the app's
 * lib/domain/property_address.dart.
 */

type BusinessAddress = Pick<Business, 'street' | 'barangay' | 'city' | 'province'>;

/** One row of a document's "Property" section; `wide` spans both columns (a whole address). */
export interface PropertyRow {
  readonly label: string;
  readonly value: string;
  readonly wide: boolean;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The one Castilla barangay `address` names, or null when it names none, or more than one (a street can share a barangay's name), so nothing is guessed. */
export function barangayIn(address: string): string | null {
  const text = address.toLowerCase();
  const named = new Set<string>();
  for (const barangay of CASTILLA_BARANGAYS) {
    if (new RegExp(`(^|[^a-z])${escapeRegExp(barangay.toLowerCase())}($|[^a-z])`).test(text)) named.add(barangay);
  }
  return named.size === 1 ? [...named][0] : null;
}

/**
 * The "Property" section's rows: the application's address as filed, with its
 * barangay when it names one; else the business's address; else the four rows
 * marked "Not on file".
 */
export function propertyRows(location: string | null | undefined, business: BusinessAddress | undefined): PropertyRow[] {
  const address = location?.trim() ?? '';
  if (address !== '') {
    const barangay = barangayIn(address);
    return [
      ...(barangay !== null ? [{ label: 'Barangay', value: barangay, wide: false }] : []),
      { label: 'Street / Location', value: address, wide: true },
    ];
  }
  return [
    { label: 'Barangay', value: business?.barangay ?? 'Not on file', wide: false },
    { label: 'City / Municipality', value: business?.city ?? 'Not on file', wide: false },
    { label: 'Street / Location', value: business?.street ?? 'Not on file', wide: false },
    { label: 'Province', value: business?.province ?? 'Not on file', wide: false },
  ];
}

/** The one-line "Property" on the Order of Payment, by the same rule. */
export function propertyLine(location: string | null | undefined, business: BusinessAddress | undefined): string {
  const address = location?.trim() ?? '';
  if (address !== '') return address;
  return business ? `${business.street}, ${business.barangay}, ${business.city}` : 'Not on file';
}
