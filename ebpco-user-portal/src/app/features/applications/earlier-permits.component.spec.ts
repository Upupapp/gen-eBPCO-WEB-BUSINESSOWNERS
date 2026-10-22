import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { EarlierPermitsComponent } from './earlier-permits.component';
import { CitizenApiClient } from '../../core/api/citizen-api.client';
import { BusinessSummary, EarlierPermit, RecordClaim, RecordClaimRequest, RecordClaimResult } from '../../core/api/citizen-api.models';
import { ApiError } from '../../core/api/problem';
import { AuthService } from '../../core/session/auth.service';
import { EarlierRecordsStore } from '../../core/stores/earlier-records.store';
import { businessForEarlierPermit, earlierPermitStanding, manilaToday } from '../../core/domain/earlier-records';

/**
 * Records before eBPCO on My Applications (ebpco-api migration 069). The
 * Municipality imports the permits it issued on paper before eBPCO; once an
 * officer matches them to a citizen, the citizen sees them here, clearly
 * labelled "Issued before eBPCO", and can ask for one that is not listed.
 */
const EXPIRED: EarlierPermit = {
  id: 'p1', referenceNumber: 'PRE-2019-000001', permitType: 'Building Permit', permitNumber: 'BP-2019-0412',
  dateIssued: '2019-04-12', validUntil: '2020-04-11', location: 'Purok 3, Poblacion', scopeOfWork: null,
  businessName: null, issuedBy: null, registerRef: 'Logbook 2019, p. 14',
};
const CURRENT: EarlierPermit = {
  id: 'p2', referenceNumber: 'PRE-2024-000002', permitType: 'Sign Permit', permitNumber: 'SP 2024/0033',
  dateIssued: '2024-02-01', validUntil: '2099-12-31', location: null, scopeOfWork: null,
  businessName: 'Dela Cruz Hardware', issuedBy: null, registerRef: null,
};
const RETIRED: EarlierPermit = {
  ...EXPIRED, id: 'p3', permitType: 'FSIC for Occupancy Permit (BFP)', permitNumber: 'FSIC-2018-01', validUntil: null,
};
const IMPORTED_BUSINESS: BusinessSummary = {
  id: 'biz-old', name: 'Dela Cruz Hardware', category: 'Retail', street: 'Rizal St.', barangay: 'Poblacion',
  city: 'Castilla', province: 'Sorsogon', registrationNumber: 'BN-2015-11', dateRegistered: '2015-01-05',
  status: 'Active', importedBeforeEbpco: true,
};

function claim(overrides: Partial<RecordClaim>): RecordClaim {
  return {
    id: 'c1', permitNumber: 'BP-2018-0007', dateIssued: '2018-03-02', orNumber: null, status: 'pending',
    note: null, createdAt: '2026-10-20T02:00:00.000Z', decidedAt: null, ...overrides,
  };
}

interface Setup {
  permits?: EarlierPermit[];
  claims?: RecordClaim[];
  businesses?: BusinessSummary[];
  claimAnswer?: (body: RecordClaimRequest) => Observable<RecordClaimResult>;
}

async function render(setup: Setup = {}) {
  const sent: RecordClaimRequest[] = [];
  const signedIn = signal(true);
  TestBed.configureTestingModule({
    imports: [EarlierPermitsComponent],
    providers: [
      provideRouter([]),
      {
        provide: AuthService,
        useValue: {
          isAuthenticated: () => signedIn(),
          currentUser: () => (signedIn() ? { id: 'acc-1' } : null),
        },
      },
      {
        provide: CitizenApiClient,
        useValue: {
          configured: true,
          listEarlierPermits: () => of({ data: setup.permits ?? [] }),
          listRecordClaims: () => of({ data: setup.claims ?? [] }),
          listBusinesses: () => of({ data: setup.businesses ?? [] }),
          claimEarlierPermit: (body: RecordClaimRequest) => {
            sent.push(body);
            return setup.claimAnswer?.(body) ?? of({ claim: claim({ id: 'new', ...body, status: 'pending' }) });
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(EarlierPermitsComponent);
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement, sent, signedIn };
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    TestBed.tick();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
  }
}

function type(el: HTMLElement, selector: string, value: string): void {
  const input = el.querySelector(selector) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

describe('EarlierPermitsComponent: Issued before eBPCO', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows each permit with the badge, the paper number, its dates and the register reference', async () => {
    const { el } = await render({ permits: [EXPIRED, CURRENT] });
    const cards = Array.from(el.querySelectorAll('.earlier-card'));
    expect(cards).toHaveLength(2);
    expect(el.querySelector('h2')?.textContent).toContain('Issued before eBPCO');
    expect(el.textContent).toContain("Keep your paper permit; this is the Municipality's register record.");

    const first = cards[0] as HTMLElement;
    expect(first.querySelector('.earlier-badge')?.textContent).toContain('Issued before eBPCO');
    expect(first.querySelector('.earlier-card__number')?.textContent).toContain('BP-2019-0412');
    expect(first.textContent).toContain('Building Permit');
    expect(first.textContent).toContain('Date issued');
    expect(first.textContent).toContain('Valid until');
    expect(first.textContent).toContain('Purok 3, Poblacion');
    expect(first.querySelector('.earlier-card__ref')?.textContent).toContain('Register ref. Logbook 2019, p. 14');
    expect(first.querySelector('.earlier-validity')?.textContent).toContain('Expired');

    const second = cards[1] as HTMLElement;
    expect(second.querySelector('.earlier-validity')?.textContent).toContain('Valid');
    expect(second.textContent).toContain('Dela Cruz Hardware');
  });

  it('offers nothing to track, download or scan', async () => {
    const { el } = await render({ permits: [EXPIRED] });
    const card = el.querySelector('.earlier-card') as HTMLElement;
    expect(card.textContent).not.toMatch(/Download|Track|Timeline|QR|View/);
    expect(card.querySelectorAll('a').length).toBe(1); // Renew, only
  });

  it('shows no Valid/Expired chip when the register gives no end date', async () => {
    const { el } = await render({ permits: [{ ...EXPIRED, validUntil: null }] });
    expect(el.querySelector('.earlier-validity')).toBeNull();
    expect(el.textContent).not.toContain('Valid until');
  });

  it('hides the section when there are none, keeping only "Find my earlier permits"', async () => {
    const { el } = await render();
    expect(el.querySelector('.earlier-card')).toBeNull();
    expect(el.querySelector('h2')).toBeNull();
    expect(el.querySelector('.earlier-find-toggle')?.textContent).toContain('Find my earlier permits');
    expect(el.querySelector('.earlier-requests')).toBeNull();
  });

  it('Renew opens the wizard as a Renewal of that type with the paper number filled in', async () => {
    const { el } = await render({ permits: [EXPIRED, CURRENT], businesses: [IMPORTED_BUSINESS] });
    const links = Array.from(el.querySelectorAll('a.earlier-renew')).map((a) => a.getAttribute('href'));
    expect(links[0]).toBe('/permits/apply?type=Building%20Permit&action=Renewal&permitNumber=BP-2019-0412');
    // The business from the same register, under the same name, is chosen for a business's permit.
    expect(links[1]).toBe('/permits/apply?type=Sign%20Permit&action=Renewal&permitNumber=SP%202024%2F0033&businessId=biz-old');
  });

  it('offers no Renew for a type eBPCO no longer files', async () => {
    const { el } = await render({ permits: [RETIRED] });
    expect(el.querySelector('.earlier-card')).not.toBeNull();
    expect(el.querySelector('a.earlier-renew')).toBeNull();
  });
});

describe('EarlierPermitsComponent: Find my earlier permits', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function openForm(setup: Setup = {}) {
    const rendered = await render(setup);
    (rendered.el.querySelector('.earlier-find-toggle') as HTMLButtonElement).click();
    await settle(rendered.fixture);
    return rendered;
  }

  it('asks for the date issued or the OR number before sending anything', async () => {
    const { fixture, el, sent } = await openForm();
    type(el, '#earlier-claim-permit-number', 'BP-2018-0007');
    (el.querySelector('.earlier-claim__send') as HTMLButtonElement).click();
    await settle(fixture);
    expect(sent).toEqual([]);
    expect(el.querySelector('.earlier-claim__error')?.textContent).toContain('Give the date issued or the OR number — at least one.');
  });

  it('sends the claim, says so in the same words whatever the register holds, and lists it as Waiting', async () => {
    const { fixture, el, sent } = await openForm();
    type(el, '#earlier-claim-permit-number', '  CO 2020/0033 ');
    type(el, '#earlier-claim-or-number', 'OR 7781234');
    (el.querySelector('.earlier-claim__send') as HTMLButtonElement).click();
    await settle(fixture);

    expect(sent).toEqual([{ permitNumber: 'CO 2020/0033', dateIssued: null, orNumber: 'OR 7781234' }]);
    expect(el.querySelector('.earlier-claim__sent')?.textContent)
      .toContain('Sent. The Municipality will check its register and tell you.');
    const request = el.querySelector('.earlier-request') as HTMLElement;
    expect(request.textContent).toContain('CO 2020/0033');
    expect(request.querySelector('.earlier-request__status')?.textContent).toContain('Waiting');
    expect((el.querySelector('#earlier-claim-permit-number') as HTMLInputElement).value).toBe('');
  });

  it('sends the date issued as YYYY-MM-DD', async () => {
    const { fixture, el, sent } = await openForm();
    type(el, '#earlier-claim-permit-number', 'BP-2018-0007');
    type(el, '#earlier-claim-date-issued', '2018-03-02');
    (el.querySelector('.earlier-claim__send') as HTMLButtonElement).click();
    await settle(fixture);
    expect(sent).toEqual([{ permitNumber: 'BP-2018-0007', dateIssued: '2018-03-02', orNumber: null }]);
  });

  it('shows the server\'s own words when it refuses (409 already waiting)', async () => {
    const { fixture, el } = await openForm({
      claimAnswer: () => throwError(() => new ApiError(409, {
        status: 409, detail: 'You already claimed this permit; the Municipality will answer it.',
      }, false)),
    });
    type(el, '#earlier-claim-permit-number', 'BP-2018-0007');
    type(el, '#earlier-claim-or-number', '123');
    (el.querySelector('.earlier-claim__send') as HTMLButtonElement).click();
    await settle(fixture);
    expect(el.querySelector('.earlier-claim__error')?.textContent)
      .toContain('You already claimed this permit; the Municipality will answer it.');
    expect(el.querySelector('.earlier-claim__sent')).toBeNull();
  });

  it('shows a 400\'s field message, which comes without a detail', async () => {
    const { fixture, el } = await openForm({
      claimAnswer: () => throwError(() => new ApiError(400, {
        status: 400, title: 'The request did not validate',
        fieldErrors: [{ pointer: '/', message: 'Give the permit number and either the date it was issued or the OR number.' }],
      }, false)),
    });
    type(el, '#earlier-claim-permit-number', 'BP-2018-0007');
    type(el, '#earlier-claim-or-number', '123');
    (el.querySelector('.earlier-claim__send') as HTMLButtonElement).click();
    await settle(fixture);
    expect(el.querySelector('.earlier-claim__error')?.textContent)
      .toContain('Give the permit number and either the date it was issued or the OR number.');
  });

  it('lists "Your requests" with Waiting, Confirmed and Not confirmed, and the officer\'s note', async () => {
    const { el } = await render({
      claims: [
        claim({ id: 'a', permitNumber: 'BP-2018-0007', status: 'pending' }),
        claim({ id: 'b', permitNumber: 'BP-2017-0101', status: 'confirmed', orNumber: '5512' }),
        claim({ id: 'c', permitNumber: 'BP-2016-0099', status: 'rejected', note: 'The register shows another owner.' }),
      ],
    });
    expect(el.querySelector('.earlier-requests .card-title')?.textContent).toContain('Your requests');
    const chips = Array.from(el.querySelectorAll('.earlier-request__status')).map((c) => c.textContent?.trim());
    expect(chips).toEqual(['Waiting', 'Confirmed', 'Not confirmed']);
    const rows = Array.from(el.querySelectorAll('.earlier-request')) as HTMLElement[];
    expect(rows[1].textContent).toContain('OR 5512');
    expect(rows[2].querySelector('.earlier-request__note')?.textContent)
      .toContain('Note from the Municipality: The register shows another owner.');
    expect(rows[2].getAttribute('data-status')).toBe('rejected');
  });
});

describe('EarlierRecordsStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('empties when the citizen signs out, so the next one never sees them', async () => {
    const { fixture, signedIn } = await render({ permits: [EXPIRED], claims: [claim({})] });
    const store = TestBed.inject(EarlierRecordsStore);
    expect(store.permits()).toHaveLength(1);
    signedIn.set(false);
    await settle(fixture);
    expect(store.permits()).toEqual([]);
    expect(store.claims()).toEqual([]);
  });
});

describe('Records before eBPCO: helpers', () => {
  it('reads Valid through the last day and Expired after it', () => {
    expect(earlierPermitStanding('2026-10-23', '2026-10-23')).toBe('Valid');
    expect(earlierPermitStanding('2026-10-22', '2026-10-23')).toBe('Expired');
    expect(earlierPermitStanding(null, '2026-10-23')).toBeNull();
  });

  it('takes today in Castilla, not on the device', () => {
    // 01:30 on 23 Oct in Manila is still 22 Oct in UTC.
    expect(manilaToday(new Date('2026-10-22T17:30:00.000Z'))).toBe('2026-10-23');
  });

  it('names a business only when exactly one from the register has that name', () => {
    const base = { category: 'Retail', ownerApplicantId: 'a', street: '', barangay: '', city: '', province: '',
      registrationNumber: '', dateRegistered: '', status: 'Active' } as const;
    const old = { ...base, id: 'old', name: 'Dela Cruz Hardware', importedBeforeEbpco: true };
    const fresh = { ...base, id: 'new', name: 'Dela Cruz Hardware', importedBeforeEbpco: false };
    expect(businessForEarlierPermit({ businessName: ' dela cruz hardware ' }, [old, fresh])).toBe('old');
    expect(businessForEarlierPermit({ businessName: 'Dela Cruz Hardware' }, [fresh])).toBeNull();
    expect(businessForEarlierPermit({ businessName: 'Dela Cruz Hardware' }, [old, { ...old, id: 'twin' }])).toBeNull();
    expect(businessForEarlierPermit({ businessName: null }, [old])).toBeNull();
  });
});
