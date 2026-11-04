/**
 * The Municipality of Castilla's real contact details — the SINGLE source of
 * truth for every screen that tells a user how to reach the LGU.
 *
 * Every value below is transcribed from a document bundled in this repository,
 * and the source is named beside it. Nothing here may be invented, guessed or
 * "filled in for now": the screens that previously did so shipped a phone
 * number of zeroes and a support mailbox that does not exist, while the real
 * details sat two directories away in `assets/`. If a value is not in a source
 * document, it does not belong in this file — leave it out and say so on the
 * screen rather than inventing a plausible one.
 */

export interface LguOffice {
  /** The office's one full name (OFFICES below). */
  readonly name: string;
  readonly shortName: string;
  readonly email: string;
  /** Null where no published number exists — render nothing, never a placeholder. */
  readonly mobile: string | null;
  readonly handles: string;
}

/** One office as every screen and document names it: the full name, and the short form for chips and tight cells only. */
export interface OfficeName {
  readonly name: string;
  readonly short: string;
}

/**
 * The ONE place an office's name comes from (design review, 4 Nov 2026: one
 * citizen permit named its issuer three ways, and the pay page sent cash to a
 * fourth). The Building Official and Zoning names are copied word for word
 * from the backend's issuing-office.ts (BUILDING_OFFICIAL_OFFICE,
 * ZONING_OFFICE), which copies the public website's permits.data.ts, so the
 * permit, the server and the website agree. The Bureau of Fire Protection is
 * named as the BFP's own forms bundled here name the station. The Treasurer
 * is named as the Order of Payment has always named it.
 *
 * Open question for the LGU: is the Office of the Municipal Engineer also the
 * Office of the Building Official? The backend's name says so; until the LGU
 * says otherwise, the portal uses it alone.
 */
export const OFFICES = {
  buildingOfficial: { name: 'Office of the Building Official (Municipal Engineering Office)', short: 'OBO' },
  zoning: { name: 'Municipal Planning and Development Office (Zoning Administrator)', short: 'MPDO' },
  fireStation: { name: 'Bureau of Fire Protection — Castilla Fire Station', short: 'BFP' },
  treasurer: { name: "Municipal Treasurer's Office", short: "Treasurer's Office" },
} as const satisfies Record<string, OfficeName>;

/**
 * Where a citizen pays (design review I2): the Municipal Treasurer's Office,
 * whose Cashier verifies the payment and issues the Official Receipt. The pay
 * page, the Order of Payment, the Payments list and the receipt all read this,
 * so the screen and the paper the citizen brings say the same thing.
 */
export const MUNICIPAL_TREASURER = {
  name: OFFICES.treasurer.name,
  short: OFFICES.treasurer.short,
  place: 'Castilla Town Hall',
  cashierLabel: 'Cashier',
} as const;

/**
 * Source: assets/LGU Castilla BPCO Forms/Checklist (Building Permit & Occupancy).pdf
 * Letterhead: "OFFICE OF THE MUNICIPAL ENGINEER".
 * Footer: "please call MEO at 09054818572 (cellphone) or send an email at
 *          meocastilla@gmail.com within 3 working days."
 * Named as the issuing office (OFFICES.buildingOfficial), the name the permit
 * prints, so a citizen never reads the two as different offices.
 */
export const MUNICIPAL_ENGINEER: LguOffice = {
  name: OFFICES.buildingOfficial.name,
  shortName: OFFICES.buildingOfficial.short,
  email: 'meocastilla@gmail.com',
  mobile: '09054818572',
  handles: 'Building permits, ancillary permits and certificates of occupancy',
};

/**
 * Source: assets/LGU Castilla BPCO Forms/Zoning Checklist.pdf (FM-MPD-12,
 * updated as of August 2024). Letterhead: "Municipal Planning and Development
 * Office". Footer: "Castilla Town Hall, Cumadcad, Castilla, Sorsogon" and
 * "castillampdo@gmail.com". No telephone number is published on the form.
 * Named as the zoning clearance's issuer (OFFICES.zoning).
 */
export const PLANNING_AND_DEVELOPMENT: LguOffice = {
  name: OFFICES.zoning.name,
  shortName: OFFICES.zoning.short,
  email: 'castillampdo@gmail.com',
  mobile: null,
  handles: 'Locational clearance and certificates of zoning compliance',
};

/** Source: Zoning Checklist.pdf footer — "Castilla Town Hall, Cumadcad, Castilla, Sorsogon". */
export const MUNICIPAL_HALL_ADDRESS = 'Castilla Town Hall, Cumadcad, Castilla, Sorsogon';

/** Source: Checklist (Building Permit & Occupancy).pdf footer — "within 3 working days". */
export const INQUIRY_TURNAROUND = 'Inquiries are answered within 3 working days.';

/**
 * Deliberately absent: OFFICE HOURS. No bundled LGU document publishes them.
 * The Help screen previously stated "Monday to Friday, 8:00 AM – 5:00 PM" —
 * plausible, and entirely unsourced. Add it here only once a Castilla document
 * or the LGU states it.
 */
