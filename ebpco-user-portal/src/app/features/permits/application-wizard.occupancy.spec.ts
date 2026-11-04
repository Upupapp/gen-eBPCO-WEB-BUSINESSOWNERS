import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationWizardPage } from './application-wizard.page';
import { API_BASE_URL } from '../../core/api/api-config';
import { ApplicationSummary, SubmitApplicationRequest } from '../../core/api/citizen-api.models';
import { DELIVERY_FEE_NOTE, PermitDeliveryState } from '../../core/domain/permit-delivery';
import { OCCUPANCY_GROUPS, occupancyForm, occupancyLabelOf, occupancyProblem } from '../../core/domain/occupancy';

/**
 * The LGU's initial findings (4 Nov 2026), on the wizard:
 *
 *  - "Use or character of occupancy" (the National Building Code's Groups A to
 *    J), asked right after "Applying as" of a Building Permit or a Certificate
 *    of Occupancy only, required to go on, kept in the draft's form and read
 *    back when it reopens (ebpco-api 071).
 *  - The Documents step says "If applicable" rather than "Optional", and says
 *    for each document whether paper copies are needed.
 *
 * Signed out as far as the stores are concerned, as in
 * application-wizard.draft.spec.ts, so their own fetches stay quiet.
 */
interface Testable {
  applyingAs: 'residential' | 'business' | null;
  occupancyGroup: string | null;
  occupancyOther: string;
  projectAddress: string;
  scopeOfWork: string;
  understandRequirements: boolean;
  agreeTerms: boolean;
  documents: { id: string; required: boolean; hardCopies?: number; hardCopyNote?: string | null }[];
  attached: Record<string, unknown>;
  step: (() => number) & { set(value: number): void };
  error(): string | null;
  toStep(next: 1 | 2 | 3 | 4): void;
  submit(): Promise<void>;
}

@Component({ template: '' })
class BlankPage {}

const BASE = 'https://api.example.gov.ph';

const PICKUP: PermitDeliveryState = {
  receiveBy: 'pickup', delivery: null, canChange: true, canConfirmReceipt: false, feeNote: DELIVERY_FEE_NOTE,
};

const BFP_NOTE = 'The BFP requires a hard copy. Submit it at the Castilla Fire Station.';

function summaryFor(overrides: Partial<ApplicationSummary> = {}): ApplicationSummary {
  return {
    id: 'draft-1',
    referenceNumber: 'BP-2026-000123',
    serviceDomain: 'Construction Permit',
    permitType: 'Building Permit',
    applicationAction: 'New',
    businessId: null,
    businessName: null,
    location: 'Purok 2, Barangay Poblacion',
    renewsPermitNumber: null,
    priorPermitClaim: null,
    lifecycleStatus: 'Draft',
    applicantStatus: 'Draft',
    requiresApplicantAction: false,
    dateSubmitted: null,
    updatedAt: '2026-11-04T00:00:00.000Z',
    openInstructionCount: 0,
    form: {},
    payment: { status: 'Not Yet Available' },
    ...overrides,
  };
}

async function waitForRequest(http: HttpTestingController) {
  for (let i = 0; i < 50; i++) {
    const found = http.match(() => true);
    if (found.length) return found[0];
    await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error('no request was issued');
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error('condition never became true');
}

describe('ApplicationWizardPage — use or character of occupancy, if-applicable documents and hard copies', () => {
  let http: HttpTestingController;

  afterEach(() => {
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  function configure(type: string, requirements: object = { documents: [] }) {
    TestBed.configureTestingModule({
      imports: [ApplicationWizardPage],
      providers: [
        provideRouter([{ path: 'applications/:id', component: BlankPage }, { path: 'applications', component: BlankPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: BASE },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ type }) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ApplicationWizardPage);
    http.expectOne(`${BASE}/documents/me`).flush([]);
    http.expectOne((r) => r.url.startsWith(`${BASE}/requirements/`)).flush(requirements);
    fixture.detectChanges();
    const page = fixture.componentInstance as unknown as Testable;
    return { fixture, page, el: fixture.nativeElement as HTMLElement };
  }

  /** The draft the first step advance files, and the refresh that follows it. */
  async function savedDraft(): Promise<SubmitApplicationRequest> {
    const save = http.expectOne(`${BASE}/applications`);
    const body = save.request.body as SubmitApplicationRequest;
    save.flush(summaryFor(), { status: 201, statusText: 'Created' });
    (await waitForRequest(http)).flush({ data: [], nextCursor: null });
    return body;
  }

  const occupancySelect = (el: HTMLElement) => el.querySelector<HTMLSelectElement>('#application-wizard-occupancy');

  it('asks it of a Building Permit right after "Applying as", with the eleven groups and the hint', () => {
    const { el } = configure('Building Permit');
    const select = occupancySelect(el);
    expect(select).not.toBeNull();
    expect(el.querySelector('label[for="application-wizard-occupancy"]')?.textContent).toContain('Use or character of occupancy');
    expect(el.textContent).toContain("The building's use, as grouped in the National Building Code.");

    const labels = Array.from(select!.options).filter((o) => !o.disabled).map((o) => o.textContent?.trim());
    expect(labels).toEqual(OCCUPANCY_GROUPS.map((g) => g.label));
    expect(labels).toHaveLength(11);
    expect(labels[0]).toBe('Group A — Residential, Dwellings');
    expect(labels[3]).toBe('Group D — Institutional');
    expect(labels[7]).toBe('Group H — Recreational or Assembly (below 1,000)');
    expect(labels[10]).toBe('Others (specify)');

    // After the "Applying as" choice, before the application type.
    const applyingAs = el.querySelector('fieldset.choice-cards')!;
    const applicationType = el.querySelector('#application-wizard-application-type-2')!;
    expect(applyingAs.compareDocumentPosition(select!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(select!.compareDocumentPosition(applicationType) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('names the permit type in the title', () => {
    const { el } = configure('Building Permit');
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('New Building Permit application');
  });

  it('asks it of a Certificate of Occupancy too', () => {
    const { el } = configure('Certificate of Occupancy');
    expect(occupancySelect(el)).not.toBeNull();
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('New Certificate of Occupancy application');
  });

  it('asks it of no other permit type, and sends none', async () => {
    const { el, page } = configure('Fencing Permit');
    expect(occupancySelect(el)).toBeNull();
    expect(el.textContent).not.toContain('Use or character of occupancy');
    page.applyingAs = 'residential';

    page.toStep(2);

    const body = await savedDraft();
    expect(body.form).not.toHaveProperty('occupancyGroup');
    expect(body.form).not.toHaveProperty('occupancyOther');
    expect(page.step()).toBe(2);
  });

  it('is required to continue, and "Others" needs the use specified', async () => {
    const { fixture, el, page } = configure('Building Permit');
    page.applyingAs = 'residential';

    page.toStep(2);
    expect(page.step()).toBe(1);
    expect(page.error()).toBe('Choose the use or character of occupancy.');

    expect(el.querySelector('#application-wizard-occupancy-other')).toBeNull();
    page.occupancyGroup = 'other';
    fixture.detectChanges();
    expect(el.querySelector('label[for="application-wizard-occupancy-other"]')?.textContent).toContain('Specify the use');

    page.occupancyOther = 'ab';
    page.toStep(2);
    expect(page.step()).toBe(1);
    expect(page.error()).toBe('Specify the use of the building, in 3 to 120 characters.');

    page.occupancyOther = '  Chapel  ';
    page.toStep(2);
    const body = await savedDraft();
    expect(body.form?.['occupancyGroup']).toBe('other');
    expect(body.form?.['occupancyOther']).toBe('Chapel');
    expect(page.step()).toBe(2);
  });

  it('saves the chosen group in the draft form, and no use typed earlier for "Others"', async () => {
    const { page } = configure('Certificate of Occupancy');
    page.applyingAs = 'residential';
    page.occupancyOther = 'Chapel';
    page.occupancyGroup = 'D';

    page.toStep(2);

    const body = await savedDraft();
    expect(body.form?.['occupancyGroup']).toBe('D');
    expect(body.form?.['occupancyOther']).toBeNull();
    // The other answers still travel with it.
    expect(body.form?.['applyingAs']).toBe('residential');
  });

  it('shows the choice on the review', () => {
    const { fixture, el, page } = configure('Building Permit');
    page.applyingAs = 'residential';
    page.occupancyGroup = 'E';
    page.step.set(4);
    fixture.detectChanges();
    expect(el.textContent).toContain('Use or character of occupancy');
    expect(el.textContent).toContain('Group E — Business and Mercantile');
  });

  it("shows the server's own sentence when it refuses the filing (422)", async () => {
    const { page } = configure('Building Permit');
    page.applyingAs = 'residential';
    page.occupancyGroup = 'A';
    page.projectAddress = 'Purok 2, Barangay Poblacion';
    page.scopeOfWork = 'Two-storey house';
    page.understandRequirements = true;
    page.agreeTerms = true;
    const detail = 'Choose the use or character of occupancy.';

    const submitted = page.submit();

    const filing = http.expectOne(`${BASE}/applications`);
    expect((filing.request.body as SubmitApplicationRequest).form?.['occupancyGroup']).toBe('A');
    filing.flush(
      {
        type: '/problems/unprocessable', title: 'A precondition is unmet', status: 422, detail,
        errors: [{ pointer: '/form/occupancyGroup', message: detail }],
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await submitted;
    expect(page.error()).toBe(detail);
  });

  function resume(form: Record<string, unknown>) {
    TestBed.configureTestingModule({
      imports: [ApplicationWizardPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: BASE },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ draft: 'draft-1' }) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ApplicationWizardPage);
    const appReq = http.expectOne(`${BASE}/applications/draft-1`);
    const docsReq = http.expectOne(`${BASE}/applications/draft-1/documents`);
    http.expectOne(`${BASE}/documents/me`).flush([]);
    appReq.flush(summaryFor({ form: { applyingAs: 'residential', scopeOfWork: 'Chapel and parish hall', ...form } }));
    docsReq.flush([]);
    return { fixture, page: fixture.componentInstance as unknown as Testable };
  }

  /**
   * The live checklist, with nothing required: an empty answer would leave
   * the static Building Permit list standing, whose documents are missing.
   */
  const NOTHING_REQUIRED = {
    documents: [{ code: 'bpnc-road-clearance', label: 'Road Clearance', description: '', required: false, hardCopies: 0, hardCopyNote: null }],
  };

  it('reopens a draft with its saved choice', async () => {
    const { page } = resume({ occupancyGroup: 'other', occupancyOther: 'Chapel' });
    (await waitForRequest(http)).flush(NOTHING_REQUIRED);
    // Nothing missing, so it reopens at Review, and reads back the delivery choice.
    await waitUntil(() => page.step() === 4);
    http.expectOne(`${BASE}/applications/draft-1/delivery`).flush(PICKUP);
    expect(page.occupancyGroup).toBe('other');
    expect(page.occupancyOther).toBe('Chapel');
  });

  it('reopens a draft saved before it was asked on step 1, with nothing chosen', async () => {
    const { page } = resume({});
    (await waitForRequest(http)).flush(NOTHING_REQUIRED);
    // The delivery read comes once resuming has decided its step.
    (await waitForRequest(http)).flush(PICKUP);
    expect(page.occupancyGroup).toBeNull();
    expect(page.step()).toBe(1);
  });

  it('Documents: "If applicable" instead of "Optional", and each document says whether paper copies are needed', () => {
    const { fixture, el, page } = configure('Building Permit', {
      permitType: 'Building Permit',
      documents: [
        {
          code: 'bpnc-fire-safety-clearance', label: 'Fire Safety Evaluation Clearance', description: '', required: true,
          hardCopies: 1, hardCopyNote: BFP_NOTE,
        },
        {
          code: 'bpnc-road-clearance', label: 'Road Clearance', required: false,
          description: 'Issued by DPWH or the Provincial Engineering Office. Only if the project is along, or opens onto, a national or provincial road.',
          // An older server sends no hardCopies: read as online only.
        },
      ],
    });
    expect(page.documents.map((d) => [d.id, d.hardCopies, d.hardCopyNote])).toEqual([
      ['bpnc-fire-safety-clearance', 1, BFP_NOTE],
      ['bpnc-road-clearance', 0, null],
    ]);

    page.step.set(3);
    fixture.detectChanges();

    const titles = Array.from(el.querySelectorAll('.req-group-title')).map((t) => t.textContent?.trim());
    expect(titles).toEqual(['Required', 'If applicable']);
    expect(el.textContent).not.toContain('Optional');
    expect(el.textContent).toContain('Attach only if your project includes this work.');

    const rows = Array.from(el.querySelectorAll('li.req'));
    const fire = rows.find((r) => r.textContent?.includes('Fire Safety Evaluation Clearance'))!;
    const road = rows.find((r) => r.textContent?.includes('Road Clearance'))!;
    expect(Array.from(fire.querySelectorAll('.req-copies')).map((c) => c.textContent?.trim())).toEqual(['Hard copies: 1', BFP_NOTE]);
    expect(Array.from(road.querySelectorAll('.req-copies')).map((c) => c.textContent?.trim())).toEqual(['Online only, no hard copy']);
    // The portal's own chip and muted sub-line, not styles of this page's own.
    expect(Array.from(el.querySelectorAll('.req-group-title')).map((t) => [t.classList.contains('tag'), t.classList.contains('tag-strong')]))
      .toEqual([[true, true], [true, false]]);
    expect(Array.from(fire.querySelectorAll('.req-copies')).every((c) => c.classList.contains('doc-sub'))).toBe(true);
  });

  it('Review: counts required documents only ("n of m required attached"), if-applicable ones aside', () => {
    const { fixture, el, page } = configure('Building Permit', {
      permitType: 'Building Permit',
      documents: [
        { code: 'bpnc-fire-safety-clearance', label: 'Fire Safety Evaluation Clearance', description: '', required: true, hardCopies: 1, hardCopyNote: BFP_NOTE },
        { code: 'bpnc-lot-plan', label: 'Lot Plan', description: '', required: true },
        { code: 'bpnc-road-clearance', label: 'Road Clearance', description: '', required: false },
      ],
    });
    page.applyingAs = 'residential';
    // One required and the if-applicable one attached: it read "2 of 3 attached".
    page.attached = { 'bpnc-lot-plan': { kind: 'reused' }, 'bpnc-road-clearance': { kind: 'reused' } };
    page.step.set(4);
    fixture.detectChanges();

    expect(el.querySelector('.review-docs-count')?.textContent?.trim()).toBe('1 of 2 required attached');
    expect(el.querySelector('.review-docs-extra')?.textContent?.trim()).toBe('and 1 if applicable');
  });
});

describe('occupancy (domain)', () => {
  it('keeps the form as the server checks it', () => {
    expect(occupancyForm(null, '')).toEqual({});
    expect(occupancyForm('A', 'ignored')).toEqual({ occupancyGroup: 'A', occupancyOther: null });
    expect(occupancyForm('other', ' Chapel ')).toEqual({ occupancyGroup: 'other', occupancyOther: 'Chapel' });
    // Half-chosen: nothing the server would refuse on a draft save.
    expect(occupancyForm('other', 'ab')).toEqual({});
    expect(occupancyProblem('other', 'x'.repeat(121))).toBe('Specify the use of the building, in 3 to 120 characters.');
    expect(occupancyProblem('J', '')).toBeNull();
  });

  it('reads the label a filed application shows and prints, or none', () => {
    expect(occupancyLabelOf({ occupancyGroup: 'A' })).toBe('Group A — Residential, Dwellings');
    expect(occupancyLabelOf({ occupancyGroup: 'other', occupancyOther: 'Chapel' })).toBe('Others — Chapel');
    expect(occupancyLabelOf({ occupancyGroup: 'Z' })).toBeNull();
    expect(occupancyLabelOf({})).toBeNull();
    expect(occupancyLabelOf(undefined)).toBeNull();
  });
});
