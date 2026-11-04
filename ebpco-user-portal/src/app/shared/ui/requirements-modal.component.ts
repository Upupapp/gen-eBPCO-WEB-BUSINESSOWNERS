import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
  AfterViewInit, Component, ElementRef, OnDestroy, OnInit, computed, inject, input, output, signal, viewChild,
} from '@angular/core';
import { ApplicationAction, PermitType } from '../../core/domain/permit.model';
import { ONLINE_ONLY_NOTE, RequirementDocument, hardCopiesText, requirementsFor } from '../../core/domain/requirements-catalog';
import { LiveRequirementsStore } from '../../core/stores/live-requirements.store';

const ACTIONS: readonly ApplicationAction[] = ['New', 'Renewal', 'Amendment'];

/** One section of the window: Required, or If applicable, each with the business-only rows apart. */
interface RequirementGroup {
  readonly key: 'required' | 'if-applicable';
  readonly title: string;
  readonly everyone: readonly RequirementDocument[];
  readonly businessOnly: readonly RequirementDocument[];
}

/**
 * "Requirements" for one permit type, as a dialog over a greyed-out page.
 * Every "Requirements" button in the portal opens this.
 *
 * Documents vary by application type since backend migration 047, so it
 * always offers New / Renewal / Amendment; a type that never distinguished by
 * action shows the same list on each tab.
 *
 * Design review I13 (4 Nov 2026): the documents in two sections, Required
 * then If applicable, with live counts; the name over its description; one
 * line under the tabs for "online only" instead of the same line on 21 rows,
 * and a "Hard copies: n" chip only on a document that needs paper, with the
 * LGU's note under it word for word. The header and tabs stay put while the
 * list scrolls, and the footer starts an application. A dialog a keyboard can
 * use: Escape closes it, focus starts on Close, stays inside, and goes back to
 * the button that opened it; the tabs are wired to their panel and move with
 * the arrow keys. This replaces CONTRACT2 §3's per-row "Online only" line
 * (tell the owner; the app and the website still print it).
 *
 * The live checklist (`GET /requirements/{permitType}`, via
 * LiveRequirementsStore, which the Permit Services cards count from too),
 * with the static `requirements-catalog.ts` standing in until it answers.
 */
@Component({
  selector: 'app-requirements-modal',
  template: `
    <div class="req-modal-backdrop" (click)="close.emit()">
      <div
        #panel
        class="req-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="req-modal-title"
        (click)="$event.stopPropagation()"
        (keydown)="onKeydown($event)"
      >
        <div class="req-modal-head">
          <div class="req-modal-head-text">
            <h2 id="req-modal-title">{{ permitType() }}</h2>
            <p class="req-modal-office">{{ entry().reviewingOffice }}</p>
          </div>
          <button #closeButton type="button" class="req-modal-close" (click)="close.emit()" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="18" height="18">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <div class="req-modal-tabs seg-tabs" role="tablist" aria-label="Application type">
          @for (a of actions; track a; let i = $index) {
            <button
              type="button"
              role="tab"
              class="seg-tab"
              [id]="'req-tab-' + a"
              aria-controls="req-panel"
              [attr.aria-selected]="action() === a"
              [attr.tabindex]="action() === a ? 0 : -1"
              (click)="action.set(a)"
              (keydown)="onTabKeydown($event, i)"
            >
              {{ a }}
            </button>
          }
        </div>
        <p class="req-modal-note">{{ onlineOnlyNote }}</p>

        <div class="req-modal-body" id="req-panel" role="tabpanel" [attr.aria-labelledby]="'req-tab-' + action()" tabindex="0">
          @if (loading()) {
            <p class="small muted req-modal-loading">Checking for the LGU's published checklist…</p>
          }
          @for (group of groups(); track group.key) {
            @if (group.everyone.length + group.businessOnly.length > 0) {
              <section class="req-modal-group">
                <h3 class="req-modal-group-title">{{ group.title }} ({{ group.everyone.length + group.businessOnly.length }})</h3>
                <ul class="req-modal-list">
                  @for (d of group.everyone; track d.id) {
                    <ng-container *ngTemplateOutlet="row; context: { $implicit: d }" />
                  }
                </ul>
                @if (group.businessOnly.length > 0) {
                  <h4 class="req-modal-subtitle">Business applications only</h4>
                  <ul class="req-modal-list">
                    @for (d of group.businessOnly; track d.id) {
                      <ng-container *ngTemplateOutlet="row; context: { $implicit: d }" />
                    }
                  </ul>
                }
              </section>
            }
          }
          <ng-template #row let-d>
            <li class="req-modal-item">
              <div class="req-modal-name">{{ d.label }}</div>
              @if (d.description) { <div class="req-modal-desc">{{ d.description }}</div> }
              @if (hardCopiesText(d.hardCopies); as copies) {
                <div class="req-modal-copies">
                  <span class="badge badge-amber">{{ copies }}</span>
                  @if (d.hardCopyNote) { <div class="req-modal-desc">{{ d.hardCopyNote }}</div> }
                </div>
              }
            </li>
          </ng-template>
        </div>

        <div class="req-modal-foot">
          <button type="button" class="btn btn-secondary" (click)="close.emit()">Close</button>
          <button type="button" class="btn btn-primary" (click)="start.emit(action())">Start Application</button>
        </div>
      </div>
    </div>
  `,
  imports: [NgTemplateOutlet],
  styles: [`
    .req-modal-backdrop {
      position: fixed; inset: 0; background: rgba(16, 24, 40, .6);
      display: flex; align-items: center; justify-content: center;
      padding: 16px; z-index: 200;
      animation: req-modal-fade 0.18s ease both;
    }
    /* Head, tabs and foot stay put; only the list scrolls (it scrolled the title and tabs away). */
    .req-modal-panel {
      display: flex; flex-direction: column;
      background: var(--white, #fff); border-radius: 16px;
      width: 100%; max-width: 600px; max-height: 85vh; overflow: hidden;
      box-shadow: 0 24px 60px -12px rgba(16, 24, 40, .35), 0 0 0 1px rgba(16, 24, 40, .04);
      animation: req-modal-pop 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }
    .req-modal-head {
      display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
      padding: 20px 24px 16px; border-bottom: 1px solid var(--border-light, #eeeef2);
    }
    .req-modal-head-text { min-width: 0; }
    .req-modal-head h2 { margin: 0; font-size: 18px; font-weight: 700; color: var(--gray-900); }
    .req-modal-office { margin: 4px 0 0; font-size: 13px; color: var(--gray-500); }
    .req-modal-close {
      display: flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; flex-shrink: 0;
      border: none; border-radius: 8px; background: transparent;
      color: var(--gray-500); cursor: pointer;
      transition: background-color .15s ease, color .15s ease;
    }
    .req-modal-close:hover { background: var(--gray-100); color: var(--gray-900); }
    .req-modal-close:focus-visible { outline: none; box-shadow: var(--focus-ring); }

    .req-modal-tabs { margin: 16px 24px 0; }
    .req-modal-note { margin: 10px 24px 0; font-size: 13px; color: var(--gray-700); }

    .req-modal-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 4px 24px 20px; }
    .req-modal-body:focus-visible { outline: none; box-shadow: inset var(--focus-ring); }
    .req-modal-loading { margin: 14px 0 0; }
    .req-modal-group { margin-top: 18px; }
    .req-modal-group-title {
      margin: 0 0 4px; font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--gray-500);
    }
    .req-modal-subtitle { margin: 14px 0 0; font-size: 13px; font-weight: 600; color: var(--gray-700); }
    .req-modal-list { list-style: none; margin: 0; padding: 0; }
    .req-modal-item { padding: 10px 0; border-top: 1px solid var(--border-light, #eeeef2); }
    .req-modal-list > .req-modal-item:first-child { border-top: none; }
    .req-modal-name { font-size: 14px; font-weight: 600; line-height: 20px; color: var(--gray-900); }
    .req-modal-desc { margin-top: 2px; font-size: 13px; line-height: 1.45; color: var(--gray-500); }
    .req-modal-copies { margin-top: 6px; }

    .req-modal-foot {
      display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap;
      padding: 14px 24px; border-top: 1px solid var(--border-light, #eeeef2);
    }
    @media (max-width: 480px) {
      .req-modal-head, .req-modal-body, .req-modal-foot { padding-left: 16px; padding-right: 16px; }
      .req-modal-tabs, .req-modal-note { margin-left: 16px; margin-right: 16px; }
      .req-modal-foot .btn { flex: 1 1 auto; }
    }

    @keyframes req-modal-fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes req-modal-pop { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: scale(1); } }
    @media (prefers-reduced-motion: reduce) {
      .req-modal-backdrop, .req-modal-panel { animation: none; }
    }
  `],
})
export class RequirementsModalComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly permitType = input.required<PermitType>();
  readonly close = output<void>();
  /** "Start Application", with the tab the citizen was reading. */
  readonly start = output<ApplicationAction>();

  protected readonly actions = ACTIONS;
  protected readonly onlineOnlyNote = ONLINE_ONLY_NOTE;
  protected readonly hardCopiesText = hardCopiesText;
  protected readonly action = signal<ApplicationAction>('New');

  private readonly requirements = inject(LiveRequirementsStore);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly domDocument = inject(DOCUMENT);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly closeButton = viewChild.required<ElementRef<HTMLButtonElement>>('closeButton');
  /** The button that opened the window, to give focus back to on close. */
  private opener: HTMLElement | null = null;

  /**
   * The static entry's fixed metadata (the office). `computed()`, not a field
   * initializer: a required `input()` has no value yet while the class's own
   * fields are being initialized (NG8118).
   */
  protected readonly entry = computed(() => requirementsFor(this.permitType()));

  protected readonly documents = computed<readonly RequirementDocument[]>(() =>
    this.requirements.documents(this.permitType(), this.action()));

  protected readonly loading = computed(() => this.requirements.isLoading(this.permitType(), this.action()));

  /** Required first, then If applicable; in each, the rows for everyone, then the business's own. */
  protected readonly groups = computed<readonly RequirementGroup[]>(() => {
    const docs = this.documents();
    const group = (key: RequirementGroup['key'], title: string, required: boolean): RequirementGroup => {
      const rows = docs.filter((d) => d.required === required);
      return {
        key, title,
        everyone: rows.filter((d) => d.applicantKind !== 'business'),
        businessOnly: rows.filter((d) => d.applicantKind === 'business'),
      };
    };
    return [group('required', 'Required', true), group('if-applicable', 'If applicable', false)];
  });

  /**
   * Not the constructor: a required `input()` throws NG0950 if read before
   * Angular has bound it.
   */
  ngOnInit(): void {
    const active = this.domDocument.activeElement;
    this.opener = active instanceof HTMLElement && active !== this.domDocument.body ? active : null;
    for (const a of ACTIONS) this.requirements.ensure(this.permitType(), a);
  }

  /** Re-parented to <body> for the same reason LegalModalComponent is (the position:fixed containing-block bug), then focus starts on Close. */
  ngAfterViewInit(): void {
    this.domDocument.body.appendChild(this.elementRef.nativeElement);
    this.closeButton().nativeElement.focus();
  }

  ngOnDestroy(): void {
    this.elementRef.nativeElement.remove();
    if (this.opener?.isConnected) this.opener.focus();
  }

  /** Escape closes; Tab and Shift+Tab stay inside the window. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close.emit();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      this.panel().nativeElement.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const current = this.domDocument.activeElement;
    if (event.shiftKey && current === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && current === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /** Arrow keys, Home and End move between the tabs and choose (the WAI-ARIA tabs pattern). */
  protected onTabKeydown(event: KeyboardEvent, index: number): void {
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = (index + 1) % ACTIONS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + ACTIONS.length) % ACTIONS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = ACTIONS.length - 1;
    if (next === null) return;
    event.preventDefault();
    this.action.set(ACTIONS[next]);
    this.domDocument.getElementById(`req-tab-${ACTIONS[next]}`)?.focus();
  }
}
