import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CitizenApiClient } from '../api/citizen-api.client';
import { EarlierPermit, RecordClaim, RecordClaimRequest } from '../api/citizen-api.models';
import { ApiError } from '../api/problem';
import { AuthService } from '../session/auth.service';

/**
 * The signed-in citizen's records before eBPCO (ebpco-api migration 069):
 * the permits an officer matched to the account (`GET /me/earlier-permits`)
 * and the citizen's own "this earlier permit is mine" requests
 * (`GET`/`POST /me/record-claims`).
 *
 * Kept apart from `ApplicationStore` on purpose: these are not filings, and
 * nothing here may reach the application counts or lists.
 *
 * Emptied the moment the account changes, so one citizen's records are never
 * shown to the next one signing in on the same browser, and fetched again for
 * the new account.
 */
@Injectable({ providedIn: 'root' })
export class EarlierRecordsStore {
  private readonly api = inject(CitizenApiClient);
  private readonly auth = inject(AuthService);

  /** `null`: not fetched (or no API configured) — distinct from `[]`, fetched and none. */
  private readonly realPermits = signal<EarlierPermit[] | null>(null);
  private readonly realClaims = signal<RecordClaim[] | null>(null);

  /** Only a change of account re-runs the effect below, not every profile reload. */
  private readonly accountId = computed(() => (this.auth.isAuthenticated() ? this.auth.currentUser()?.id ?? null : null));

  /** Newest first, as the server sends them. */
  readonly permits = computed(() => this.realPermits() ?? []);
  readonly claims = computed(() => this.realClaims() ?? []);

  constructor() {
    effect(() => {
      const accountId = this.accountId();
      untracked(() => {
        this.realPermits.set(null);
        this.realClaims.set(null);
        if (accountId !== null && this.api.configured) void this.refresh();
      });
    });
  }

  /**
   * Fetches both lists. A failure keeps what was there (a transient error
   * should not make a citizen's records vanish while they look at them), and
   * an answer that arrives after the account changed is dropped.
   */
  async refresh(): Promise<void> {
    if (!this.api.configured) return;
    const askedFor = this.accountId();
    const [permits, claims] = await Promise.allSettled([
      firstValueFrom(this.api.listEarlierPermits()),
      firstValueFrom(this.api.listRecordClaims()),
    ]);
    if (this.accountId() !== askedFor) return;
    if (permits.status === 'fulfilled') this.realPermits.set(permits.value.data ?? []);
    if (claims.status === 'fulfilled') this.realClaims.set(claims.value.data ?? []);
  }

  /**
   * A page that shows these asks again each time it opens, since an officer
   * may have matched more meanwhile. The first fetch is the account effect's,
   * so this only refetches what was already fetched once.
   */
  revisit(): void {
    if (this.realPermits() !== null || this.realClaims() !== null) void this.refresh();
  }

  /**
   * `POST /me/record-claims`. On success the new request heads "Your
   * requests"; on refusal (409 already waiting, 429 ten waiting, 400) the
   * server's own words come back to show.
   */
  async claim(request: RecordClaimRequest): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const { claim } = await firstValueFrom(this.api.claimEarlierPermit(request));
      this.realClaims.update((list) => [claim, ...(list ?? []).filter((c) => c.id !== claim.id)]);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: messageFor(error) };
    }
  }
}

/** A 400 names its problem in `errors[]` and has no `detail`; every other refusal says it in `detail`. */
function messageFor(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'We could not reach the Municipality’s system. Check your connection and try again.';
  }
  const fields = error.problem?.fieldErrors ?? [];
  if (!error.problem?.detail && fields.length > 0) return fields.map((f) => f.message).join(' ');
  return error.citizenMessage;
}
