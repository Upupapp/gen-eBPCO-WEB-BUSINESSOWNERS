import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApplicationStore } from '../../core/stores/application.store';
import { StatusPillComponent } from '../../shared/ui/status-pill.component';
import { ApplicationLifecycleStatus, applicantStatusLabel, applicantStatusOf } from '../../core/domain/status.model';
import { ApplicationRecord, applyingAsLabel } from '../../core/domain/application.model';
import { formatDate } from '../../core/utils/ids';
import { EarlierPermitsComponent } from './earlier-permits.component';

interface ApplicationFilter {
  label: string;
  /** null: every application. */
  statuses: readonly ApplicationLifecycleStatus[] | null;
}

/**
 * One tab for every status a citizen can see on a row (QA TC-35, 2026-10-03:
 * Completed, Cancelled and Revision Required had none, so a returned,
 * withdrawn or finished application could not be listed on its own). Each
 * tab names the words on the pills it lists. A tab with nothing in it is
 * hidden (All always shows): twelve chips, seven or eight of them at 0, were
 * a wall to read through (house style 2026-11-03).
 */
const FILTERS: readonly ApplicationFilter[] = [
  { label: 'All', statuses: null },
  { label: 'Draft', statuses: ['Draft'] },
  { label: 'Submitted', statuses: ['Submitted', 'Received'] },
  { label: 'Under Review', statuses: ['Document Verification', 'Under Evaluation'] },
  { label: 'Revision Required', statuses: ['Revision Required'] },
  { label: 'Payment', statuses: ['Assessed', 'Payment Submitted', 'Payment Under Verification', 'Payment Verified', 'For Approval'] },
  { label: 'Approved', statuses: ['Approved', 'Permit Generated'] },
  // A permit on its way by courier (migration 070) sits with the ones ready to collect.
  { label: 'Ready for Release', statuses: ['Ready for Release', 'Out for Delivery'] },
  { label: 'Released', statuses: ['Released'] },
  { label: 'Completed', statuses: ['Completed'] },
  { label: 'Rejected', statuses: ['Rejected'] },
  { label: 'Cancelled', statuses: ['Cancelled'] },
  { label: 'Expired', statuses: ['Expired'] },
];

@Component({
  selector: 'app-my-applications',
  imports: [RouterLink, StatusPillComponent, EarlierPermitsComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>My Applications</h1>
          <div class="subtitle">Track and manage every permit application you've filed.</div>
        </div>
        <a routerLink="/permits" class="btn btn-primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M14 3v4h4M12 12v6M9 15h6" /></svg> Apply for a permit</a>
      </div>

      <div class="filter-chips" role="group" aria-label="Filter by status">
        @for (f of visibleFilters(); track f.label) {
          <button type="button" class="filter-chip" [attr.aria-pressed]="filter() === f.label" (click)="filter.set(f.label)">
            {{ f.label }} <span class="filter-chip-count">{{ countIn(f) }}</span>
          </button>
        }
      </div>

      @if (filtered().length === 0) {
        <div class="card empty-state empty-state--search">
          <span class="empty-state-title">No applications match this filter</span>
          <p>Choose another status to see the rest.</p>
        </div>
      } @else {
        <div class="card" style="padding:0;">
          <table class="table">
            <thead><tr><th>Application no.</th><th>Permit type</th><th>Applying as</th><th>Status</th><th>Submitted</th><th></th></tr></thead>
            <tbody>
              @for (app of filtered(); track app.id) {
                <tr>
                  <td>{{ app.applicationNumber }}</td>
                  <td>{{ app.permitType }}</td>
                  <!-- "Residential", or the business's name (migration 067). -->
                  <td>{{ applyingAsLabel(app) }}</td>
                  <td><app-status-pill [label]="applicantStatusLabel(app.lifecycleStatus)" /></td>
                  <td>
                    @if (app.lifecycleStatus === 'Draft') {
                      Started {{ formatDate(app.updatedAt) }}
                    } @else {
                      {{ formatDate(app.dateSubmitted) }}
                    }
                  </td>
                  <td>
                    @if (app.lifecycleStatus === 'Draft') {
                      <a [routerLink]="['/permits/apply']" [queryParams]="{ draft: app.id }" class="btn btn-secondary btn-sm">Continue</a>
                    } @else {
                      <a [routerLink]="['/applications', app.id]" class="btn btn-secondary btn-sm">View</a>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!--
        Permits issued on paper before eBPCO (migration 069): register records,
        not filings, so they sit apart from the list above and never in its
        counts (the server leaves them out of GET /applications).
      -->
      <app-earlier-permits />
    </div>
  `,
})
export class MyApplicationsPage {
  private readonly store = inject(ApplicationStore);
  protected readonly formatDate = formatDate;
  protected readonly applicantStatusOf = applicantStatusOf;
  protected readonly applicantStatusLabel = applicantStatusLabel;
  protected readonly applyingAsLabel = applyingAsLabel;
  readonly filter = signal<string>('All');

  /** All, every tab something is in, and the chosen one (so it never vanishes under the citizen). */
  protected visibleFilters(): readonly ApplicationFilter[] {
    return FILTERS.filter((f) => f.statuses === null || this.countIn(f) > 0 || this.filter() === f.label);
  }

  protected countIn(f: ApplicationFilter): number {
    return this.store.myApplications().filter((a) => this.inFilter(a, f)).length;
  }

  filtered(): ApplicationRecord[] {
    const f = FILTERS.find((candidate) => candidate.label === this.filter()) ?? FILTERS[0];
    return this.store.myApplications().filter((a) => this.inFilter(a, f));
  }

  private inFilter(a: ApplicationRecord, f: ApplicationFilter): boolean {
    return f.statuses === null || f.statuses.includes(a.lifecycleStatus);
  }
}
