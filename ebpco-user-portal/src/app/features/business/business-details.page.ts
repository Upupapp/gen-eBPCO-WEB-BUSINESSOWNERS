import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BusinessStore } from '../../core/stores/business.store';
import { ApplicationStore } from '../../core/stores/application.store';
import { StatusPillComponent } from '../../shared/ui/status-pill.component';
import { applicantStatusLabel, applicantStatusOf } from '../../core/domain/status.model';
import { formatDate } from '../../core/utils/ids';
import { ToastService } from '../../shared/ui/toast.service';
import { BackLinkComponent } from '../../shared/ui/back-link.component';
import { REGISTERED_BEFORE_EBPCO_LABEL } from '../../core/domain/earlier-records';

@Component({
  selector: 'app-business-details',
  imports: [RouterLink, StatusPillComponent, BackLinkComponent],
  template: `
    @if (business(); as b) {
      <div class="page">
        <app-back-link fallback="/businesses" fallbackLabel="My Businesses" />
        <div class="page-header">
          <div>
            <!-- The business's status beside its name (it sat inside the address card). -->
            <div class="page-title-row">
              <h1>{{ b.name }}</h1>
              <app-status-pill [label]="b.status" />
              @if (b.importedBeforeEbpco) {
                <span class="badge badge-violet business-before-ebpco"
                      title="Registered in the Municipality's registry before eBPCO">{{ beforeEbpco }}</span>
              }
            </div>
            <div class="subtitle">{{ b.category }} · Reg. No. {{ b.registrationNumber }} · Registered {{ formatDate(b.dateRegistered) }}</div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <a [routerLink]="['/businesses', b.id, 'edit']" class="btn btn-secondary">Edit Business</a>
            @if (b.status === 'Active') {
              <!-- Destructive, so it must not look like Edit: a red outline. -->
              <button
                class="btn btn-danger-outline"
                type="button"
                [disabled]="changingStatus()"
                (click)="deactivate(b.id)"
              >{{ changingStatus() ? 'Deactivating…' : 'Deactivate' }}</button>
            } @else {
              <button
                class="btn btn-secondary"
                type="button"
                [disabled]="changingStatus()"
                (click)="reactivate(b.id)"
              >{{ changingStatus() ? 'Reactivating…' : 'Reactivate' }}</button>
            }
            @if (b.status === 'Active') {
              <a [routerLink]="['/permits']" [queryParams]="{ businessId: b.id }" class="btn btn-primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M14 3v4h4M12 12v6M9 15h6" /></svg> Apply for a permit</a>
            } @else {
              <button type="button" class="btn btn-primary" (click)="applyForInactive()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M14 3v4h4M12 12v6M9 15h6" /></svg> Apply for a permit</button>
            }
          </div>
        </div>

        @if (statusError(); as err) {
          <div class="callout callout-danger" style="margin-bottom:16px;">
            <p>{{ err }}</p>
          </div>
        }

        <div class="card" style="margin-bottom:16px;">
          <div class="card-title">Business address</div>
          <p style="margin:0;">{{ b.street }}, Barangay {{ b.barangay }}, {{ b.city }}, {{ b.province }}</p>
        </div>

        <div class="card">
          <div class="card-title">Applications for this Business</div>
          @if (appsForBusiness().length === 0) {
            <div class="empty-state empty-state--file">
              <span class="empty-state-title">No applications yet</span>
              <p>Applications filed for this business show here.</p>
            </div>
          } @else {
            <table class="table">
              <thead><tr><th>Application no.</th><th>Permit type</th><th>Status</th><th>Submitted</th></tr></thead>
              <tbody>
                @for (app of appsForBusiness(); track app.id) {
                  <tr>
                    <td>
                      <a [routerLink]="['/applications', app.id]" class="table-cell-clip" [title]="app.applicationNumber">{{ app.applicationNumber }}</a>
                    </td>
                    <td><span class="table-cell-clip" [title]="app.permitType">{{ app.permitType }}</span></td>
                    <td><app-status-pill [label]="applicantStatusLabel(app.lifecycleStatus)" /></td>
                    <td>{{ formatDate(app.dateSubmitted) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
      </div>
    } @else {
      <div class="page">
        <div class="card empty-state">
          <p>We couldn't find that business. It may not be registered under your account, or the link may be out of date.</p>
          <a routerLink="/businesses" class="btn btn-primary">Back to My Businesses</a>
        </div>
      </div>
    }
  `,
})
export class BusinessDetailsPage {
  private readonly route = inject(ActivatedRoute);
  protected readonly businessStore = inject(BusinessStore);
  private readonly applicationStore = inject(ApplicationStore);
  private readonly toast = inject(ToastService);

  protected readonly formatDate = formatDate;
  protected readonly beforeEbpco = REGISTERED_BEFORE_EBPCO_LABEL;
  protected readonly applicantStatusOf = applicantStatusOf;
  protected readonly applicantStatusLabel = applicantStatusLabel;

  protected readonly changingStatus = signal(false);
  protected readonly statusError = signal<string | null>(null);

  business() {
    const id = this.route.snapshot.paramMap.get('id')!;
    return this.businessStore.businessById(id);
  }

  appsForBusiness() {
    const id = this.route.snapshot.paramMap.get('id')!;
    return this.applicationStore.myApplications().filter((a) => a.businessId === id);
  }

  /** Kept as a real button rather than hidden outright, so an inactive business still explains itself rather than the option just vanishing. */
  protected applyForInactive(): void {
    this.toast.error('This business is inactive. Reactivate it before applying for a permit.');
  }

  protected async deactivate(id: string): Promise<void> {
    this.statusError.set(null);
    if (!this.businessStore.usingReal()) {
      try {
        this.businessStore.setStatus(id, 'Inactive');
        this.toast.success('Business deactivated.');
      } catch (e) {
        this.statusError.set(e instanceof Error ? e.message : 'That change could not be saved.');
      }
      return;
    }
    this.changingStatus.set(true);
    const result = await this.businessStore.deactivateReal(id);
    this.changingStatus.set(false);
    if (!result.ok) {
      this.statusError.set(result.error);
      return;
    }
    this.toast.success('Business deactivated. Reactivate it any time from this page.');
  }

  protected async reactivate(id: string): Promise<void> {
    this.statusError.set(null);
    if (!this.businessStore.usingReal()) {
      try {
        this.businessStore.setStatus(id, 'Active');
        this.toast.success('Business reactivated.');
      } catch (e) {
        this.statusError.set(e instanceof Error ? e.message : 'That change could not be saved.');
      }
      return;
    }
    this.changingStatus.set(true);
    const result = await this.businessStore.reactivateReal(id);
    this.changingStatus.set(false);
    if (!result.ok) {
      this.statusError.set(result.error);
      return;
    }
    this.toast.success('Business reactivated.');
  }
}
