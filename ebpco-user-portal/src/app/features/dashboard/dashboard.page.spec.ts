import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DashboardPage } from './dashboard.page';
import { ApplicationStore } from '../../core/stores/application.store';
import { BusinessStore } from '../../core/stores/business.store';
import { NotificationStore } from '../../core/stores/notification.store';
import { AuthService } from '../../core/session/auth.service';
import { ApplicationRecord } from '../../core/domain/application.model';
import { ApplicationLifecycleStatus } from '../../core/domain/status.model';

/**
 * QA TC-33 (2026-10-03): a permit already collected still counted as "Ready
 * for Release — Ready to claim", and a completed application was listed
 * under Active Applications.
 */
describe('DashboardPage', () => {
  const row = (id: string, lifecycleStatus: ApplicationLifecycleStatus) =>
    ({ id, lifecycleStatus, applicantStatus: 'Ready for Release' }) as ApplicationRecord;

  function page(rows: ApplicationRecord[]): DashboardPage {
    TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [
        provideRouter([]),
        { provide: ApplicationStore, useValue: { myApplications: () => rows } },
        { provide: BusinessStore, useValue: { myBusinesses: () => [] } },
        { provide: NotificationStore, useValue: { all: () => [] } },
        { provide: AuthService, useValue: { currentUser: () => null } },
      ],
    });
    return TestBed.createComponent(DashboardPage).componentInstance;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('counts only permits waiting to be collected as Ready for Release', () => {
    const dashboard = page([row('a', 'Ready for Release'), row('b', 'Released'), row('c', 'Completed')]);
    expect(dashboard.readyForRelease()).toBe(1);
  });

  it('counts a permit on its way by courier with the ones ready to claim (migration 070)', () => {
    const dashboard = page([row('a', 'Ready for Release'), row('b', 'Out for Delivery'), row('c', 'Completed')]);
    expect(dashboard.readyForRelease()).toBe(2);
    expect(dashboard.activeApplications().map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('keeps finished and withdrawn applications out of Active Applications', () => {
    const dashboard = page([
      row('a', 'Under Evaluation'), row('b', 'Completed'), row('c', 'Cancelled'), row('d', 'Rejected'), row('e', 'Released'),
    ]);
    expect(dashboard.activeApplications().map((a) => a.id)).toEqual(['a', 'e']);
  });

  /** Live check, 4 Nov 2026: "Needs your action 0 — returned, to pay, or still a draft" beside a draft. */
  it('counts a draft as needing the citizen, even when the server does not flag it', () => {
    const draft = { ...row('d', 'Draft'), requiresApplicantAction: false } as ApplicationRecord;
    const submitted = { ...row('s', 'Submitted'), requiresApplicantAction: false } as ApplicationRecord;
    const returned = { ...row('r', 'Revision Required'), requiresApplicantAction: true } as ApplicationRecord;
    const dashboard = page([draft, submitted, returned]);
    expect(dashboard.awaitingAction()).toBe(2);
    expect(dashboard.attention().map((i) => [i.id, i.action])).toEqual([['d', 'Continue'], ['r', 'Fix now']]);
  });

  it('sends a draft back into the form, and anything else to its page', () => {
    const dashboard = page([]);
    expect(dashboard.rowLink({ id: 'd', lifecycleStatus: 'Draft' })).toEqual({ link: ['/permits/apply'], query: { draft: 'd' } });
    expect(dashboard.rowLink({ id: 's', lifecycleStatus: 'Submitted' })).toEqual({ link: ['/applications', 's'], query: null });
  });
});
