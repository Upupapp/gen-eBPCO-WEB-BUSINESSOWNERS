import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MyApplicationsPage } from './my-applications.page';
import { ApplicationStore } from '../../core/stores/application.store';
import { ApplicationRecord } from '../../core/domain/application.model';
import { ApplicationLifecycleStatus } from '../../core/domain/status.model';

/**
 * QA TC-35 (2026-10-03): a returned, withdrawn or finished application could
 * not be listed on its own. Every status a citizen sees on a row has a tab.
 */
describe('MyApplicationsPage filters', () => {
  const row = (id: string, lifecycleStatus: ApplicationLifecycleStatus) =>
    ({ id, lifecycleStatus, applicationNumber: id, permitType: 'Building Permit', businessName: 'Shop' }) as ApplicationRecord;
  const ROWS = [
    row('a', 'Draft'), row('b', 'Revision Required'), row('c', 'Completed'),
    row('d', 'Cancelled'), row('e', 'Released'), row('f', 'Ready for Release'),
  ];

  function render() {
    TestBed.configureTestingModule({
      imports: [MyApplicationsPage],
      providers: [provideRouter([]), { provide: ApplicationStore, useValue: { myApplications: () => ROWS } }],
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
    page.filter.set('Ready for Release');
    expect(page.filtered().map((a) => a.id)).toEqual(['f']);
    page.filter.set('All');
    expect(page.filtered()).toHaveLength(ROWS.length);
  });

  it('hides Expired until an application has expired', () => {
    const text = (render().nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Expired');
  });
});

/**
 * One account files both residential and business applications (owner
 * request, 2026-10-21). Where the list showed only a business name, a
 * residential application, which names none, reads "Residential".
 */
describe('MyApplicationsPage: Applying as', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows "Residential" for a residential application, and the business name for a business one', () => {
    const rows = [
      { id: 'r', lifecycleStatus: 'Submitted', applicationNumber: 'BP-1', permitType: 'Building Permit', businessName: '', applyingAs: 'residential' },
      { id: 'b', lifecycleStatus: 'Submitted', applicationNumber: 'SP-2', permitType: 'Sign Permit', businessName: 'Dela Cruz Hardware', applyingAs: 'business' },
    ] as ApplicationRecord[];
    TestBed.configureTestingModule({
      imports: [MyApplicationsPage],
      providers: [provideRouter([]), { provide: ApplicationStore, useValue: { myApplications: () => rows } }],
    });
    const fixture = TestBed.createComponent(MyApplicationsPage);
    fixture.detectChanges();
    const cells = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'))
      .map((tr) => tr.querySelectorAll('td')[2]?.textContent?.trim());
    expect(cells).toEqual(['Residential', 'Dela Cruz Hardware']);
  });
});
