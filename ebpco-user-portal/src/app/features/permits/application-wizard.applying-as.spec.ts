import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationWizardPage } from './application-wizard.page';
import { API_BASE_URL } from '../../core/api/api-config';
import { ApplicationSummary, SubmitApplicationRequest } from '../../core/api/citizen-api.models';
import { AuthService } from '../../core/session/auth.service';
import { AccountVerification, RegisteredAs } from '../../core/domain/account-verification';

/**
 * "Applying as" (owner request, 2026-10-21): a business is no longer needed to
 * apply. Every application asks Residential / Private Individual or Business,
 * opening on what the citizen chose at sign-up; a Residential one names no
 * business and says whose property it is. And an account the Municipality has
 * not verified (migration 067) can prepare and save an application, but is
 * told why it cannot submit yet instead of being sent to a refusal.
 *
 * The session is a stand-in holding only what these screens read: who is
 * signed in, what they chose at sign-up, and their verification. Signed out
 * as far as the stores are concerned (`isAuthenticated()` false), so their
 * own fetches stay quiet, as in application-wizard.draft.spec.ts.
 */
@Component({ template: '' })
class BlankPage {}

const BASE = 'https://api.example.gov.ph';

function verification(status: AccountVerification['status']): AccountVerification {
  return { status, submittedAt: null, decidedAt: null, note: null, idType: null };
}

interface Session {
  registeredAs: RegisteredAs | null;
  verification: AccountVerification | null;
}

function summaryFor(overrides: Partial<ApplicationSummary> = {}): ApplicationSummary {
  return {
    id: 'draft-1',
    referenceNumber: 'DRAFT-1',
    serviceDomain: 'Construction Permit',
    permitType: 'Fencing Permit',
    applicationAction: 'New',
    businessId: null,
    businessName: null,
    location: '123 Rizal Street',
    renewsPermitNumber: null,
    priorPermitClaim: null,
    lifecycleStatus: 'Draft',
    applicantStatus: 'Draft',
    requiresApplicantAction: false,
    dateSubmitted: null,
    updatedAt: '2026-10-21T00:00:00.000Z',
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

describe('ApplicationWizardPage — Applying as, and an account not verified yet', () => {
  let http: HttpTestingController;

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  /** `requirements` answers the wizard's first checklist fetch; `requirementsUrl` is what it asked. */
  function configure(params: Record<string, string>, session: Session | null, requirements: object = { documents: [] }) {
    const user = session === null ? null : { id: 'user-1', firstName: 'Juan', lastName: 'Dela Cruz', ...session };
    TestBed.configureTestingModule({
      imports: [ApplicationWizardPage],
      providers: [
        provideRouter([{ path: 'applications/:id', component: BlankPage }, { path: 'applications', component: BlankPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: BASE },
        { provide: AuthService, useValue: { currentUser: signal(user), isAuthenticated: () => false, reloadProfile: async () => {} } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(params) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ApplicationWizardPage);
    http.expectOne(`${BASE}/documents/me`).flush([]);
    const checklist = http.expectOne((r) => r.url.startsWith(`${BASE}/requirements/`));
    const requirementsUrl = checklist.request.url;
    checklist.flush(requirements);
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, requirementsUrl };
  }

  /** The next checklist fetch, asked again after "Applying as" changed. */
  function nextChecklist() {
    return http.expectOne((r) => r.url.startsWith(`${BASE}/requirements/`));
  }

  it('opens on Residential for a citizen who signed up for that', () => {
    const { page } = configure({ type: 'Fencing Permit' }, { registeredAs: 'residential', verification: verification('verified') });
    expect(page.applyingAs).toBe('residential');
  });

  it('opens on Business for a citizen who signed up for that', () => {
    const { page } = configure({ type: 'Fencing Permit' }, { registeredAs: 'business', verification: verification('verified') });
    expect(page.applyingAs).toBe('business');
  });

  it('opens with nothing chosen for "Both", and asks before going on', () => {
    const { page } = configure({ type: 'Fencing Permit' }, { registeredAs: 'both', verification: verification('verified') });
    expect(page.applyingAs).toBeNull();
    page.toStep(2);
    expect(page.step()).toBe(1);
    expect(page.error()).toContain('Residential / Private Individual or as a Business');
  });

  it('opens on Business when started from a business\'s own "Apply for Permit"', () => {
    const { page } = configure({ type: 'Fencing Permit', businessId: 'biz-1' }, { registeredAs: 'residential', verification: null });
    expect(page.applyingAs).toBe('business');
    expect(page.businessId).toBe('biz-1');
  });

  it('Residential needs no business and asks nothing about whose property it is: the citizen applies for their own', async () => {
    // Owner ruling 2026-10-28: "the user only applies for themselves".
    const { page, el } = configure({ type: 'Fencing Permit' }, { registeredAs: 'residential', verification: verification('verified') });
    expect(page.businessId).toBeNull();
    expect(el.textContent).not.toContain('Do you own the property?');
    expect(el.textContent).not.toContain('I am applying for the owner');

    page.toStep(2);
    http.expectOne(`${BASE}/applications`).flush(summaryFor(), { status: 201, statusText: 'Created' });
    (await waitForRequest(http)).flush({ data: [], nextCursor: null });
    expect(page.step()).toBe(2);
  });

  it('a Residential draft is saved with no business, even one picked before switching, and names no other owner', async () => {
    const { page } = configure({ type: 'Fencing Permit' }, { registeredAs: 'both', verification: verification('verified') });
    page.applyingAs = 'business';
    page.businessId = 'biz-1';
    page.applyingAs = 'residential';

    page.toStep(2);

    const save = http.expectOne(`${BASE}/applications`);
    const body = save.request.body as SubmitApplicationRequest;
    expect(body.saveAsDraft).toBe(true);
    expect(body.businessId).toBeNull();
    expect(body.form?.['applyingAs']).toBe('residential');
    expect(body.form).not.toHaveProperty('propertyOwner');
    // The existing answers are still sent alongside.
    expect(body.form).toHaveProperty('scopeOfWork');
    save.flush(summaryFor(), { status: 201, statusText: 'Created' });
    (await waitForRequest(http)).flush({ data: [], nextCursor: null });
    expect(page.step()).toBe(2);
  });

  it('a Business application still needs its business', () => {
    const { page } = configure({ type: 'Fencing Permit' }, { registeredAs: 'business', verification: verification('verified') });
    page.toStep(2);
    expect(page.step()).toBe(1);
    expect(page.error()).toBe('Please select a business.');
  });

  it('says who usually applies for a Sign Permit, without holding a Residential one back', async () => {
    const { page, el } = configure({ type: 'Sign Permit' }, { registeredAs: 'residential', verification: verification('verified') });
    expect(el.textContent).toContain('Usually a business sign; a home-based practice can apply as Residential.');
    expect(el.textContent).not.toContain('Not open for');
    page.toStep(2);
    expect(page.step()).toBe(2);
    http.expectOne(`${BASE}/applications`).flush(summaryFor({ permitType: 'Sign Permit' }), { status: 201, statusText: 'Created' });
    (await waitForRequest(http)).flush({ data: [], nextCursor: null });
  });

  it('the review shows "Applying as", and no property owner line', () => {
    const { fixture, page, el } = configure({ type: 'Fencing Permit' }, { registeredAs: 'residential', verification: verification('verified') });
    page.step.set(4);
    fixture.detectChanges();
    expect(el.textContent).toContain('Residential / Private Individual');
    expect(el.textContent?.toLowerCase()).not.toContain('property owner');
  });

  it('an account waiting for verification is told why it cannot submit, keeps Save as Draft, and files nothing', async () => {
    const { fixture, page, el } = configure({ type: 'Fencing Permit' }, { registeredAs: 'residential', verification: verification('pending') });
    page.projectAddress = 'Purok 2, Barangay Poblacion';
    page.scopeOfWork = 'Perimeter fence';
    page.understandRequirements = true;
    page.agreeTerms = true;
    page.step.set(4);
    fixture.detectChanges();

    expect(el.textContent).toContain(
      'Your account is being verified. You can prepare applications now and submit once it is verified.',
    );
    const buttons = Array.from(el.querySelectorAll('button'));
    expect(buttons.find((b) => b.textContent?.includes('Submit application'))?.disabled).toBe(true);
    expect(buttons.some((b) => b.textContent?.includes('Save as Draft'))).toBe(true);

    await page.submit();

    // Only a draft is saved; nothing is filed.
    const save = http.expectOne(`${BASE}/applications`);
    expect((save.request.body as SubmitApplicationRequest).saveAsDraft).toBe(true);
    save.flush(summaryFor(), { status: 201, statusText: 'Created' });
    (await waitForRequest(http)).flush({ data: [], nextCursor: null });
    expect(page.error()).toContain('being verified');
  });

  it('shows the server\'s own sentence when it refuses a filing (422)', async () => {
    const { page } = configure({ type: 'Fencing Permit' }, null);
    page.applyingAs = 'residential';
    page.projectAddress = 'Purok 2, Barangay Poblacion';
    page.scopeOfWork = 'Perimeter fence';
    page.understandRequirements = true;
    page.agreeTerms = true;
    const detail = 'Verify your account before submitting: upload a valid government ID under Profile > Account '
      + 'verification. The Municipality checks it, then you can submit.';

    const submitted = page.submit();

    const filing = http.expectOne(`${BASE}/applications`);
    const body = filing.request.body as SubmitApplicationRequest;
    expect(body.saveAsDraft).toBeUndefined();
    expect(body.businessId).toBeNull();
    expect(body.form).not.toHaveProperty('propertyOwner');
    filing.flush(
      { type: '/problems/unprocessable', title: 'A precondition is unmet', status: 422, detail },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await submitted;
    expect(page.error()).toBe(detail);
  });

  // ---- Who may apply for each permit type (migration 068) ----

  const LOT_PLAN = { code: 'lot-plan', label: 'Lot Plan', description: '', required: true };
  const SIGNING_AUTHORITY = {
    code: 'business-signatory-authority',
    label: "Authority to sign for the business (Board Resolution or Secretary's Certificate; SPA for a representative)",
    description: '',
    required: false,
    applicantKind: 'business',
  };

  it('asks for the checklist as the chosen kind: Business adds the optional signing authority, Residential drops it', () => {
    const { page, requirementsUrl } = configure(
      { type: 'Fencing Permit' },
      { registeredAs: 'business', verification: verification('verified') },
      { permitType: 'Fencing Permit', applicantKinds: ['residential', 'business'], applyingAs: 'business', documents: [LOT_PLAN, SIGNING_AUTHORITY] },
    );
    expect(requirementsUrl).toContain('applyingAs=business');
    expect(page.documents.map((d) => d.id)).toEqual(['lot-plan', 'business-signatory-authority']);
    expect(page.documents[1].required).toBe(false);

    page.attached = {
      'business-signatory-authority': { kind: 'attached', documentId: 'doc-9', fileName: 'board-resolution.pdf', fileType: 'pdf' },
    };
    page.applyingAs = 'residential';
    (page as unknown as { onApplyingAsChange(): void }).onApplyingAsChange();
    const again = nextChecklist();
    expect(again.request.url).toContain('applyingAs=residential');
    again.flush({ permitType: 'Fencing Permit', applicantKinds: ['residential', 'business'], applyingAs: 'residential', documents: [LOT_PLAN] });

    expect(page.documents.map((d) => d.id)).toEqual(['lot-plan']);
    // Not filed with an application that does not ask for it.
    expect(page.attached['business-signatory-authority']).toBeUndefined();
  });

  it('a type the Municipality accepts only for businesses: Residential is disabled with the reason, and Business is chosen', async () => {
    const { fixture, page, el, requirementsUrl } = configure(
      { type: 'Sign Permit' },
      { registeredAs: 'residential', verification: verification('verified') },
      { permitType: 'Sign Permit', applicantKinds: ['business'], documents: [] },
    );
    expect(requirementsUrl).toContain('applyingAs=residential');
    expect(page.applyingAs).toBe('business');
    // Its checklist is asked for again, as Business.
    const again = nextChecklist();
    expect(again.request.url).toContain('applyingAs=business');
    again.flush({ permitType: 'Sign Permit', applicantKinds: ['business'], applyingAs: 'business', documents: [] });

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('Not open for a Sign Permit: the Municipality accepts it only for businesses.');
    const radio = (value: string) =>
      el.querySelector<HTMLInputElement>(`input[name="application-wizard-applying-as"][value="${value}"]`);
    expect(radio('residential')?.disabled).toBe(true);
    expect(radio('business')?.disabled).toBe(false);

    // Nor does it go on as Residential some other way.
    page.applyingAs = 'residential';
    page.toStep(2);
    expect(page.step()).toBe(1);
    expect(page.error()).toBe('Not open for a Sign Permit: the Municipality accepts it only for businesses.');
  });

  it('a type the Municipality accepts only from private individuals: Business is disabled, and Residential is chosen', () => {
    const { fixture, page, el } = configure(
      { type: 'Fencing Permit' },
      { registeredAs: 'business', verification: verification('verified') },
      { permitType: 'Fencing Permit', applicantKinds: ['residential'], documents: [] },
    );
    expect(page.applyingAs).toBe('residential');
    const again = nextChecklist();
    expect(again.request.url).toContain('applyingAs=residential');
    again.flush({ permitType: 'Fencing Permit', applicantKinds: ['residential'], applyingAs: 'residential', documents: [] });
    fixture.detectChanges();
    expect(el.textContent).toContain('Not open for a Fencing Permit: the Municipality accepts it only from private individuals.');
  });

  it('tells a Certificate of Occupancy applicant when it is applied for', () => {
    const { el } = configure({ type: 'Certificate of Occupancy' }, { registeredAs: 'residential', verification: verification('verified') });
    expect(el.textContent).toContain('After the building work is done, before the building is used.');
  });

  it('shows the server\'s own sentence when it refuses a type the Municipality restricted (422)', async () => {
    const { page } = configure({ type: 'Sign Permit' }, null);
    page.applyingAs = 'residential';
    page.projectAddress = 'Purok 2, Barangay Poblacion';
    page.scopeOfWork = 'Clinic sign';
    page.understandRequirements = true;
    page.agreeTerms = true;
    const detail = 'A Sign Permit is filed for a business. Apply as Business and choose the business it is for.';

    const submitted = page.submit();

    const filing = http.expectOne(`${BASE}/applications`);
    expect((filing.request.body as SubmitApplicationRequest).form?.['applyingAs']).toBe('residential');
    filing.flush(
      { type: '/problems/unprocessable', title: 'A precondition is unmet', status: 422, detail },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await submitted;
    expect(page.error()).toBe(detail);
    expect(page.submitting()).toBe(false);
  });
});
