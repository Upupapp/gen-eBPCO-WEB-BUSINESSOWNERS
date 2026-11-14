import { EffectRef, Injectable, effect, inject, signal, untracked } from '@angular/core';

/** The topics `GET /me/changes` reports, each with its own stamp (`LiveRefresh`). */
export const CITIZEN_TOPICS = ['applications', 'payments', 'notifications', 'account'] as const;
export type CitizenTopic = (typeof CITIZEN_TOPICS)[number];

/**
 * What changed, for the screens that hold data of their own (live updates,
 * 15 Nov 2026). `LiveRefresh` refreshes the shared stores itself and then
 * announces the topics here; a screen follows the ones it shows with
 * `onLiveChange`, and reads its own data again.
 *
 * Its own service, with nothing injected, so a page can follow the changes
 * without starting the checks (and a page's spec without a timer).
 */
@Injectable({ providedIn: 'root' })
export class LiveChanges {
  /** Per topic, how many announcements have covered it; only ever grows. */
  private readonly _covered = signal<Readonly<Record<CitizenTopic, number>>>(
    Object.fromEntries(CITIZEN_TOPICS.map((topic) => [topic, 0])) as Record<CitizenTopic, number>,
  );
  readonly covered = this._covered.asReadonly();

  /** These topics changed; null: anything may have (a safety refresh, the citizen back on the tab). */
  announce(topics: ReadonlySet<CitizenTopic> | null): void {
    this._covered.update((counts) => {
      const next = { ...counts };
      for (const topic of CITIZEN_TOPICS) if (topics === null || topics.has(topic)) next[topic] += 1;
      return next;
    });
  }
}

/**
 * Runs `reload` whenever one of `topics` changes, for as long as the calling
 * component lives (the effect belongs to its injection context and ends with
 * it). Call from a constructor or field initializer. Two announcements landing
 * before the effect runs still reload once.
 */
export function onLiveChange(topics: readonly CitizenTopic[], reload: () => void): EffectRef {
  const changes = inject(LiveChanges);
  const read = (): number => {
    const covered = changes.covered();
    return topics.reduce((sum, topic) => sum + covered[topic], 0);
  };
  let last = untracked(read);
  return effect(() => {
    const now = read();
    if (now === last) return;
    last = now;
    untracked(reload);
  });
}

/**
 * Whether the citizen is in the middle of something a redraw could disturb:
 * typing in a field, or a dialog or menu open. A change waits until they are
 * done (the same rule the Admin Portal's pulse keeps).
 */
export function citizenIsBusy(doc: Document = document): boolean {
  const active = doc.activeElement;
  if (active instanceof HTMLElement) {
    if (active.isContentEditable) return true;
    if (active.matches('textarea, select')) return true;
    if (active.matches('input') && !active.matches('[type=checkbox], [type=radio], [type=button], [type=submit], [type=reset]')) {
      return true;
    }
  }
  // Only one that is showing: a dialog kept in the page and hidden by CSS
  // would otherwise hold every update for good.
  const open = doc.querySelectorAll<HTMLElement>(
    'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"], [role="menu"]',
  );
  return [...open].some(isShown);
}

function isShown(element: HTMLElement): boolean {
  if (element.closest('[hidden]') !== null) return false;
  const check = (element as HTMLElement & { checkVisibility?: () => boolean }).checkVisibility;
  if (typeof check === 'function') return check.call(element);
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return style === undefined || (style.display !== 'none' && style.visibility !== 'hidden');
}
