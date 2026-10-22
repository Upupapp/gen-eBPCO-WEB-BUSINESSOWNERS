import { Injectable, inject, signal } from '@angular/core';
import { CitizenApiClient } from '../api/citizen-api.client';
import { ApplyingAs } from '../domain/application.model';
import { BOTH_APPLICANT_KINDS, applicantKindsFrom } from '../domain/applicant-kinds';
import { PermitType } from '../domain/permit.model';

/**
 * Who may apply for each permit type (migration 068), from `GET /permit-types`.
 *
 * The static fallback is every type open to both, and it is what stands until
 * the server answers, when it cannot (an older server, no API configured, a
 * failed call), and for any type it leaves out: the server refuses a filing
 * the Municipality does not accept regardless, so guessing a restriction here
 * could only shut a citizen out wrongly.
 *
 * Also told by the wizard's own checklist fetch (`GET /requirements/...`
 * carries `applicantKinds` too), so the two never disagree within a session.
 */
@Injectable({ providedIn: 'root' })
export class PermitTypesStore {
  private readonly api = inject(CitizenApiClient);

  /** Only the types the server has named; `kindsFor` answers both for the rest. */
  private readonly kinds = signal<Readonly<Record<string, readonly ApplyingAs[]>>>({});
  private requested = false;

  /**
   * Asks the server once per session. A failure is not remembered as an
   * answer, so the next page that asks tries again; the fallback stands
   * meanwhile.
   */
  load(): void {
    if (this.requested || !this.api.configured) return;
    this.requested = true;
    this.api.getPermitTypes().subscribe({
      next: (result) => {
        const items = Array.isArray(result?.items) ? result.items : [];
        const next: Record<string, readonly ApplyingAs[]> = { ...this.kinds() };
        for (const item of items) next[item.permitType] = applicantKindsFrom(item.applicantKinds);
        this.kinds.set(next);
      },
      error: () => { this.requested = false; },
    });
  }

  /** Who may apply for `type`: both unless the server said otherwise. A signal read, so templates follow it. */
  kindsFor(type: PermitType): readonly ApplyingAs[] {
    return this.kinds()[type] ?? BOTH_APPLICANT_KINDS;
  }

  /** What another answer (the requirements checklist) said about one type. */
  remember(type: PermitType, kinds: readonly ApplyingAs[]): void {
    this.kinds.update((current) => ({ ...current, [type]: kinds }));
  }
}
