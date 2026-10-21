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

  function configure(params: Record<string, string>, session: Session | null) {
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
    http.expectOne((r) => r.url.startsWith(`${BASE}/requirements/`)).flush({ documents: [] });
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
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

  it('Residential needs no business, but does need to know whose property it is', () => {
    const { page } = configure({ type: 'Fencing Permit' }, { registeredAs: 'residential', verification: verification('verified') });
    expect(page.businessId).toBeNull();

    page.toStep(2);
    expect(page.step()).toBe(1);
    expect(page.error()).toContain('own the property');

    page.ownsProperty = false;
    page.toStep(2);
    expect(page.step()).toBe(1);
    expect(page.error()).toContain("owner's full name");
    http.expectNone(`${BASE}/applications`);
  });

  it('a Residential draft is saved with no business, even one picked before switching, and with the property owner', async () => {
    const { page } = configure({ type: 'Fencing Permit' }, { registeredAs: 'both', verification: verification('verified') });
    page.applyingAs = 'business';
    page.businessId = 'biz-1';
    page.applyingAs = 'residential';
    page.ownsProperty = false;
    page.ownerName = 'Maria Santos';
    page.ownerRelationship = 'mother';

    page.toStep(2);

    const save = http.expectOne(`${BASE}/applications`);
    const body = save.request.body as SubmitApplicationRequest;
    expect(body.saveAsDraft).toBe(true);
    expect(body.businessId).toBeNull();
    expect(body.form?.['applyingAs']).toBe('residential');
    expect(body.form?.['propertyOwner']).toEqual({ isApplicant: false, name: 'Maria Santos', relationship: 'mother' });
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

  it('suggests Business for a Sign Permit filed as Residential, without holding it back', async () => {
    const { page, el } = configure({ type: 'Sign Permit' }, { registeredAs: 'residential', verification: verification('verified') });
    expect(el.textContent).toContain('Sign permits are usually for a business sign');
    page.ownsProperty = true;
    page.toStep(2);
    expect(page.step()).toBe(2);
    http.expectOne(`${BASE}/applications`).flush(summaryFor({ permitType: 'Sign Permit' }), { status: 201, statusText: 'Created' });
    (await waitForRequest(http)).flush({ data: [], nextCursor: null });
  });

  it('the review shows "Applying as" and the property owner', () => {
    const { fixture, page, el } = configure({ type: 'Fencing Permit' }, { registeredAs: 'residential', verification: verification('verified') });
    page.ownsProperty = false;
    page.ownerName = 'Maria Santos';
    page.ownerRelationship = 'mother';
    page.step.set(4);
    fixture.detectChanges();
    expect(el.textContent).toContain('Residential / Private Individual');
    expect(el.textContent).toContain('Maria Santos (mother)');
  });

  it('an account waiting for verification is told why it cannot submit, keeps Save as Draft, and files nothing', async () => {
    const { fixture, page, el } = configure({ type: 'Fencing Permit' }, { registeredAs: 'residential', verification: verification('pending') });
    page.ownsProperty = true;
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
    expect(buttons.find((b) => b.textContent?.includes('Submit Application'))?.disabled).toBe(true);
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
    page.ownsProperty = true;
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
    expect(body.form?.['propertyOwner']).toEqual({ isApplicant: true });
    filing.flush(
      { type: '/problems/unprocessable', title: 'A precondition is unmet', status: 422, detail },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await submitted;
    expect(page.error()).toBe(detail);
  });
});
