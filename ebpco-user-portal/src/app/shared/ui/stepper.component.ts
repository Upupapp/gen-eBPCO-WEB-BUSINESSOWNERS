import { Component, input } from '@angular/core';

/**
 * One row of steps: the application wizard, sign-up, and an application's
 * progress (house style 2026-11-03). Done steps are green with a check, the
 * current one is brand red with a ring, upcoming ones are outlined; the look
 * is `.stepper` in styles.scss.
 *
 * Keeps the class names the step bar always had (`.step-item`, `.active`,
 * `.done`, `.dot`, with the number first): scripts/check-journeys.mjs reads
 * the wizard's current step from `.step-item.active`.
 */
@Component({
  selector: 'app-stepper',
  styles: `:host { display: block; }`,
  template: `
    <ol class="stepper" [attr.aria-label]="label()">
      @for (name of steps(); track $index) {
        <li
          class="step-item"
          [class.done]="$index < current()"
          [class.active]="$index === current()"
          [attr.aria-current]="$index === current() ? 'step' : null"
        >
          <span class="dot" aria-hidden="true">
            @if ($index < current()) {
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            } @else {
              {{ $index + 1 }}
            }
          </span>
          <span class="step-label">{{ name }}@if ($index < current()) {<span class="sr-only">, done</span>}</span>
        </li>
      }
    </ol>
  `,
})
export class StepperComponent {
  /** The step names, in order. */
  readonly steps = input.required<readonly string[]>();
  /** The current step's index, from 0; `steps.length` once every step is done. */
  readonly current = input.required<number>();
  /** What the steps are, for a screen reader. */
  readonly label = input('Progress');
}
