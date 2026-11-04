import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { PermitDocumentPage } from './permit-document.page';
import { ApplicationStore } from '../../core/stores/application.store';
import { AuthService } from '../../core/session/auth.service';

/**
 * Guards F-2: a permit record that no office issued must never produce a clean,
 * printable document. The printed page carries the Republic of the Philippines
 * letterhead, the municipal seal and a verification QR, so an unwatermarked one
 * is a forgeable artifact.
 *
 * The watermark may only clear on `provenance === 'issued'`, which nothing sets
 * until a backend does. Do not relax these to make a demo document print clean.
 */
function renderFor(applicationId: string) {
  TestBed.configureTestingModule({
    imports: [PermitDocumentPage],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: applicationId }) } } },
    ],
  });
  const fixture = TestBed.createComponent(PermitDocumentPage);
  fixture.detectChanges();
  return fixture;
}

describe('PermitDocumentPage (F-2: demo permits cannot print clean)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('watermarks a seeded demo permit that carries a full permit record', () => {
    // app-seed-2 has a permitNumber, issue date, expiry and approving office —
    // everything a finished permit has. Before the fix it printed unwatermarked.
    const fixture = renderFor('app-seed-2');
    const permit = TestBed.inject(ApplicationStore).permitFor('app-seed-2');
    expect(permit).toBeTruthy();
    expect(permit!.provenance).toBe('demo');

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('SAMPLE — NOT AN OFFICIAL PERMIT');
  });

  it('withholds the verification QR from a document it has not cleared', () => {
    const fixture = renderFor('app-seed-2');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('QR verification not yet available');
    // The QR is the only svg in the QR box; the back link's arrow icon is another svg on the page.
    expect((fixture.nativeElement as HTMLElement).querySelector('.doc-generated-qr svg')).toBeNull();
  });

  it('does not claim an uncleared document was issued by the Municipality', () => {
    const text = (renderFor('app-seed-2').nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('is a system-generated document issued by the Municipality');
    expect(text).toContain('not an issued permit and has no legal effect');
  });

  it('keeps the LGU form\'s "Owner / Applicant" role label', () => {
    // Not a CITIZEN-vocabulary miss. This mirrors BOX 1 of the Unified
    // Application Form, where Applicant, Owner and Licensed Architect /
    // Civil Engineer are three distinct signing roles. "Citizen" is who uses
    // the portal; "Applicant" is the role they signed a statutory form in.
    const text = (renderFor('app-seed-2').nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Owner / Applicant');
  });

  it('still watermarks after the demo advance walks an application to Permit Generated', () => {
    // The exact attack path: the "Demo: Simulate Office Update" button.
    const fixture = renderFor('app-seed-1');
    const store = TestBed.inject(ApplicationStore);
    for (let i = 0; i < 20; i++) store.advanceForDemo('app-seed-1');

    const minted = store.permitFor('app-seed-1');
    expect(minted).toBeTruthy();
    expect(minted!.provenance).toBe('demo');

    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('SAMPLE — NOT AN OFFICIAL PERMIT');
  });
});

/**
 * The Property block is the application's own project / property address
 * (`location`, typed in the wizard's Details step), not the business's: a
 * Residential application names no business, so it printed "Not on file" for
 * Barangay, City, Street and Province (4 Nov 2026).
 */
describe('PermitDocumentPage (Property is where the project is)', () => {
  afterEach(() => TestBed.resetTestingModule());

  /** The Property section's rows, as [label, value]. */
  const propertyRows = (el: HTMLElement) =>
    Array.from(
      Array.from(el.querySelectorAll('.doc-generated-section'))
        .find((s) => s.querySelector('h2')?.textContent?.trim() === 'Property')
        ?.querySelectorAll('.doc-generated-fields > div') ?? [],
    ).map((row) => [row.querySelector('dt')?.textContent?.trim(), row.querySelector('dd')?.textContent?.trim()]);

  it("shows the address the applicant gave, even for a Residential application with no business", () => {
    const fixture = renderFor('app-seed-2');
    const store = TestBed.inject(ApplicationStore) as unknown as {
      applications: { update(f: (list: Record<string, unknown>[]) => Record<string, unknown>[]): void };
    };
    store.applications.update((list) => list.map((a) => (a['id'] === 'app-seed-2'
      ? { ...a, businessId: null, businessName: null, applyingAs: 'residential', location: '12 Rizal St., Poblacion, Castilla' }
      : a)));
    fixture.detectChanges();

    // The address as filed, printed once: no Barangay row repeating it (design review I3).
    expect(propertyRows(fixture.nativeElement as HTMLElement)).toEqual([
      ['Location', '12 Rizal St., Poblacion, Castilla'],
    ]);
  });

  it("falls back to the business's whole address, on one line, when the application has no location", () => {
    // app-seed-2 is Juan's Eatery (biz-2, 45 National Highway, San Isidro) and carries no location.
    expect(propertyRows(renderFor('app-seed-2').nativeElement as HTMLElement)).toEqual([
      ['Location', '45 National Highway, San Isidro, Castilla, Sorsogon'],
    ]);
  });
});

describe('PermitDocumentPage (task 22: conditions come from the office, in full)', () => {
  afterEach(() => TestBed.resetTestingModule());

  // Guards the defect this replaced: a single CLIENT-authored sentence from
  // requirements-catalog.ts rendered under a heading reading "Conditions".
  // One of those sentences says "per standard LGU clearance practice" — an
  // inference we wrote, presented to a citizen as their obligations.
  it('never renders the catalogue validity sentence as a condition', () => {
    const text = (renderFor('app-seed-2').nativeElement as HTMLElement).textContent ?? '';
    const conditionsIdx = text.indexOf('Conditions');
    const validityIdx = text.indexOf('Validity');
    expect(conditionsIdx).toBeGreaterThan(-1);
    // Validity is its own section, separately labelled — not the conditions.
    if (validityIdx > -1) expect(validityIdx).toBeGreaterThan(conditionsIdx);
  });

  it('says plainly that the office recorded none, rather than substituting our own', () => {
    // Seeded permits carry conditions: [] — the office has said nothing. Stated
    // as a fact in normal ink, as the Admin copy does: the grey-italic warning
    // alarmed anyone shown the permit (design review I3).
    const el = renderFor('app-seed-2').nativeElement as HTMLElement;
    expect(el.querySelector('.doc-generated-empty')?.textContent?.trim()).toBe('No conditions were recorded by the office.');
    expect(el.textContent).not.toContain('This does not mean there are none');
  });

  it('renders every condition the office supplied, not a summary', () => {
    const fixture = renderFor('app-seed-2');
    const store = TestBed.inject(ApplicationStore);
    const permit = store.permitFor('app-seed-2')!;
    const withConditions = {
      ...permit,
      conditions: [
        'A cash bond of P50,000.00 shall be posted before excavation.',
        'Setbacks shall conform to the approved plans.',
        'Written notice shall be given to the Office five (5) days before excavation.',
      ],
    };
    (store as unknown as { permitsByApp: { update(f: (m: Record<string, unknown>) => Record<string, unknown>): void } })
      .permitsByApp.update((m) => ({ ...m, 'app-seed-2': withConditions }));
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    for (const c of withConditions.conditions) expect(text).toContain(c);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.doc-generated-conditions li').length).toBe(3);
  });
});

/**
 * The permit's one field map (design review I3): the office's copy and the
 * citizen's disagreed on about six fields. This list is COPIED, not imported,
 * from core/domain/permit-fields.ts on purpose, and the Admin Portal's
 * user-portal-permit-preview spec pins the same list: a label changed in one
 * place fails here until both portals agree.
 */
describe('PermitDocumentPage (one field map)', () => {
  afterEach(() => TestBed.resetTestingModule());

  const BUSINESS_PERMIT_LABELS = [
    'Permit No.', 'Application No.', 'Date issued', 'Valid until',
    'Owner / Permittee name', 'Business name', 'Contact number', 'Address',
    'Location',
    'Application type', 'Date applied',
    'Fee', 'Amount', 'Total amount due', 'Balance', 'Order of Payment No.',
  ];

  /** Every label the permit shows, in reading order (an occupancy or scope row adds its own when filed). */
  function labels(el: HTMLElement): string[] {
    const out: string[] = [];
    out.push(el.querySelector('.num-label')?.textContent?.trim() ?? '');
    for (const span of Array.from(el.querySelectorAll('.num-dates > span'))) out.push((span.textContent ?? '').split(':')[0].trim());
    for (const dt of Array.from(el.querySelectorAll('.doc-generated-fields dt'))) out.push(dt.textContent?.trim() ?? '');
    for (const th of Array.from(el.querySelectorAll('.doc-generated-table th'))) out.push(th.textContent?.trim() ?? '');
    for (const row of Array.from(el.querySelectorAll('.doc-generated-table tbody tr')).slice(-2)) {
      out.push(row.querySelector('td')?.textContent?.trim() ?? '');
    }
    const op = el.querySelector('.doc-generated-table + .doc-generated-note')?.textContent ?? '';
    out.push(op.split(':')[0].trim());
    return out;
  }

  it("prints the shared labels, in order, on a business application's permit", () => {
    // app-seed-2: Juan's Eatery, a business application with an assessment.
    const el = renderFor('app-seed-2').nativeElement as HTMLElement;
    expect(labels(el)).toEqual(BUSINESS_PERMIT_LABELS);
  });

  it("leaves Business name off a private individual's permit, and never prints an internal id", () => {
    const fixture = renderFor('app-seed-2');
    const store = TestBed.inject(ApplicationStore) as unknown as {
      applications: { update(f: (list: Record<string, unknown>[]) => Record<string, unknown>[]): void };
    };
    store.applications.update((list) => list.map((a) => (a['id'] === 'app-seed-2'
      ? { ...a, businessId: null, businessName: null, applyingAs: 'residential', location: 'Bonga, Castilla' }
      : a)));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(labels(el)).toEqual(BUSINESS_PERMIT_LABELS.filter((label) => label !== 'Business name'));
    expect(el.textContent).not.toContain('Residential');
    const footer = el.querySelector('.doc-generated-footer')?.textContent ?? '';
    expect(footer).toContain('Document Ref. ' + TestBed.inject(ApplicationStore).applicationById('app-seed-2')!.applicationNumber);
    expect(footer).not.toContain('app-seed-2');
  });

  it('names the issuer one way, as the backend does', () => {
    // app-seed-2 is a Zoning / Locational Clearance: the MPDO issues it.
    const el = renderFor('app-seed-2').nativeElement as HTMLElement;
    expect(el.querySelector('.office-line')?.textContent?.trim()).toBe('Municipal Planning and Development Office (Zoning Administrator)');
    expect(el.textContent).not.toContain('Office of the Municipal Engineer');
    expect(el.textContent).not.toContain('MPDO / Zoning');
  });
});

/**
 * An issued permit is a legal record: the Owner / Applicant block printed the
 * citizen's LIVE profile, so editing the profile rewrote every permit. The
 * server keeps the block on the permit since its migration 073; an older
 * server sends none, and the page prints the profile as before.
 */
describe('PermitDocumentPage (the owner as the permit was issued)', () => {
  afterEach(() => TestBed.resetTestingModule());

  const ownerRows = (el: HTMLElement) =>
    Array.from(
      Array.from(el.querySelectorAll('.doc-generated-section'))
        .find((s) => s.querySelector('h2')?.textContent?.trim() === 'Owner / Applicant')
        ?.querySelectorAll('.doc-generated-fields > div') ?? [],
    ).map((row) => [row.querySelector('dt')?.textContent?.trim(), row.querySelector('dd')?.textContent?.trim()]);

  /** app-seed-2 with a real permit response and a signed-in citizen whose profile has changed since. */
  function renderIssued(owner: Record<string, string | null>) {
    const fixture = renderFor('app-seed-2');
    (TestBed.inject(AuthService) as unknown as { _profile: { set(u: unknown): void } })._profile.set({
      firstName: 'Ana', middleName: null, lastName: 'Cruz', mobileNumber: '09998887777',
      street: '3 Mabini St.', barangay: 'Burabod', city: 'Castilla', province: 'Sorsogon',
    });
    (TestBed.inject(ApplicationStore) as unknown as { realPermitResponses: { set(m: Record<string, unknown>): void } })
      .realPermitResponses.set({
        'app-seed-2': {
          permitNumber: 'ZLC-2026-000001', issuedDate: '2026-11-04T02:00:00.000Z', scope: null, conditions: [],
          release: null, ...owner,
        },
      });
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('prints the name, contact and address kept on the permit, not the profile as edited since', () => {
    const el = renderIssued({
      ownerName: 'Maria Reyes Santos', ownerAddress: '12 Rizal St., Bonga, Castilla, Sorsogon', ownerContact: '09171234567',
    });
    expect(ownerRows(el).filter(([label]) => label !== 'Business name')).toEqual([
      ['Owner / Permittee name', 'Maria Reyes Santos'],
      ['Contact number', '09171234567'],
      ['Address', '12 Rizal St., Bonga, Castilla, Sorsogon'],
    ]);
    expect(el.textContent).not.toContain('Ana Cruz');
  });

  it('says "Not on file" for what the permit recorded as missing, rather than reading the profile', () => {
    const el = renderIssued({ ownerName: 'Maria Reyes Santos', ownerAddress: null, ownerContact: null });
    expect(ownerRows(el).filter(([label]) => label !== 'Business name')).toEqual([
      ['Owner / Permittee name', 'Maria Reyes Santos'],
      ['Contact number', 'Not on file'],
      ['Address', 'Not on file'],
    ]);
  });

  it('prints the profile, as before, from a server that keeps no owner on the permit', () => {
    const el = renderIssued({});
    expect(ownerRows(el).filter(([label]) => label !== 'Business name')).toEqual([
      ['Owner / Permittee name', 'Ana Cruz'],
      ['Contact number', '09998887777'],
      ['Address', '3 Mabini St., Burabod, Castilla, Sorsogon'],
    ]);
  });
});
