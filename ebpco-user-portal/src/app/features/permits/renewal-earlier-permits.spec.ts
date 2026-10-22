import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationWizardPage } from './application-wizard.page';
import { API_BASE_URL } from '../../core/api/api-config';
import { EarlierPermit, RenewalCheckResponse } from '../../core/api/citizen-api.models';
import { EarlierRecordsStore } from '../../core/stores/earlier-records.store';

/**
 * A permit issued on paper before eBPCO, once an officer matched it to the
 * citizen (ebpco-api migration 069), can be renewed through the wizard:
 * "Renew" on My Applications opens it as a Renewal with the number filled
 * in, and a Renewal of that type offers the citizen's earlier permits as
 * quick picks. Either way the server still checks the number on Continue.
 */
interface Testable {
  applyingAs: 'residential' | 'business' | null;
  businessId: string | null;
  applicationAction: string;
  permitNumberInput: string;
  paperPermit: boolean;
  step(): number;
  permitNumberError(): string | null;
  toStep(next: 1 | 2 | 3 | 4): void;
}

@Component({ template: '' })
class BlankPage {}

const BASE = 'https://api.example.gov.ph';

const permit = (id: string, permitType: string, permitNumber: string): EarlierPermit => ({
  id, referenceNumber: `PRE-2019-00000${id}`, permitType, permitNumber, dateIssued: '2019-04-12', validUntil: null,
  location: null, scopeOfWork: null, businessName: null, issuedBy: null, registerRef: null,
});
const EARLIER = [
  permit('1', 'Building Permit', 'BP-2019-0412'),
  permit('2', 'Building Permit', 'BP 2017/0088'),
  permit('3', 'Fencing Permit', 'FP-2018-0001'),
];

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error('condition never became true');
}

function open(query: Record<string, string>) {
  TestBed.configureTestingModule({
    imports: [ApplicationWizardPage],
    providers: [
      provideRouter([{ path: 'applications/:id', component: BlankPage }]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: BASE },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      { provide: EarlierRecordsStore, useValue: { permits: signal(EARLIER) } },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(ApplicationWizardPage);
  http.expectOne(`${BASE}/documents/me`).flush([]);
  const requirements = http.expectOne((r) => r.url.startsWith(`${BASE}/requirements/`));
  const requirementsUrl = requirements.request.urlWithParams;
  requirements.flush({ documents: [] });
  fixture.detectChanges();
  const page = fixture.componentInstance as unknown as Testable;
  // Signed out here, so "Applying as" has no sign-up choice to open on.
  page.applyingAs = 'business';
  page.businessId = 'biz-1';
  fixture.detectChanges();
  return { http, fixture, page, el: fixture.nativeElement as HTMLElement, requirementsUrl };
}

const picks = (el: HTMLElement) => Array.from(el.querySelectorAll('button.earlier-pick')) as HTMLButtonElement[];

describe('ApplicationWizardPage: renewing a permit issued before eBPCO', () => {
  let http: HttpTestingController | undefined;

  afterEach(() => {
    try {
      http?.verify();
    } finally {
      http = undefined;
      TestBed.resetTestingModule();
    }
  });

  it('opens from "Renew" as a Renewal of that type with the number filled in', () => {
    const opened = open({ type: 'Building Permit', action: 'Renewal', permitNumber: 'BP-2019-0412' });
    http = opened.http;
    expect(opened.page.applicationAction).toBe('Renewal');
    expect(opened.page.permitNumberInput).toBe('BP-2019-0412');
    // The checklist asked for is the Renewal's.
    expect(opened.requirementsUrl).toContain('applicationAction=Renewal');
    const field = opened.el.querySelector('#application-wizard-related-permit') as HTMLInputElement;
    expect(field).not.toBeNull();
  });

  it('offers the earlier permits of this type only, and a pick fills the number', () => {
    const opened = open({ type: 'Building Permit', action: 'Renewal' });
    http = opened.http;
    const { el, fixture, page } = opened;
    expect(el.textContent).toContain('Your permits issued before eBPCO:');
    expect(picks(el).map((b) => b.textContent?.trim())).toEqual(['BP-2019-0412', 'BP 2017/0088']);

    picks(el)[1].click();
    fixture.detectChanges();
    expect(page.permitNumberInput).toBe('BP 2017/0088');
    expect(picks(el)[1].getAttribute('aria-pressed')).toBe('true');
    expect(picks(el)[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('still has the server check a picked number on Continue', async () => {
    const opened = open({ type: 'Building Permit', action: 'Renewal' });
    http = opened.http;
    const { el, fixture, page } = opened;
    picks(el)[0].click();
    fixture.detectChanges();

    page.toStep(2);
    const check = opened.http.expectOne((r) => r.url.startsWith(`${BASE}/applications/renewal-check`));
    expect(check.request.urlWithParams).toContain('permitNumber=BP-2019-0412');
    check.flush({
      valid: false, reason: 'permit-business-mismatch',
      message: 'Permit "BP-2019-0412" was issued to you as a private individual. Apply as Residential / Private Individual.',
    } satisfies RenewalCheckResponse);
    await waitUntil(() => page.permitNumberError() !== null);
    expect(page.step()).toBe(1);
    expect(page.permitNumberError()).toContain('Apply as Residential');
  });

  it('offers the picks once Renewal is chosen, and none once the paper-permit box is ticked', async () => {
    const opened = open({ type: 'Building Permit' });
    http = opened.http;
    const { el, fixture, page } = opened;
    expect(page.applicationAction).toBe('New');
    expect(picks(el)).toEqual([]);

    await fixture.whenStable();
    const action = el.querySelector('#application-wizard-application-type-2') as HTMLSelectElement;
    action.value = 'Renewal';
    action.dispatchEvent(new Event('change'));
    // Choosing Renewal reloads the checklist for it.
    opened.http.expectOne((r) => r.url.startsWith(`${BASE}/requirements/`)).flush({ documents: [] });
    fixture.detectChanges();
    expect(page.applicationAction).toBe('Renewal');
    expect(picks(el)).toHaveLength(2);

    const paper = el.querySelector('input[type="checkbox"]') as HTMLInputElement;
    paper.click();
    fixture.detectChanges();
    expect(page.paperPermit).toBe(true);
    expect(picks(el)).toEqual([]);
  });
});
