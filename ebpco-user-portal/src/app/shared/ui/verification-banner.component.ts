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
  template: `
    @if (verification(); as v) {
      @switch (v.status) {
        @case ('unsubmitted') {
          <div class="verify-banner" role="status">
            <p><strong>Verify your account to submit applications.</strong>
              Send a photo of a valid government ID. You can prepare applications while the Municipality checks it.</p>
            <a routerLink="/profile" fragment="account-verification" class="btn btn-primary btn-sm">Verify my account</a>
          </div>
        }
        @case ('pending') {
          <div class="verify-banner verify-banner--waiting" role="status">
            <p><strong>Your account is being verified.</strong>
              You can prepare applications now and submit once it is verified.</p>
          </div>
        }
        @case ('rejected') {
          <div class="verify-banner verify-banner--rejected" role="status">
            <p><strong>{{ rejectedHeadline(v.note) }}</strong></p>
            <a routerLink="/profile" fragment="account-verification" class="btn btn-primary btn-sm">Upload again</a>
          </div>
        }
      }
    }
  `,
  styles: `
    :host { display: block; }
    .verify-banner {
      display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
      margin-bottom: 16px; padding: 12px 16px; border-radius: var(--radius-md);
      background: var(--warning-100); color: var(--warning-text);
    }
    .verify-banner p { margin: 0; font-size: 13px; flex: 1 1 260px; }
    .verify-banner--waiting { background: var(--info-100); color: var(--info-text); }
    .verify-banner--rejected { background: var(--danger-100); color: var(--danger-text); }
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
