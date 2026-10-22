import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BFP_FSIS_URL, PERMIT_TYPE_GROUPS, PermitType } from '../../core/domain/permit.model';
import { REQUIREMENTS_CATALOG } from '../../core/domain/requirements-catalog';
import { permitVisual } from '../../core/domain/permit-visual';
import { applicantKindsChip, usualUseNote } from '../../core/domain/applicant-kinds';
import { PermitTypesStore } from '../../core/stores/permit-types.store';
import { RequirementsModalComponent } from '../../shared/ui/requirements-modal.component';
import { VerificationBannerComponent } from '../../shared/ui/verification-banner.component';

@Component({
  selector: 'app-permit-catalog',
  imports: [RouterLink, RequirementsModalComponent, VerificationBannerComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Permit Services</h1>
          <div class="subtitle">Browse requirements before you start, or begin a new application.</div>
        </div>
      </div>

      <!--
        A business is no longer needed to apply (owner request, 2026-10-21):
        every application asks "Applying as: Residential / Private Individual
        or Business". The banner that said "You need to register a business
        before you can apply for a permit" is gone; what can hold a citizen
        back now is an account the Municipality has not verified yet.
      -->
      <app-verification-banner />

      <!--
        The FSEC and the FSIC used to be permit types here. The BFP issues both
        through its own system, BFP-FSIS (MC 2024-024); filing them with the
        Municipality sent citizens to the wrong office. They are uploaded as
        documents instead, and the Fire Safety stage verifies them.
      -->
      <div class="card bfp-notice">
        <h3>Fire Safety clearances come from the BFP</h3>
        <p class="small">
          The <strong>Fire Safety Evaluation Clearance (FSEC)</strong> for a building permit and the
          <strong>Fire Safety Inspection Certificate (FSIC)</strong> for occupancy are issued by the Bureau of Fire
          Protection, not by the Municipality. Apply for them on
          <a [href]="bfpFsisUrl" target="_blank" rel="noopener noreferrer">BFP-FSIS (fsis.e-bfp.com)</a>
          or at the Castilla Fire Station. Upload the FSEC with your Building Permit application here; a
          Certificate of Occupancy application asks for the Fire Safety Compliance and Commissioning Report
          (FSCCR) instead. Our Fire Safety officer checks both.
        </p>
        <p class="small muted">
          Permits with nothing for the BFP to check, like a Fencing or Sign Permit, skip the Fire Safety stage.
        </p>
      </div>

      @for (group of groups; track group.label) {
        <h3 class="permit-group-heading">{{ group.label }}</h3>
        <div class="permit-grid">
          @for (type of group.types; track type) {
            @let visual = permitVisual(type);
            @let kinds = permitTypes.kindsFor(type);
            <div class="card card-fill permit-card">
              <div class="permit-card__header">
                <div class="permit-card__icon" [style.background]="visual.bg" [style.color]="visual.fg">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    @for (d of visual.icon; track d) { <path [attr.d]="d" /> }
                  </svg>
                </div>
                <!--
                  Who may apply (migration 068): every type is open to homes and
                  businesses unless the Municipality restricted it.
                -->
                <span
                  class="badge permit-status permit-card__kinds"
                  [class.badge-gray]="kinds.length > 1"
                  [class.badge-blue]="kinds.length === 1 && kinds[0] === 'business'"
                  [class.badge-green]="kinds.length === 1 && kinds[0] === 'residential'"
                >{{ applicantKindsChip(kinds) }}</span>
              </div>
              <div class="permit-card__identity">
                <h4 class="permit-card__name">{{ type }}</h4>
                <p class="small muted permit-card__subtitle">{{ office(type) }} &middot; {{ documentCount(type) }} documents</p>
                @if (usualUseNote(type); as note) {
                  <p class="small permit-card__note">{{ note }}</p>
                }
              </div>

              <hr class="permit-card__divider" />

              <div class="card-footer permit-card__footer" style="display:flex; flex-direction:column; gap:8px;">
                <button class="btn btn-secondary btn-sm btn-block" (click)="openRequirements(type)">
                  View Requirements
                </button>
                <a class="btn btn-primary btn-sm btn-block" [routerLink]="['/permits/apply']" [queryParams]="startParams(type)">Start Application</a>
              </div>
            </div>
          }
        </div>
      }

      <!--
        Migration: this used to be an inline expand-in-place list per card.
        Now a single popup over a grayed-out backdrop, same for every "View
        Requirements" button on the page — see RequirementsModalComponent's
        own doc comment for why it always offers the New/Renewal/Amendment
        picker rather than only for Building Permit.
      -->
      @if (viewingRequirementsFor(); as type) {
        <app-requirements-modal [permitType]="type" (close)="closeRequirements()" />
      }
    </div>
  `,
  styles: [
    `
    .permit-group-heading { margin-top: 24px; }

    .bfp-notice { background: var(--info-100, #e8f1fb); border: none; }
    .bfp-notice h3 { margin: 0 0 6px; }
    .bfp-notice p { margin: 0; }
    .bfp-notice p + p { margin-top: 6px; }

    .permit-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 16px;
      align-items: stretch;
    }
    // The shared .card + .card { margin-top: 16px } rule (styles.scss) is
    // meant for cards stacked in normal block flow; its grid override
    // (.grid > .card + .card) only targets the shared .grid class, so
    // .permit-grid needs its own — otherwise every card but the first in a
    // row gets an extra 16px pushing it down within its cell, throwing the
    // row out of alignment even though each card's own height matches.
    .permit-grid > .card + .card {
      margin-top: 0;
    }

    .permit-card {
      position: relative;
      border: 1px solid #e4e8ed;
      border-radius: 9px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.02), 0 5px 14px rgba(15, 23, 42, 0.045);
    }

    .permit-card__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }

    .permit-card__icon {
      width: 44px;
      height: 44px;
      min-width: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
    }
    .permit-card__icon svg { width: 22px; height: 22px; }

    .permit-card__identity { min-width: 0; }
    .permit-card__name { margin: 0; }
    .permit-card__subtitle { margin: 5px 0 0; }
    .permit-card__note { margin: 8px 0 0; color: var(--gray-600); }

    .badge.permit-status {
      padding: 3px 11px;
      border-radius: 6px;
      min-height: 23px;
      flex-shrink: 0;
      white-space: nowrap;
    }

    .permit-card__divider {
      width: 100%;
      height: 1px;
      background: #e9ecf0;
      margin: 17px 0 16px;
      border: none;
    }

    .permit-card__footer { margin-top: auto; padding-top: 16px; }

    @media (max-width: 480px) {
      .permit-card__icon { width: 40px; height: 40px; min-width: 40px; }
    }
    `,
  ],
})
export class PermitCatalogPage {
  protected readonly permitVisual = permitVisual;
  protected readonly applicantKindsChip = applicantKindsChip;
  protected readonly usualUseNote = usualUseNote;
  private readonly router = inject(Router);
  /** Who may apply for each type; both for every type until (or unless) the server says otherwise. */
  protected readonly permitTypes = inject(PermitTypesStore);

  protected readonly groups = PERMIT_TYPE_GROUPS;
  protected readonly bfpFsisUrl = BFP_FSIS_URL;
  protected readonly catalog = REQUIREMENTS_CATALOG;
  protected readonly viewingRequirementsFor = signal<PermitType | null>(null);
  /**
   * The business the citizen came from, when they started at its own "Apply
   * for Permit": carried into the wizard so it opens with that business
   * already chosen (QA TC-30, 2026-10-03). It used to be dropped here.
   */
  private readonly fromBusiness = inject(ActivatedRoute).snapshot.queryParamMap.get('businessId');

  constructor() {
    this.permitTypes.load();
  }

  protected startParams(type: PermitType): Record<string, string> {
    return this.fromBusiness ? { type, businessId: this.fromBusiness } : { type };
  }

  openRequirements(type: PermitType): void {
    this.viewingRequirementsFor.set(type);
  }

  closeRequirements(): void {
    this.viewingRequirementsFor.set(null);
  }

  office(type: PermitType): string {
    return this.catalog[type].reviewingOffice;
  }

  documentCount(type: PermitType): number {
    return this.catalog[type].documents.length;
  }
}
