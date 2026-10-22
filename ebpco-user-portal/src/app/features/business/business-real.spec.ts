import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { BusinessStore } from '../../core/stores/business.store';
import { CitizenApiClient } from '../../core/api/citizen-api.client';
import { ApiError } from '../../core/api/problem';
import { BusinessSummary } from '../../core/api/citizen-api.models';
import { provideRouter } from '@angular/router';
import { BusinessListPage } from './business-list.page';

/**
 * `BusinessStore.updateReal`/`deactivateReal`/`reactivateReal` — the real
 * counterparts to `update`/`setStatus`, added once `PATCH /businesses/:id`
 * and its two status routes existed server-side. Before these, a business
 * fetched from the real backend had no way to be changed at all: the Edit
 * Business link was hidden whenever `usingReal()` was true, and `update()`
 * only ever wrote to the local demo signal.
 */
describe('BusinessStore — real edit/deactivate/reactivate', () => {
  const SUMMARY: BusinessSummary = {
    id: 'biz-real-1', name: 'Cafe', category: 'Food Service',
    street: '1 Rizal Street', barangay: 'Mayon', city: 'Castilla', province: 'Sorsogon',
    registrationNumber: 'a2323', dateRegistered: '2020-09-09', status: 'Active',
  };

  function mount(api: Partial<CitizenApiClient>) {
    TestBed.configureTestingModule({
      providers: [{ provide: CitizenApiClient, useValue: api }],
    });
    return TestBed.inject(BusinessStore);
  }

  afterEach(() => TestBed.resetTestingModule());

  it('updateReal sends the owner-editable fields and refreshes the real list', async () => {
    let sent: unknown = null;
    const store = mount({
      configured: true,
      listBusinesses: () => of({ data: [{ ...SUMMARY, name: 'Cafe Renamed' }] }),
      updateBusiness: (id, body) => { sent = { id, body }; return of({ ...SUMMARY, ...body }); },
    } as Partial<CitizenApiClient>);

    const result = await store.updateReal('biz-real-1', {
      name: 'Cafe Renamed', category: 'Food Service',
      street: '1 Rizal Street', barangay: 'Mayon', city: 'Castilla', province: 'Sorsogon',
    });

    expect(result.ok).toBe(true);
    expect(sent).toEqual({
      id: 'biz-real-1',
      body: {
        name: 'Cafe Renamed', category: 'Food Service',
        street: '1 Rizal Street', barangay: 'Mayon', city: 'Castilla', province: 'Sorsogon',
      },
    });
    expect(store.businessById('biz-real-1')?.name).toBe('Cafe Renamed');
  });

  it('updateReal reports the server\'s refusal rather than pretending it saved', async () => {
    const store = mount({
      configured: true,
      listBusinesses: () => of({ data: [SUMMARY] }),
      updateBusiness: () => throwError(() => new ApiError(422, { detail: 'That could not be saved.' }, false)),
    } as Partial<CitizenApiClient>);

    const result = await store.updateReal('biz-real-1', {
      name: '', category: 'Food Service', street: '', barangay: '', city: '', province: '',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('That could not be saved.');
  });

  it('deactivateReal marks it Inactive via the real endpoint, never a hard delete', async () => {
    let calledWith: string | null = null;
    const store = mount({
      configured: true,
      listBusinesses: () => of({ data: [{ ...SUMMARY, status: 'Inactive' }] }),
      deactivateBusiness: (id) => { calledWith = id; return of({ ...SUMMARY, status: 'Inactive' }); },
    } as Partial<CitizenApiClient>);

    const result = await store.deactivateReal('biz-real-1');

    expect(result.ok).toBe(true);
    expect(calledWith).toBe('biz-real-1');
    expect(store.businessById('biz-real-1')?.status).toBe('Inactive');
  });

  it('deactivateReal surfaces the server\'s in-progress-application refusal', async () => {
    const store = mount({
      configured: true,
      listBusinesses: () => of({ data: [SUMMARY] }),
      deactivateBusiness: () => throwError(() =>
        new ApiError(422, { detail: 'This business has an application still in progress.' }, false)),
    } as Partial<CitizenApiClient>);

    const result = await store.deactivateReal('biz-real-1');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('still in progress');
  });

  it('reactivateReal marks it Active again', async () => {
    const store = mount({
      configured: true,
      listBusinesses: () => of({ data: [{ ...SUMMARY, status: 'Active' }] }),
      reactivateBusiness: () => of({ ...SUMMARY, status: 'Active' }),
    } as Partial<CitizenApiClient>);

    const result = await store.reactivateReal('biz-real-1');

    expect(result.ok).toBe(true);
    expect(store.businessById('biz-real-1')?.status).toBe('Active');
  });
});

/**
 * A business in the Municipality's registry before eBPCO, matched to the
 * account by an officer (migration 069), carries the "Issued before eBPCO"
 * badge on My Businesses. Nothing else about it changes.
 */
describe('My Businesses: Issued before eBPCO', () => {
  const OLD: BusinessSummary = {
    id: 'biz-old', name: 'Dela Cruz Hardware', category: 'Retail',
    street: 'Rizal St.', barangay: 'Poblacion', city: 'Castilla', province: 'Sorsogon',
    registrationNumber: 'BN-2015-11', dateRegistered: '2015-01-05', status: 'Active', importedBeforeEbpco: true,
  };
  const NEW: BusinessSummary = { ...OLD, id: 'biz-new', name: 'Cafe', importedBeforeEbpco: false };

  afterEach(() => TestBed.resetTestingModule());

  it('keeps the mark from GET /businesses', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: CitizenApiClient, useValue: { configured: true, listBusinesses: () => of({ data: [OLD, NEW] }) } }],
    });
    const store = TestBed.inject(BusinessStore);
    await store.refreshMine();
    expect(store.businessById('biz-old')?.importedBeforeEbpco).toBe(true);
    expect(store.businessById('biz-new')?.importedBeforeEbpco).toBe(false);
  });

  it('shows the badge on that business only', () => {
    const businesses = [OLD, NEW].map((b) => ({ ...b, ownerApplicantId: 'a' }));
    TestBed.configureTestingModule({
      imports: [BusinessListPage],
      providers: [provideRouter([]), { provide: BusinessStore, useValue: { usingReal: () => true, myBusinesses: () => businesses } }],
    });
    const fixture = TestBed.createComponent(BusinessListPage);
    fixture.detectChanges();
    const cards = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.business-card'));
    expect(cards[0].querySelector('.business-before-ebpco')?.textContent).toContain('Issued before eBPCO');
    expect(cards[1].querySelector('.business-before-ebpco')).toBeNull();
  });
});
