import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MyApplicationsPage } from './my-applications.page';
import { ApplicationStore } from '../../core/stores/application.store';
import { ApplicationRecord } from '../../core/domain/application.model';
import { ApplicationLifecycleStatus } from '../../core/domain/status.model';
import { EarlierRecordsStore } from '../../core/stores/earlier-records.store';
import { BusinessStore } from '../../core/stores/business.store';
import { EarlierPermit } from '../../core/api/citizen-api.models';

/** The "Issued before eBPCO" section's stores (migration 069), with nothing in them unless a test says so. */
function earlierRecords(permits: EarlierPermit[] = []) {
  return [
    { provide: EarlierRecordsStore, useValue: { permits: () => permits, claims: () => [], revisit: () => {} } },
    { provide: BusinessStore, useValue: { myBusinesses: () => [] } },
  ];
}

/**
 * QA TC-35 (2026-10-03): a returned, withdrawn or finished application could
 * not be listed on its own. Every status a citizen sees on a row has a tab.
 */
describe('MyApplicationsPage filters', () => {
  const row = (id: string, lifecycleStatus: ApplicationLifecycleStatus) =>
    ({ id, lifecycleStatus, applicationNumber: id, permitType: 'Building Permit', businessName: 'Shop' }) as ApplicationRecord;
  const ROWS = [
    row('a', 'Draft'), row('b', 'Revision Required'), row('c', 'Completed'),
    row('d', 'Cancelled'), row('e', 'Released'), row('f', 'Ready for Release'), row('g', 'Out for Delivery'),
  ];

  function render() {
    TestBed.configureTestingModule({
      imports: [MyApplicationsPage],
      providers: [provideRouter([]), { provide: ApplicationStore, useValue: { myApplications: () => ROWS } }, ...earlierRecords()],
    });
    const fixture = TestBed.createComponent(MyApplicationsPage);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('offers Completed, Cancelled and Revision Required', () => {
    const text = (render().nativeElement as HTMLElement).textContent ?? '';
    for (const label of ['Completed', 'Cancelled', 'Revision Required', 'Released']) {
      expect(text).toContain(label);
    }
  });

  it('lists only the applications in the chosen tab', () => {
    const page = render().componentInstance;
    page.filter.set('Completed');
    expect(page.filtered().map((a) => a.id)).toEqual(['c']);
    page.filter.set('Revision Required');
    expect(page.filtered().map((a) => a.id)).toEqual(['b']);
    // A permit on its way by courier (migration 070) is listed with the ones ready to collect.
    page.filter.set('Ready for Release');
    expect(page.filtered().map((a) => a.id)).toEqual(['f', 'g']);
    page.filter.set('All');
    expect(page.filtered()).toHaveLength(ROWS.length);
  });

  // A new account (2026-11-04 demo) read "No applications match this filter / Choose another status".
  it('says there are no applications yet when the account has none, not that the filter matches nothing', () => {
    TestBed.configureTestingModule({
      imports: [MyApplicationsPage],
      providers: [provideRouter([]), { provide: ApplicationStore, useValue: { myApplications: () => [] } }, ...earlierRecords()],
    });
    const fixture = TestBed.createComponent(MyApplicationsPage);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No applications yet');
    expect(text).not.toContain('match this filter');
  });

  it('still says the filter matches nothing when the account has applications in other tabs', () => {
    const fixture = render();
    fixture.componentInstance.filter.set('Rejected');
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No applications match this filter');
  });

  it('hides Expired until an application has expired', () => {
    const text = (render().nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Expired');
  });

  it('hides every tab with nothing in it, and always keeps All', () => {
    const el = render().nativeElement as HTMLElement;
    const tabs = Array.from(el.querySelectorAll('button[aria-pressed]')).map((b) => b.textContent?.replace(/\s+/g, ' ').trim() ?? '');
    expect(tabs).toContain(`All ${ROWS.length}`);
    expect(tabs.some((t) => t.startsWith('Under Review'))).toBe(false);
    expect(tabs.some((t) => t.startsWith('Rejected'))).toBe(false);
  });
});

/**
 * One account files both residential and business applications (owner
 * request, 2026-10-21). Where the list showed only a business name, a
 * residential application, which names none, reads "Residential".
 */
describe('MyApplicationsPage: Applying as', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows "Private individual" for a residential application, and the business name for a business one', () => {
    const rows = [
      { id: 'r', lifecycleStatus: 'Submitted', applicationNumber: 'BP-1', permitType: 'Building Permit', businessName: '', applyingAs: 'residential' },
      { id: 'b', lifecycleStatus: 'Submitted', applicationNumber: 'SP-2', permitType: 'Sign Permit', businessName: 'Dela Cruz Hardware', applyingAs: 'business' },
    ] as ApplicationRecord[];
    TestBed.configureTestingModule({
      imports: [MyApplicationsPage],
      providers: [provideRouter([]), { provide: ApplicationStore, useValue: { myApplications: () => rows } }, ...earlierRecords()],
    });
    const fixture = TestBed.createComponent(MyApplicationsPage);
    fixture.detectChanges();
    const cells = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'))
      .map((tr) => tr.querySelectorAll('td')[2]?.textContent?.trim());
    // Who applies, not what the building is for (design review I6): the stored value stays 'residential'.
    expect(cells).toEqual(['Private individual', 'Dela Cruz Hardware']);
  });

  it('on a phone, lists each application as one card: type and status, then number and date, the whole card a link', () => {
    const rows = [
      { id: 'b', lifecycleStatus: 'Submitted', applicationNumber: 'E-BPCO-2026-000020', permitType: 'Fencing Permit',
        businessName: '', applyingAs: 'residential', dateSubmitted: '2026-11-04T08:00:00.000Z' },
      { id: 'd', lifecycleStatus: 'Draft', applicationNumber: 'E-BPCO-2026-000021', permitType: 'Sign Permit',
        businessName: '', applyingAs: 'residential', updatedAt: '2026-11-04T08:00:00.000Z' },
    ] as unknown as ApplicationRecord[];
    TestBed.configureTestingModule({
      imports: [MyApplicationsPage],
      providers: [provideRouter([]), { provide: ApplicationStore, useValue: { myApplications: () => rows } }, ...earlierRecords()],
    });
    const fixture = TestBed.createComponent(MyApplicationsPage);
    fixture.detectChanges();
    const cards = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('.app-cards a.app-card'));
    expect(cards.map((c) => c.querySelector('.app-card-title strong')?.textContent?.trim())).toEqual(['Fencing Permit', 'Sign Permit']);
    expect(cards[0].querySelector('app-status-pill')).not.toBeNull();
    expect(cards[0].querySelector('.app-card-meta')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('E-BPCO-2026-000020 · Nov 4, 2026');
    expect(cards[0].getAttribute('href')).toBe('/applications/b');
    expect(cards[1].getAttribute('href')).toBe('/permits/apply?draft=d');
  });
});

/**
 * Permits issued on paper before eBPCO (migration 069) are register records,
 * not filings: listed apart under their own label, and counted in no tab.
 */
describe('MyApplicationsPage: Issued before eBPCO', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('lists them apart from the applications and leaves every count alone', () => {
    const rows = [
      { id: 'a', lifecycleStatus: 'Completed', applicationNumber: 'BP-1', permitType: 'Building Permit', businessName: '' },
    ] as ApplicationRecord[];
    const earlier: EarlierPermit = {
      id: 'p1', referenceNumber: 'PRE-2019-000001', permitType: 'Building Permit', permitNumber: 'BP-2019-0412',
      dateIssued: '2019-04-12', validUntil: null, location: null, scopeOfWork: null, businessName: null,
      issuedBy: null, registerRef: null,
    };
    TestBed.configureTestingModule({
      imports: [MyApplicationsPage],
      providers: [provideRouter([]), { provide: ApplicationStore, useValue: { myApplications: () => rows } }, ...earlierRecords([earlier])],
    });
    const fixture = TestBed.createComponent(MyApplicationsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(el.querySelector('tbody')?.textContent).not.toContain('BP-2019-0412');
    expect(el.querySelector('.earlier-card .earlier-card__number')?.textContent).toContain('BP-2019-0412');
    // Filter chips show the count in a counter after the label (house style 2026-11-03), not "(1)".
    const tabs = Array.from(el.querySelectorAll('button[aria-pressed]')).map((b) => b.textContent?.replace(/\s+/g, ' ').trim());
    expect(tabs).toContain('All 1');
    expect(tabs).toContain('Completed 1');
  });
});
