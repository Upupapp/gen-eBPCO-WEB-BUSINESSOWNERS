import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BFP_FSIS_URL, PERMIT_TYPE_GROUPS, PermitType } from '../../core/domain/permit.model';
import { REQUIREMENTS_CATALOG } from '../../core/domain/requirements-catalog';
import { permitVisual } from '../../core/domain/permit-visual';
import { applicantKindsChip, usualUseNote } from '../../core/domain/applicant-kinds';
import type { ApplyingAs } from '../../core/domain/application.model';
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
      <!-- One line, with the rest a click away: it used to be a tinted card of two paragraphs. -->
      <div class="callout callout-info bfp-notice">
        <p>
          <strong>Fire Safety clearances (FSEC, FSIC) come from the BFP, not the Municipality.</strong>
          Apply on <a [href]="bfpFsisUrl" target="_blank" rel="noopener noreferrer">BFP-FSIS (fsis.e-bfp.com)</a>
          or at the Castilla Fire Station.
        </p>
        <details class="bfp-notice__more">
          <summary>What to upload here</summary>
          <p>
            The <strong>Fire Safety Evaluation Clearance (FSEC)</strong> for a building permit and the
            <strong>Fire Safety Inspection Certificate (FSIC)</strong> for occupancy are issued by the Bureau of Fire
            Protection. Upload the FSEC with your Building Permit application here; a Certificate of Occupancy
            application asks for the Fire Safety Compliance and Commissioning Report (FSCCR) instead. Our Fire
            Safety officer checks both.
          </p>
          <p>Permits with nothing for the BFP to check, like a Fencing or Sign Permit, skip the Fire Safety stage.</p>
        </details>
      </div>

      @for (group of groups; track group.label) {
        <h3 class="permit-group-heading">{{ group.label }}</h3>
        <div class="permit-grid">
          @for (type of group.types; track type) {
            @let visual = permitVisual(type);
            @let kinds = permitTypes.kindsFor(type);
            <div class="card card-fill permit-card">
              <div class="permit-card__body">
                <div class="permit-card__header">
                  <div class="permit-card__icon" [style.background]="visual.bg" [style.color]="visual.fg">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      @for (d of visual.icon; track d) { <path [attr.d]="d" /> }
                    </svg>
                  </div>
                  <div class="permit-card__identity">
                    <h4 class="permit-card__name">{{ type }}</h4>
                    <p class="small muted permit-card__subtitle">{{ office(type) }}</p>
                  </div>
                </div>
                <!--
                  Who may apply (migration 068): every type is open to homes and
                  businesses unless the Municipality restricted it, so the chip
                  shows only on a restricted type ("Homes & businesses" on all
                  sixteen cards said nothing). Facts, not statuses: neutral chips.
                -->
                <div class="permit-card__tags">
                  @if (restricted(kinds)) {
                    <span class="tag permit-card__kinds">{{ applicantKindsChip(kinds) }}</span>
                  }
                  <span class="tag">{{ documentCount(type) }} documents</span>
                </div>
                @if (usualUseNote(type, kinds); as note) {
                  <p class="small permit-card__note">{{ note }}</p>
                }
              </div>

              <!-- One primary per card (Start), Requirements a small secondary with an icon, both at the card's edges. -->
              <div class="permit-card__footer">
                <button type="button" class="btn btn-secondary btn-sm" [attr.aria-label]="'Requirements for ' + type" (click)="openRequirements(type)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></svg>
                  Requirements
                </button>
                <a class="btn btn-primary btn-sm" [attr.aria-label]="'Start Application for ' + type" [routerLink]="['/permits/apply']" [queryParams]="startParams(type)">Start application</a>
              </div>
            </div>
          }
        </div>
      }

      <!--
        Migration: this used to be an inline expand-in-place list per card.
        Now a single popup over a grayed-out backdrop, same for every
        "Requirements" button on the page — see RequirementsModalComponent's
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
    .permit-group-heading { margin: 28px 0 12px; }

    .bfp-notice { margin-bottom: 8px; }
    .bfp-notice__more summary { cursor: pointer; width: fit-content; color: var(--gray-700); font-weight: 600; }
    .bfp-notice__more p { margin: 6px 0 0; }

    .permit-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
      align-items: stretch;
    }
    // The shared .card + .card { margin-top: 16px } rule (styles.scss) is
    // for cards stacked in block flow; in this grid the gap spaces them.
    .permit-grid > .card + .card {
      margin-top: 0;
    }

    .permit-card__header {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .permit-card__icon {
      width: 40px;
      height: 40px;
      min-width: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
    }
    .permit-card__icon svg { width: 22px; height: 22px; }

    .permit-card__identity { min-width: 0; }
    .permit-card__name { margin: 0; }
    .permit-card__subtitle { margin: 2px 0 0; }
    .permit-card__tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
    .permit-card__note { margin: 10px 0 0; color: var(--gray-600); }

    // The body grows, so the divider and the buttons sit at the same height on
    // every card in a row, whatever each card holds (card-fill).
    .permit-card__body { flex: 1 0 auto; padding-bottom: 16px; }
    .permit-card__footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding-top: 14px;
      border-top: 1px solid var(--border-light);
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

  /** Only a type the Municipality opened to homes OR businesses, not both, says who may apply. */
  protected restricted(kinds: readonly ApplyingAs[]): boolean {
    return !(kinds.includes('residential') && kinds.includes('business'));
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
