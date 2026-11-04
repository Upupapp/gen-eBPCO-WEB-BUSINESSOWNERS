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

/** The parts of an address that are filled in, joined on one line: "10 Rizal Street, Bonga, Castilla, Sorsogon". Empty when none is. */
export function addressLine(parts: ReadonlyArray<string | null | undefined>): string {
  return parts.map((part) => part?.trim() ?? '').filter((part) => part !== '').join(', ');
}

/**
 * The "Property" section: one "Location" row, printed once (design review,
 * 4 Nov 2026: a Barangay row repeated what the address already said, beside
 * an Owner address that said it a third time). The application's address as
 * filed; else the business's registered address on one line; else "Not on
 * file". The Admin Portal's permit preview prints the same row.
 */
export function propertyRows(location: string | null | undefined, business: BusinessAddress | undefined): PropertyRow[] {
  return [{ label: 'Location', value: propertyLine(location, business), wide: true }];
}

/** The one-line property, by the same rule (the Order of Payment's "Property"). */
export function propertyLine(location: string | null | undefined, business: BusinessAddress | undefined): string {
  const address = location?.trim() ?? '';
  if (address !== '') return address;
  const registered = addressLine([business?.street, business?.barangay, business?.city, business?.province]);
  return registered !== '' ? registered : 'Not on file';
}
