import { Component, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApplicationStore } from '../../core/stores/application.store';
import { StatusPillComponent } from '../../shared/ui/status-pill.component';
import { ApplicationLifecycleStatus, applicantStatusLabel, applicantStatusOf } from '../../core/domain/status.model';
import { ApplicationRecord, applicantLabel } from '../../core/domain/application.model';
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
  imports: [RouterLink, NgTemplateOutlet, StatusPillComponent, EarlierPermitsComponent],
  styles: [`
    /*
     * On a phone, one card per application, as the Payments list does
     * (design review I9): the six-column table hid Status and View behind a
     * sideways scroll nothing showed was there. The table from 641px up.
     */
    .app-cards { display: none; flex-direction: column; gap: 12px; margin: 0; padding: 0; list-style: none; }
    .app-card {
      display: grid; grid-template-columns: minmax(0, 1fr) 20px; gap: 12px; align-items: center;
      padding: 16px; border: 1px solid var(--border-light); border-radius: var(--radius-lg); background: var(--surface);
      box-shadow: var(--shadow-sm); color: inherit; text-decoration: none;
    }
    .app-card:hover { border-color: var(--border-medium); text-decoration: none; }
    .app-card:focus-visible { outline: none; box-shadow: var(--focus-ring); }
    .app-card-main { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .app-card-title { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; }
    .app-card-title strong { font-size: 16px; font-weight: 600; color: var(--gray-900); }
    .app-card-meta { font-size: 13px; color: var(--gray-500); }
    .app-card-chevron { width: 20px; height: 20px; color: var(--gray-500); }
    @media (max-width: 640px) {
      .app-table-card { display: none; }
      .app-cards { display: flex; }
    }
  `],
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

      @if (store.myApplications().length === 0) {
        <!-- No application at all: not "no match for this filter" (found 2026-11-04 on a new account). -->
        <div class="card empty-state">
          <span class="empty-state-title">No applications yet</span>
          <p>Choose Apply for a permit to start one; you can follow it here.</p>
        </div>
      } @else if (filtered().length === 0) {
        <div class="card empty-state empty-state--search">
          <span class="empty-state-title">No applications match this filter</span>
          <p>Choose another status to see the rest.</p>
        </div>
      } @else {
        <div class="card app-table-card" style="padding:0;">
          <table class="table">
            <thead><tr><th>Application no.</th><th>Permit type</th><th>Applying as</th><th>Status</th><th>Submitted</th><th></th></tr></thead>
            <tbody>
              @for (app of filtered(); track app.id) {
                <tr>
                  <td class="nowrap">{{ app.applicationNumber }}</td>
                  <td>{{ app.permitType }}</td>
                  <!-- "Private individual", or the business's name (migration 067). -->
                  <td>{{ applicantLabel(app) }}</td>
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

        <ul class="app-cards" aria-label="Applications">
          @for (app of filtered(); track app.id) {
            <li>
              @if (app.lifecycleStatus === 'Draft') {
                <a class="app-card" [routerLink]="['/permits/apply']" [queryParams]="{ draft: app.id }">
                  <ng-container *ngTemplateOutlet="cardBody; context: { $implicit: app }" />
                </a>
              } @else {
                <a class="app-card" [routerLink]="['/applications', app.id]">
                  <ng-container *ngTemplateOutlet="cardBody; context: { $implicit: app }" />
                </a>
              }
            </li>
          }
        </ul>
        <!-- Line 1: the permit type and its status; line 2: the number and the date. The whole card is the link. -->
        <ng-template #cardBody let-app>
          <span class="app-card-main">
            <span class="app-card-title">
              <strong>{{ app.permitType }}</strong>
              <app-status-pill [label]="applicantStatusLabel(app.lifecycleStatus)" />
            </span>
            <span class="app-card-meta">
              <span class="nowrap">{{ app.applicationNumber }}</span> ·
              <span class="nowrap">{{ app.lifecycleStatus === 'Draft' ? 'Started ' + formatDate(app.updatedAt) : formatDate(app.dateSubmitted) }}</span>
            </span>
          </span>
          <svg class="app-card-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </ng-template>
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
  protected readonly store = inject(ApplicationStore);
  protected readonly formatDate = formatDate;
  protected readonly applicantStatusOf = applicantStatusOf;
  protected readonly applicantStatusLabel = applicantStatusLabel;
  protected readonly applicantLabel = applicantLabel;
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
