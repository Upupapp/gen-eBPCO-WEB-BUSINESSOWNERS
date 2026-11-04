import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApplicationStore } from '../../core/stores/application.store';
import { BusinessStore } from '../../core/stores/business.store';
import { NotificationStore } from '../../core/stores/notification.store';
import { AuthService } from '../../core/session/auth.service';
import { StatusPillComponent } from '../../shared/ui/status-pill.component';
import { VerificationBannerComponent } from '../../shared/ui/verification-banner.component';
import { applicantStatusLabel, applicantStatusOf, isTerminalStatus } from '../../core/domain/status.model';
import { fullName } from '../../core/domain/user.model';
import { applicantLabel } from '../../core/domain/application.model';
import { formatDate } from '../../core/utils/ids';
import { permitVisual } from '../../core/domain/permit-visual';

/** Small outline-icon path set, drawn in the Lucide visual style (24x24, round caps/joins) so the dashboard doesn't need an extra icon-library dependency — lucide-angular's latest release only supports Angular up to 21.x, and this app is on 22.1. Per-permit-type icon/color mapping lives in core/domain/permit-visual.ts, shared with the Permit Services catalog. */
const ICONS = {
  filePlus: ['M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z', 'M14 3v4h4', 'M12 12v6', 'M9 15h6'],
  store: [
    'M4 9 5 4h14l1 5',
    'M4 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0',
    'M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9',
    'M9 20v-5h6v5',
  ],
  clipboardCheck: [
    'M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z',
    'M6 6h12a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
    'm9 13.5 2 2 4-4.5',
  ],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7v5l3.5 2'],
  checkCircle: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'm8.5 12.2 2.4 2.4 4.6-5.2'],
  chevronRight: ['m9 6 6 6-6 6'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 11v5', 'M12 8h.01'],
  bell: ['M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z', 'M10 19a2 2 0 0 0 4 0'],
} as const;

interface DashboardKpi {
  theme: 'red' | 'blue' | 'orange' | 'green';
  label: string;
  value: number;
  helper: string;
  icon: readonly string[];
  link?: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, StatusPillComponent, VerificationBannerComponent],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage {
  protected readonly applications = inject(ApplicationStore);
  protected readonly businesses = inject(BusinessStore);
  protected readonly notifications = inject(NotificationStore);
  private readonly auth = inject(AuthService);

  protected readonly formatDate = formatDate;
  protected readonly icons = ICONS;
  /** "Private individual", or the business's name, where a row used to show only the business. */
  protected readonly applicantLabel = applicantLabel;

  firstName(): string {
    const u = this.auth.currentUser();
    return u ? fullName(u).split(' ')[0] : '';
  }

  statusLabel(status: Parameters<typeof applicantStatusOf>[0]): string {
    return applicantStatusLabel(status);
  }

  /**
   * Both counts read the server's own projection (`applicantStatus`,
   * `requiresApplicantAction`) and fall back to the local projection only for
   * a row the server did not supply — the same rule `statusLabel` uses for
   * the list, so a card and the rows beside it can never disagree. Found
   * live: an application whose permit had been released showed "Ready for
   * Release" in the list while this card, counting only the exact server
   * status, said 0.
   */
  awaitingAction(): number {
    // A draft always waits on the citizen. The server's flag is the office's view and leaves drafts out, so the
    // card said 0 beside its own "or still a draft" (live check, 4 Nov 2026).
    return this.applications
      .myApplications()
      .filter((a) => a.lifecycleStatus === 'Draft' || (a.requiresApplicantAction
        ?? ['Revision Required', 'Assessed'].includes(a.lifecycleStatus))).length;
  }

  /** Where a row opens: a draft goes back into the form (as My Applications' Continue does), anything else to its page. */
  rowLink(a: { id: string; lifecycleStatus: string }): { link: unknown[]; query: Record<string, string> | null } {
    return a.lifecycleStatus === 'Draft'
      ? { link: ['/permits/apply'], query: { draft: a.id } }
      : { link: ['/applications', a.id], query: null };
  }

  /**
   * Permits waiting to be collected, and only those. The Ready for Release
   * CATEGORY also holds Released and Completed (the filter tabs need that),
   * so a permit already collected still counted here as "Ready to claim"
   * (QA TC-33, 2026-10-03). A permit on its way by courier (migration 070)
   * counts too: it is issued and not yet in the citizen's hands.
   */
  readyForRelease(): number {
    return this.applications
      .myApplications()
      .filter((a) => a.lifecycleStatus === 'Ready for Release' || a.lifecycleStatus === 'Out for Delivery').length;
  }

  /** Open applications: a completed, withdrawn, rejected or expired one is not "active" (QA TC-33). */
  activeApplications() {
    return this.applications.myApplications().filter((a) => !isTerminalStatus(a.lifecycleStatus));
  }

  /** The Active applications panel shows five rows at most, with a link to the rest. */
  shownApplications() {
    return this.activeApplications().slice(0, 5);
  }

  /**
   * What is waiting on the citizen, for the Needs your attention callout:
   * a returned application to fix, an Order of Payment to pay, a permit on
   * its way to confirm. Read from the list's own statuses; display only.
   */
  attention(): { id: string; permitType: string; applicationNumber: string; reason: string; action: string; link: unknown[]; query?: Record<string, string> }[] {
    const items: { id: string; permitType: string; applicationNumber: string; reason: string; action: string; link: unknown[]; query?: Record<string, string> }[] = [];
    for (const a of this.applications.myApplications()) {
      const base = { id: a.id, permitType: a.permitType, applicationNumber: a.applicationNumber };
      if (a.lifecycleStatus === 'Draft') {
        items.push({ ...base, applicationNumber: '', reason: 'not submitted yet', action: 'Continue', link: ['/permits/apply'], query: { draft: a.id } });
      } else if (a.lifecycleStatus === 'Revision Required') {
        items.push({ ...base, reason: 'the office returned it for changes', action: 'Fix now', link: ['/applications', a.id] });
      } else if (a.lifecycleStatus === 'Assessed' && (a.paymentStatus === 'Not Yet Available' || a.paymentStatus === 'Overdue')) {
        items.push({ ...base, reason: a.paymentStatus === 'Overdue' ? 'payment is overdue' : 'ready for payment', action: 'Pay', link: ['/payments', a.id] });
      } else if (a.lifecycleStatus === 'Out for Delivery') {
        items.push({ ...base, reason: 'your permit is on its way by courier', action: 'Confirm receipt', link: ['/applications', a.id] });
      }
    }
    return items.slice(0, 5);
  }

  get kpis(): DashboardKpi[] {
    return [
      {
        theme: 'red',
        label: 'My businesses',
        value: this.businesses.myBusinesses().length,
        helper: 'View all businesses',
        icon: ICONS.store,
        link: '/businesses',
      },
      {
        theme: 'blue',
        label: 'All applications',
        value: this.applications.myApplications().length,
        helper: 'Every status, including finished ones',
        icon: ICONS.clipboardCheck,
      },
      {
        theme: 'orange',
        label: 'Needs your action',
        value: this.awaitingAction(),
        helper: 'Returned, to pay, or still a draft',
        icon: ICONS.clock,
      },
      {
        theme: 'green',
        label: 'Ready for Release',
        value: this.readyForRelease(),
        helper: 'Ready to claim, or on its way',
        icon: ICONS.checkCircle,
      },
    ];
  }

  /** Icon + color mapping for an application row, keyed by permit type substring. */
  applicationVisual = permitVisual;
}
