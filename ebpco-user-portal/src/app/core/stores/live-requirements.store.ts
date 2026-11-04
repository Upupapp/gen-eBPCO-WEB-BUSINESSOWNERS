import { Injectable, inject, signal } from '@angular/core';
import { CitizenApiClient } from '../api/citizen-api.client';
import { ApplicationAction, PermitType } from '../domain/permit.model';
import { RequirementDocument, documentsFor, requirementFromApi } from '../domain/requirements-catalog';
import { PermitTypesStore } from './permit-types.store';

/** How many documents a permit type asks for, by kind. */
export interface RequirementCounts {
  readonly required: number;
  readonly ifApplicable: number;
}

/**
 * The live checklist each permit type asks for, per action, before any
 * application exists (`GET /requirements/{permitType}`), shared by the Permit
 * Services cards and the Requirements window so the two count the same list
 * (design review I13: the card said "22 documents" from the static catalog
 * while the window showed the live one). Asked as a business would apply when
 * the type is open to businesses, so the business-only rows come back too and
 * the window can show them under their own heading. The static catalog stands
 * in until (or unless) the live list answers.
 */
@Injectable({ providedIn: 'root' })
export class LiveRequirementsStore {
  private readonly api = inject(CitizenApiClient);
  private readonly permitTypes = inject(PermitTypesStore);

  private readonly live = signal<Readonly<Record<string, readonly RequirementDocument[]>>>({});
  private readonly loading = signal<ReadonlySet<string>>(new Set());
  private readonly requested = new Set<string>();

  private key(type: PermitType, action: ApplicationAction): string {
    return `${type}::${action}`;
  }

  /** Asks once per type and action. A failure is not remembered as an answer. */
  ensure(type: PermitType, action: ApplicationAction): void {
    const key = this.key(type, action);
    if (this.requested.has(key)) return;
    this.requested.add(key);
    this.loading.update((set) => new Set(set).add(key));
    const kinds = this.permitTypes.kindsFor(type);
    const applyingAs = kinds.includes('business') ? 'business' : 'residential';
    const done = () => this.loading.update((set) => {
      const next = new Set(set);
      next.delete(key);
      return next;
    });
    this.api.getRequirementsForPermitType(type, action, applyingAs).subscribe({
      next: (result) => {
        const docs = Array.isArray(result?.documents) ? result.documents.map(requirementFromApi) : [];
        if (docs.length > 0) this.live.update((m) => ({ ...m, [key]: docs }));
        done();
      },
      error: () => {
        this.requested.delete(key);
        done();
      },
    });
  }

  /** True while the live list for this type and action is being asked for. A signal read. */
  isLoading(type: PermitType, action: ApplicationAction): boolean {
    return this.loading().has(this.key(type, action));
  }

  /** The live list once it has answered, else the static catalog's. A signal read, so templates follow it. */
  documents(type: PermitType, action: ApplicationAction): readonly RequirementDocument[] {
    return this.live()[this.key(type, action)] ?? documentsFor(type, action);
  }

  /** "n required · n if applicable", from the same list the window shows. */
  counts(type: PermitType, action: ApplicationAction): RequirementCounts {
    const docs = this.documents(type, action);
    const required = docs.filter((d) => d.required).length;
    return { required, ifApplicable: docs.length - required };
  }
}
