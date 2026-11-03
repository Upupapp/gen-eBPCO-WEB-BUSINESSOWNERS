import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/session/auth.service';
import { rejectedHeadline } from '../../core/domain/account-verification';

/**
 * Account verification (migration 067), where it decides what a citizen can
 * do next: the dashboard, Permit Services and the application wizard. Says
 * nothing for a verified account, or when the server sent no verification
 * state at all (a server from before migration 067) — the server's own
 * refusal at Submit stays the backstop either way.
 */
@Component({
  selector: 'app-verification-banner',
  imports: [RouterLink],
  // A callout (styles.scss): amber while the citizen has something to do,
  // indigo while the Municipality checks the ID, red when it was not accepted.
  // The way to the ID upload is a secondary button on the right, so the page's
  // own primary action stays the only one.
  template: `
    @if (verification(); as v) {
      @switch (v.status) {
        @case ('unsubmitted') {
          <div class="callout callout-warning verify-banner" role="status">
            <strong class="callout-title">Verify your account to submit applications.</strong>
            <p>Send a photo of a valid government ID. You can prepare applications while the Municipality checks it.</p>
            <a routerLink="/profile" fragment="account-verification" class="btn btn-secondary btn-sm callout-aside">Verify my account</a>
          </div>
        }
        @case ('pending') {
          <div class="callout callout-progress verify-banner" role="status">
            <strong class="callout-title">Your account is being verified.</strong>
            <p>You can prepare applications now and submit once it is verified.</p>
          </div>
        }
        @case ('rejected') {
          <div class="callout callout-danger verify-banner" role="status">
            <strong class="callout-title">{{ rejectedHeadline(v.note) }}</strong>
            <a routerLink="/profile" fragment="account-verification" class="btn btn-secondary btn-sm callout-aside">Upload again</a>
          </div>
        }
      }
    }
  `,
  styles: `
    :host { display: block; }
    .verify-banner { margin-bottom: 16px; }
  `,
})
export class VerificationBannerComponent {
  private readonly auth = inject(AuthService);
  protected readonly rejectedHeadline = rejectedHeadline;

  /** Null (nothing shown) when verified, or when the server sent no verification state. */
  protected readonly verification = computed(() => {
    const v = this.auth.currentUser()?.verification ?? null;
    return v === null || v.status === 'verified' ? null : v;
  });
}
