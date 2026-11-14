import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Mock, vi } from 'vitest';

import {
  LIVE_EXPIRY_MARGIN_S, LIVE_REFRESH_INTERVAL_MS, LIVE_WAKE_GRACE_MS, LiveRefresh, changedTopics, toChangeStamp,
} from './live-refresh';
import { LiveChanges } from './live-changes';
import { API_BASE_URL } from '../api/api-config';
import { CitizenApiClient } from '../api/citizen-api.client';
import { citizenAuthInterceptor } from '../api/citizen-auth.interceptor';
import { CitizenTokenStore } from '../api/citizen-token-store';
import { AuthService } from '../session/auth.service';
import { ApplicationStore } from '../stores/application.store';
import { NotificationStore } from '../stores/notification.store';

/**
 * Live updates (15 Nov 2026: "update live, about every second"): the portal
 * asks `GET /me/changes` every second and refreshes only what moved -- never
 * signing anyone out over it, never from a hidden tab, and never under a
 * citizen who is typing or has a dialog open.
 */
describe('LiveRefresh — live updates', () => {
  const T0 = 1_000_000;
  let http: HttpTestingController;
  type Citizen = { id: string; verification: { status: string } | null } | null;
  let applications: { refreshMine: Mock };
  let notifications: { refreshMine: Mock };
  let auth: {
    isAuthenticated: WritableSignal<boolean>;
    currentUser: WritableSignal<Citizen>;
    reloadProfile: Mock;
    dropSession: Mock;
  };

  function setup(): LiveRefresh {
    applications = { refreshMine: vi.fn(() => Promise.resolve()) };
    notifications = { refreshMine: vi.fn(() => Promise.resolve()) };
    auth = {
      isAuthenticated: signal(true),
      currentUser: signal<Citizen>({ id: 'citizen-1', verification: { status: 'verified' } }),
      reloadProfile: vi.fn(() => Promise.resolve()),
      dropSession: vi.fn(),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([citizenAuthInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '' },
        { provide: AuthService, useValue: auth },
        { provide: ApplicationStore, useValue: applications },
        { provide: NotificationStore, useValue: notifications },
      ],
    });
    TestBed.inject(CitizenTokenStore).set({ accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 });
    http = TestBed.inject(HttpTestingController);
    showTab('visible');
    return TestBed.inject(LiveRefresh);
  }

  function showTab(state: DocumentVisibilityState): void {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  }

  /** One beat, its check answered with `body`, or refused with `status`. */
  async function beat(live: LiveRefresh, now: number, body: unknown, status = 200): Promise<void> {
    const done = live.beat(now);
    const check = http.expectOne('/me/changes');
    if (status === 200) check.flush(body);
    else check.flush({ title: 'Refused' }, { status, statusText: 'Refused' });
    await done;
  }

  afterEach(() => {
    http.verify();
    Reflect.deleteProperty(document, 'visibilityState');
    TestBed.inject(CitizenTokenStore).clear();
    (document.activeElement as HTMLElement | null)?.blur();
    document.body.innerHTML = '';
  });

  it('takes the first answer as the starting point, and refreshes only what moved', async () => {
    const live = setup();
    const changes = TestBed.inject(LiveChanges);

    await beat(live, T0, { v: '1', t: { applications: 'a1', notifications: 'n1', account: 'x1' } });
    await beat(live, T0 + 1_000, { v: '1', t: { applications: 'a1', notifications: 'n1', account: 'x1' } });
    expect(applications.refreshMine).not.toHaveBeenCalled();
    expect(notifications.refreshMine).not.toHaveBeenCalled();

    await beat(live, T0 + 2_000, { v: '2', t: { applications: 'a2', notifications: 'n1', account: 'x1' } });
    expect(applications.refreshMine).toHaveBeenCalledTimes(1);
    expect(notifications.refreshMine).not.toHaveBeenCalled();
    expect(auth.reloadProfile).not.toHaveBeenCalled();
    expect(changes.covered().applications).toBe(1);
    expect(changes.covered().notifications).toBe(0);

    await beat(live, T0 + 3_000, { v: '3', t: { applications: 'a2', notifications: 'n2', account: 'x2' } });
    expect(notifications.refreshMine).toHaveBeenCalledTimes(1);
    expect(auth.reloadProfile).toHaveBeenCalledTimes(1);
    expect(applications.refreshMine).toHaveBeenCalledTimes(1);
  });

  it('sends the token, and a 401 on the check leaves the citizen signed in, on the same page', async () => {
    const live = setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');

    const done = live.beat(T0);
    const check = http.expectOne('/me/changes');
    expect(check.request.headers.get('Authorization')).toBe('Bearer access');
    check.flush({ title: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    await done;

    expect(auth.dropSession).not.toHaveBeenCalled();
    expect(TestBed.inject(CitizenTokenStore).access()).toBe('access');
    expect(navigate).not.toHaveBeenCalled();
  });

  it("a 401 on the citizen's own request still ends the session, as before", async () => {
    setup();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    const call = firstValueFrom(TestBed.inject(CitizenApiClient).getMe());
    http.expectOne('/me').flush({ title: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    await expect(call).rejects.toBeTruthy();

    expect(auth.dropSession).toHaveBeenCalled();
    expect(TestBed.inject(CitizenTokenStore).access()).toBeNull();
  });

  it('sends nothing from a hidden tab, or while signed out', async () => {
    const live = setup();
    showTab('hidden');
    await live.beat(T0);
    http.expectNone('/me/changes');

    showTab('visible');
    auth.isAuthenticated.set(false);
    await live.beat(T0 + 1_000);
    http.expectNone('/me/changes');
  });

  it('holds a change while the citizen types or has a dialog open, and runs it when they are done', async () => {
    const live = setup();
    await beat(live, T0, { v: '1', t: { applications: 'a1' } });

    const field = document.createElement('textarea');
    document.body.appendChild(field);
    field.focus();
    await beat(live, T0 + 1_000, { v: '2', t: { applications: 'a2' } });
    expect(applications.refreshMine).not.toHaveBeenCalled();

    field.blur();
    document.body.innerHTML = '<div role="dialog" aria-modal="true">Withdraw this application?</div>';
    await beat(live, T0 + 2_000, { v: '2', t: { applications: 'a2' } });
    expect(applications.refreshMine).not.toHaveBeenCalled();

    document.body.innerHTML = '';
    await beat(live, T0 + 3_000, { v: '2', t: { applications: 'a2' } });
    expect(applications.refreshMine).toHaveBeenCalledTimes(1);
  });

  it('waits while the access token is about to expire, so its refresh goes first', async () => {
    const live = setup();
    TestBed.inject(CitizenTokenStore).set({ accessToken: 'access', expiresIn: LIVE_EXPIRY_MARGIN_S - 10 });
    await live.beat(T0);
    http.expectNone('/me/changes');

    TestBed.inject(CitizenTokenStore).set({ accessToken: 'renewed', expiresIn: 900 });
    await beat(live, T0 + 1_000, { v: '1', t: {} });
  });

  it('gives the token refresh a moment after the tab comes back, then refreshes everything', async () => {
    const live = setup();
    await beat(live, T0, { v: '1', t: {} });

    live.woke(T0 + 500);
    await live.beat(T0 + 1_000);
    http.expectNone('/me/changes');

    await beat(live, T0 + 500 + LIVE_WAKE_GRACE_MS, { v: '1', t: {} });
    expect(applications.refreshMine).toHaveBeenCalledTimes(1);
    expect(notifications.refreshMine).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(LiveChanges).covered().payments).toBe(1);
  });

  it('backs off while checks fail, and still refreshes everything once a minute', async () => {
    const live = setup();
    await beat(live, T0, null, 503);
    await beat(live, T0 + 1_000, null, 503);
    await live.beat(T0 + 2_000);
    http.expectNone('/me/changes');
    await beat(live, T0 + 3_000, null, 503);

    const failingBeat = async (now: number): Promise<void> => {
      const done = live.beat(now);
      for (const check of http.match('/me/changes')) check.flush({ title: 'Down' }, { status: 503, statusText: 'Down' });
      await done;
    };
    for (let s = 4; s < LIVE_REFRESH_INTERVAL_MS / 1_000; s++) await failingBeat(T0 + s * 1_000);
    expect(applications.refreshMine).not.toHaveBeenCalled();

    await failingBeat(T0 + LIVE_REFRESH_INTERVAL_MS);
    expect(applications.refreshMine).toHaveBeenCalledTimes(1);
    expect(notifications.refreshMine).toHaveBeenCalledTimes(1);
  });
});

describe('changedTopics', () => {
  it('names the topics whose stamps moved', () => {
    expect(changedTopics({ applications: 'a1', payments: 'p1' }, { v: '2', t: { applications: 'a1', payments: 'p2' } }))
      .toEqual(new Set(['payments']));
  });

  it('is everything for a topic this portal does not know, or a version that moved with no topic', () => {
    expect(changedTopics({}, { v: '2', t: { businesses: 'b1' } })).toBe('all');
    expect(changedTopics({ account: 'x' }, { v: '2', t: { account: 'x' } })).toBe('all');
  });
});

describe('toChangeStamp', () => {
  it('reads the version and the topics, as text, and nothing from a body without a version', () => {
    expect(toChangeStamp({ v: 3, t: { account: 9, odd: {} } })).toEqual({ v: '3', t: { account: '9' } });
    expect(toChangeStamp({ t: {} })).toBeNull();
    expect(toChangeStamp(null)).toBeNull();
  });
});
