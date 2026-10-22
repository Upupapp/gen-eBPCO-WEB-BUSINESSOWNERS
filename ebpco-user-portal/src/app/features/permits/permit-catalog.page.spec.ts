import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { PermitCatalogPage } from './permit-catalog.page';
import { FILEABLE_PERMIT_TYPES, PERMIT_TYPE_GROUPS, PermitType } from '../../core/domain/permit.model';
import { API_BASE_URL } from '../../core/api/api-config';
import { ALL_BLANK_FORMS, blankFormFor } from '../../core/domain/permit-form-assets';
import { AuthService } from '../../core/session/auth.service';
import { CitizenIdentityApi } from '../../core/api/citizen-identity.api';
import { FakeCitizenIdentityApi } from '../../core/testing/fake-citizen-identity-api';

/**
 * Blank forms (2026-10-01): offered only where a requirement asks the citizen
 * to fill one in and upload it, the Building Permit's Unified Building Permit
 * Form and its ancillary forms. Every other permit is filed online, so Permit
 * Services offers no form download; the link sits on the document row. The
 * mobile app does the same.
 */
const ALL_TYPES = PERMIT_TYPE_GROUPS.flatMap((g) => g.types) as PermitType[];

describe('Blank forms: only where a document asks for one', () => {
  const FORM_CODES = [
    'bpnc-unified-form', 'bpnc-ancillary-electrical', 'bpnc-ancillary-fencing', 'bpnc-ancillary-architectural',
    'bpnc-ancillary-sanitary-plumbing', 'bpnc-ancillary-mechanical', 'bpnc-ancillary-civil-structural',
    'bpnc-ancillary-excavation', 'bpnc-ancillary-electronics',
  ];

  it('the Unified Building Permit Form and each ancillary form have their blank form, by code', () => {
    for (const code of FORM_CODES) expect(blankFormFor(code), code).not.toBeNull();
  });

  it('finds it by label for the built-in catalog, and nothing for a document that is not a form', () => {
    expect(blankFormFor('some-other-id', 'Unified Building Permit Form')).not.toBeNull();
    expect(blankFormFor('bpnc-valid-id', 'Valid ID')).toBeNull();
    expect(blankFormFor(null, null)).toBeNull();
  });

  it('links every form under the served folder, once each, and labels the Architectural one a reference template', () => {
    for (const form of ALL_BLANK_FORMS) expect(form.fileName.startsWith('assets/permit-forms/'), form.fileName).toBe(true);
    expect(new Set(ALL_BLANK_FORMS.map((f) => f.fileName)).size).toBe(ALL_BLANK_FORMS.length);
    expect(blankFormFor('bpnc-ancillary-architectural')!.isReferenceTemplate).toBe(true);
    expect(blankFormFor('bpnc-unified-form')!.isReferenceTemplate).toBe(false);
  });

  it('downloads each form under its own name, the same as the mobile app', () => {
    for (const form of ALL_BLANK_FORMS) {
      expect(form.downloadName.endsWith('.pdf'), form.label).toBe(true);
      expect(form.downloadName.includes('/'), form.label).toBe(false);
    }
    expect(blankFormFor('bpnc-unified-form')!.downloadName).toBe('Unified Application Form for Building Permit.pdf');
  });

  it('the requirements popup of a permit offers no form download', () => {
    TestBed.configureTestingModule({
      imports: [PermitCatalogPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(PermitCatalogPage);
    fixture.detectChanges();
    (fixture.componentInstance as unknown as { openRequirements(t: PermitType): void }).openRequirements(ALL_TYPES[0]);
    fixture.detectChanges();
    const links = [...document.body.querySelectorAll('a[href]')]
      .map((a) => a.getAttribute('href') ?? '')
      .filter((href) => href.includes('assets/permit-forms/'));
    expect(links).toEqual([]);
    TestBed.resetTestingModule();
  });
});

describe('Permit Services: the FSEC and FSIC come from the BFP', () => {
  it('offers no FSEC or FSIC application, and sends the citizen to BFP-FSIS instead', () => {
    TestBed.configureTestingModule({
      imports: [PermitCatalogPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(PermitCatalogPage);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;

    const cardNames = Array.from(page.querySelectorAll('.permit-card__name')).map((h) => h.textContent?.trim());
    expect(cardNames).not.toContain('FSEC for Building Permit (BFP)');
    expect(cardNames).not.toContain('FSIC for Occupancy Permit (BFP)');
    expect(cardNames).toContain('Certificate of Occupancy');

    const link = page.querySelector<HTMLAnchorElement>('.bfp-notice a');
    expect(link?.href).toBe('https://fsis.e-bfp.com/');
    expect(link?.rel).toContain('noopener');
  });
});

/**
 * A business is no longer needed to apply (owner request, 2026-10-21): every
 * application asks "Applying as: Residential / Private Individual or
 * Business". What can hold a citizen back now is an account the Municipality
 * has not verified yet (migration 067), and Permit Services says so.
 */
describe('Permit Services: no business needed, and the account verification banner', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function render(status: 'unsubmitted' | 'pending' | 'verified' | 'rejected', note: string | null = null): Promise<string> {
    TestBed.configureTestingModule({
      imports: [PermitCatalogPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CitizenIdentityApi, useClass: FakeCitizenIdentityApi },
      ],
    });
    (TestBed.inject(CitizenIdentityApi) as unknown as FakeCitizenIdentityApi).setVerification(status, note);
    await TestBed.inject(AuthService).login('juan.delacruz@example.com', 'Password1');
    const fixture = TestBed.createComponent(PermitCatalogPage);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  it('never asks for a business before applying, and says nothing to a verified account', async () => {
    const text = await render('verified');
    expect(text).not.toMatch(/register a business/i);
    expect(text).not.toContain('Verify your account');
    expect(text).not.toContain('being verified');
  });

  it('tells an account with no ID yet to verify it, and one waiting that it can prepare applications now', async () => {
    expect(await render('unsubmitted')).toContain('Verify your account to submit applications');
    TestBed.resetTestingModule();
    expect(await render('pending')).toContain('You can prepare applications now and submit once it is verified');
  });

  it('gives the reason an ID was not accepted, and a way to upload again', async () => {
    const text = await render('rejected', 'The ID has expired');
    expect(text).toContain('Your ID was not accepted: The ID has expired.');
    expect(text).toContain('Upload again');
  });
});

/**
 * The Certificate of Occupancy sat alone in a "Certificates" group at the very
 * bottom and was easy to miss (2026-10-23): it now comes right after the
 * Building Permit, in the first group.
 */
describe('Permit Services: the groups', () => {
  it('opens with Building & Occupancy, the Certificate of Occupancy second, and has no "Certificates" group', () => {
    expect(PERMIT_TYPE_GROUPS[0]).toEqual({
      label: 'Building & Occupancy',
      types: ['Building Permit', 'Certificate of Occupancy', 'Zoning / Locational Clearance', 'Demolition Permit'],
    });
    expect(PERMIT_TYPE_GROUPS.map((g) => g.label)).toEqual(['Building & Occupancy', 'Ancillary Permits', 'Other Permits']);
  });

  it('lists every type that can be filed, once each', () => {
    expect([...ALL_TYPES].sort()).toEqual([...FILEABLE_PERMIT_TYPES].sort());
  });

  it('shows Building & Occupancy first on the page', () => {
    TestBed.configureTestingModule({
      imports: [PermitCatalogPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(PermitCatalogPage);
    fixture.detectChanges();
    const headings = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.permit-group-heading'))
      .map((h) => h.textContent?.trim());
    expect(headings[0]).toBe('Building & Occupancy');
    expect(headings).not.toContain('Certificates');
    TestBed.resetTestingModule();
  });
});

/**
 * Who may apply (migration 068): every type is open to homes and businesses
 * unless the Municipality restricted it, read from `GET /permit-types`. An
 * older server, or a failed call, hides nothing: every type reads as both.
 */
describe('Permit Services: who may apply for each type', () => {
  const BASE = 'https://api.example.gov.ph';

  afterEach(() => TestBed.resetTestingModule());

  function render(configured: boolean): ComponentFixture<PermitCatalogPage> {
    TestBed.configureTestingModule({
      imports: [PermitCatalogPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        ...(configured ? [{ provide: API_BASE_URL, useValue: BASE }] : []),
      ],
    });
    const fixture = TestBed.createComponent(PermitCatalogPage);
    fixture.detectChanges();
    return fixture;
  }

  function card(fixture: ComponentFixture<PermitCatalogPage>, type: PermitType): HTMLElement {
    const name = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.permit-card__name'))
      .find((h) => h.textContent?.trim() === type);
    return name!.closest('.permit-card') as HTMLElement;
  }

  function chip(fixture: ComponentFixture<PermitCatalogPage>, type: PermitType): string | undefined {
    return card(fixture, type).querySelector('.permit-card__kinds')?.textContent?.trim();
  }

  it('says "Homes & businesses" on every card when no API answers', () => {
    const fixture = render(false);
    for (const type of ALL_TYPES) expect(chip(fixture, type), type).toBe('Homes & businesses');
  });

  it('shows what the server says, and both for a type it leaves out or sends without kinds', () => {
    const fixture = render(true);
    TestBed.inject(HttpTestingController).expectOne(`${BASE}/permit-types`).flush({
      items: [
        { permitType: 'Sign Permit', applicantKinds: ['business'] },
        { permitType: 'Fencing Permit', applicantKinds: ['residential'] },
        { permitType: 'Building Permit', applicantKinds: ['residential', 'business'] },
        { permitType: 'Demolition Permit' },
      ],
    });
    fixture.detectChanges();
    expect(chip(fixture, 'Sign Permit')).toBe('Business only');
    expect(chip(fixture, 'Fencing Permit')).toBe('Residential only');
    expect(chip(fixture, 'Building Permit')).toBe('Homes & businesses');
    expect(chip(fixture, 'Demolition Permit')).toBe('Homes & businesses');
    expect(chip(fixture, 'Excavation Permit')).toBe('Homes & businesses');
  });

  it('hides nothing when the server cannot answer', () => {
    const fixture = render(true);
    TestBed.inject(HttpTestingController).expectOne(`${BASE}/permit-types`)
      .flush('Not Found', { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    for (const type of ALL_TYPES) expect(chip(fixture, type), type).toBe('Homes & businesses');
  });

  it('says who usually applies on the Sign, Fencing, Interior Design and Certificate of Occupancy cards only', () => {
    const fixture = render(false);
    const note = (type: PermitType) => card(fixture, type).querySelector('.permit-card__note')?.textContent?.trim();
    expect(note('Sign Permit')).toBe('Usually a business sign; a home-based practice can apply as Residential.');
    expect(note('Fencing Permit')).toBe('Usually for homes.');
    expect(note('Interior Design Permit')).toBe('Usually shop and office fit-outs.');
    expect(note('Certificate of Occupancy')).toBe('After the building work is done, before the building is used.');
    expect(note('Building Permit')).toBeUndefined();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.permit-card__note').length).toBe(4);
  });
});
