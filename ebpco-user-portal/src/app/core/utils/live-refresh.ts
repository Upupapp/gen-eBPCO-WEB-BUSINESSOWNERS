import { DOCUMENT, DestroyRef, Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';

import { CitizenApiClient } from '../api/citizen-api.client';
import { CitizenTokenStore } from '../api/citizen-token-store';
import { AuthService } from '../session/auth.service';
import { ApplicationStore } from '../stores/application.store';
import { NotificationStore } from '../stores/notification.store';
import { CITIZEN_TOPICS, CitizenTopic, LiveChanges, citizenIsBusy } from './live-changes';

/** A full refresh at least this often while the portal is in view, whatever the change check says. */
export const LIVE_REFRESH_INTERVAL_MS = 60_000;
/** Opening pages in quick succession refetches once, not once per click. */
export const LIVE_REFRESH_MIN_GAP_MS = 5_000;
/** How often an open portal asks whether anything changed (`GET /me/changes`). */
export const LIVE_CHECK_MS = 1_000;
/** After the tab comes back or the computer wakes: time for the token refresh to land first. */
export const LIVE_WAKE_GRACE_MS = 2_000;
/** Failing checks back off from every second up to this. */
export const LIVE_MAX_BACKOFF_MS = 30_000;
/** No check and no change refresh with less token life than this, in seconds: its refresh is due. */
export const LIVE_EXPIRY_MARGIN_S = 30;

/** What `GET /me/changes` answered: a version, and a stamp per topic. */
export interface ChangeStamp {
  readonly v: string;
  readonly t: Readonly<Record<string, string>>;
}

/** Changes seen and not yet refreshed: some topics, or everything. */
export type Pending = ReadonlySet<CitizenTopic> | 'all';

/**
 * Keeps a signed-in citizen's applications and notifications current while
 * the portal stays open (QA finding TC-20, 2026-10-03), now live (15 Nov 2026:
 * "update live, about every second").
 *
 * The stores fetched once, at sign-in. A citizen who kept the portal open
 * while the office worked saw "Submitted" and "You're all caught up" until
 * they reloaded the browser, and so missed that their application had been
 * returned for revision.
 *
 * Every second while the tab is in view, the portal asks `GET /me/changes`
 * whether anything changed: one small request answering a version and a
 * stamp per topic. An equal version costs nothing more. A new one refreshes
 * what moved -- the application list for applications and payments, the
 * notifications for notifications, the account (`/me`) for account -- and
 * announces the topics (`LiveChanges`) to the screens holding data of their
 * own, such as an open application's timeline and documents. While the
 * citizen is typing or has a dialog open the change waits, and runs the
 * moment they are done.
 *
 * The check never signs anyone out: it is sent with `KEEP_SESSION_ON_401`,
 * and any failure (a 401, a network error, a 5xx, an API without the route) is
 * ignored and tried again, backing off to every 30 s while failures last.
 * Nothing is sent while the access token is about to expire, so the session's
 * own refresh (`AuthService.scheduleRefresh`) goes first, nor for a moment
 * after the tab comes back or the computer wakes.
 *
 * As before, every page opened refetches both stores. A full refresh also
 * runs at least once a minute while the tab is in view, and a moment after
 * the citizen comes back to it. A hidden tab sends nothing.
 */
@Injectable({ providedIn: 'root' })
export class LiveRefresh {
  private readonly auth = inject(AuthService);
  private readonly api = inject(CitizenApiClient);
  private readonly tokens = inject(CitizenTokenStore);
  private readonly applications = inject(ApplicationStore);
  private readonly notifications = inject(NotificationStore);
  private readonly changes = inject(LiveChanges);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);

  private lastRefreshAt = 0;
  /** The last version seen, and its topics' stamps; null until the first answer, which only sets them. */
  private version: string | null = null;
  private stamps: Readonly<Record<string, string>> = {};
  /** Whose version that is: another citizen signing in on this browser starts again. */
  private account: string | null | undefined = undefined;
  private pending: Pending | null = null;
  private beating = false;
  private failures = 0;
  private nextCheckAt = 0;
  private quietUntil = 0;
  private lastBeatAt: number | null = null;
  private started = false;

  /** Starts following: every page opened, the one-second check, the citizen coming back to the tab. */
  start(): void {
    if (this.started) return;
    this.started = true;
    const navigations = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.refresh());
    this.destroyRef.onDestroy(() => navigations.unsubscribe());

    const view = this.document.defaultView;
    if (view === null) return;
    const timer = view.setInterval(() => void this.beat(), LIVE_CHECK_MS);
    const onVisibility = (): void => {
      if (this.visible()) this.woke();
    };
    this.document.addEventListener('visibilitychange', onVisibility);
    this.destroyRef.onDestroy(() => {
      view.clearInterval(timer);
      this.document.removeEventListener('visibilitychange', onVisibility);
    });
  }

  /** Refetches both stores (and an unverified account), unless signed out, unconfigured, or done moments ago. */
  refresh(now: number = Date.now()): void {
    if (!this.auth.isAuthenticated() || !this.api.configured) return;
    if (now - this.lastRefreshAt < LIVE_REFRESH_MIN_GAP_MS) return;
    this.lastRefreshAt = now;
    void this.applications.refreshMine();
    void this.notifications.refreshMine();
    // While the Municipality has not verified the account yet (migration
    // 067), the account is re-read too, so the verification banners and the
    // wizard's Submit change the moment an officer decides — not at the next
    // reload. A verified account has nothing left to wait for.
    if (this.awaitingVerification()) void this.auth.reloadProfile().catch(() => undefined);
  }

  /** The tab came back, or the computer woke: a full refresh once the grace has passed. */
  woke(now: number = Date.now()): void {
    this.quietUntil = now + LIVE_WAKE_GRACE_MS;
    this.hold('all');
  }

  /** One beat: check for changes, then refresh what changed, when nothing stands in the way. */
  async beat(now: number = Date.now()): Promise<void> {
    // Beats far apart: the computer slept, or the browser held the timer of a
    // hidden tab. Either way the token may be stale for a moment.
    if (this.lastBeatAt !== null && now - this.lastBeatAt > LIVE_CHECK_MS * 5) this.woke(now);
    this.lastBeatAt = now;
    // The last check or refresh is still on its way (a slow network): no second one beside it.
    if (this.beating) return;

    if (!this.visible() || !this.signedIn()) return;
    // The stores load themselves at sign-in: that counts as the last refresh.
    if (this.lastRefreshAt === 0) this.lastRefreshAt = now;
    const account = this.auth.currentUser()?.id ?? null;
    if (account !== this.account) {
      this.version = null;
      this.stamps = {};
      this.account = account;
    }
    if (now < this.quietUntil || !this.tokenFresh()) return;

    this.beating = true;
    try {
      if (now >= this.nextCheckAt) await this.check(now);
      if (now - this.lastRefreshAt >= LIVE_REFRESH_INTERVAL_MS) this.hold('all');
      const pending = this.pending;
      if (pending !== null && !citizenIsBusy(this.document)) {
        this.pending = null;
        await this.apply(pending, now);
      }
    } finally {
      this.beating = false;
    }
  }

  private async check(now: number): Promise<void> {
    let stamp: ChangeStamp | null;
    try {
      stamp = toChangeStamp(await firstValueFrom(this.api.getChanges()));
    } catch {
      stamp = null;
    }
    if (stamp === null) {
      this.failures += 1;
      // Every beat at first, then 2 s, 4 s ... (half a beat early, so timer jitter never skips one).
      const wait = Math.min(LIVE_MAX_BACKOFF_MS, LIVE_CHECK_MS * 2 ** Math.min(this.failures - 1, 10));
      this.nextCheckAt = now + wait - LIVE_CHECK_MS / 2;
      return;
    }
    this.failures = 0;
    this.nextCheckAt = 0;
    if (this.version !== null && stamp.v !== this.version) this.hold(changedTopics(this.stamps, stamp));
    this.version = stamp.v;
    this.stamps = stamp.t;
  }

  /** Refreshes what the topics cover, and tells the screens following them. */
  private async apply(topics: Pending, now: number): Promise<void> {
    this.lastRefreshAt = now;
    const covers = (...names: CitizenTopic[]): boolean => topics === 'all' || names.some((name) => topics.has(name));
    const work: Promise<unknown>[] = [];
    if (covers('applications', 'payments')) work.push(this.applications.refreshMine());
    if (covers('notifications')) work.push(this.notifications.refreshMine());
    // The account when it changed; on a full refresh, only while it waits for verification (as `refresh`).
    if (topics === 'all' ? this.awaitingVerification() : topics.has('account')) {
      work.push(this.auth.reloadProfile().catch(() => undefined));
    }
    this.changes.announce(topics === 'all' ? null : topics);
    await Promise.all(work);
  }

  private hold(topics: Pending): void {
    if (topics === 'all' || this.pending === 'all') {
      this.pending = 'all';
      return;
    }
    this.pending = new Set([...(this.pending ?? []), ...topics]);
  }

  private awaitingVerification(): boolean {
    const status = this.auth.currentUser()?.verification?.status;
    return status !== undefined && status !== 'verified';
  }

  private visible(): boolean {
    return this.document.visibilityState === 'visible';
  }

  private signedIn(): boolean {
    return this.auth.isAuthenticated() && this.api.configured && this.tokens.access() !== null;
  }

  private tokenFresh(): boolean {
    const left = this.tokens.expiresInSeconds();
    return left === null || left > LIVE_EXPIRY_MARGIN_S;
  }
}

/** The stamp in a body, or null when the body is not one. A topic whose stamp is not text or a number is left out. */
export function toChangeStamp(body: unknown): ChangeStamp | null {
  if (typeof body !== 'object' || body === null) return null;
  const { v, t } = body as { v?: unknown; t?: unknown };
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const topics: Record<string, string> = {};
  if (typeof t === 'object' && t !== null) {
    for (const [topic, stamp] of Object.entries(t)) {
      if (typeof stamp === 'string' || typeof stamp === 'number') topics[topic] = String(stamp);
    }
  }
  return { v: String(v), t: topics };
}

/**
 * The topics whose stamps differ between two answers. Everything when one of
 * them is a topic this portal does not know yet, or when the version moved
 * without any topic saying why: a full refresh is the safe reading of both.
 */
export function changedTopics(before: Readonly<Record<string, string>>, after: ChangeStamp): Pending {
  const known = new Set<string>(CITIZEN_TOPICS);
  const changed = new Set<CitizenTopic>();
  for (const topic of new Set([...Object.keys(before), ...Object.keys(after.t)])) {
    if (before[topic] === after.t[topic]) continue;
    if (!known.has(topic)) return 'all';
    changed.add(topic as CitizenTopic);
  }
  return changed.size === 0 ? 'all' : changed;
}
