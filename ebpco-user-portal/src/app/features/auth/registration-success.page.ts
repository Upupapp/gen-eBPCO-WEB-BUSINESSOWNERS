import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/session/auth.service';

@Component({
  selector: 'app-registration-success',
  imports: [RouterLink],
  template: `
    <div class="auth-screen">
      <div class="card auth-card anim-pop-in" style="text-align:center;">
        <img src="logo.png" alt="eBPCO" class="auth-logo" />
        <div class="badge badge-green anim-flip-in" style="margin-bottom:12px; animation-delay:0.15s;">Account Created</div>
        <h2>Welcome to eBPCO</h2>
        <!--
          Used to say "...in this demonstration build. It exists in your
          browser and is saved when you close or refresh the page." That was
          true while registration wrote to a local, in-browser store. It now
          calls the real POST /auth/register (auth.service.ts's register())
          and the account is a real row in the real database from this
          screen onward -- telling the citizen otherwise is the F-16 defect
          in the other direction.
        -->
        <!--
          Migration 067 (2026-10-21): an account must be verified by the
          Municipality, from a valid ID, before it can submit applications.
          Sign-up signs in and sends the ID itself (register.page.ts,
          sendIdAfterSignUp); what this page says is read from the session,
          so it says what actually happened rather than what was meant to.
          The control it points to when the ID did not go is real:
          Profile > Account verification.
        -->
        @switch (state()) {
          @case ('waiting') {
            <p class="muted">Your account has been created and is waiting for verification.</p>
            <p class="small muted">
              The Municipality is checking your ID. You'll be notified when the Municipality verifies your
              account. You can prepare applications while you wait.
            </p>
          }
          @case ('verified') {
            <p class="muted">Your account has been created.</p>
          }
          @default {
            <p class="muted">Your account has been created and is waiting for verification.</p>
            <p class="small muted">
              Your ID was not sent yet. Sign in, then upload it under Profile &gt; Account verification.
              You'll be notified when the Municipality verifies your account.
            </p>
          }
        }
        <!--
          F-16: this used to say "Please verify your email and mobile number from
          your Profile before submitting a permit application." Three things were
          wrong with it. The Profile screen had NO verification action — only two
          read-only badges. Nothing could send a verification email or an OTP.
          And the verified/pending status gated nothing anywhere in the app. Do
          not point at a control that does not exist.
        -->
        <!--
          Rewritten 2026-09-20: sign-up now confirms the email address with a
          real code (step 3), so "not available yet" stopped being true. Mobile
          numbers are recorded and not verified, by decision — say so rather
          than imply a step the citizen should go looking for.
        -->
        <p class="small muted">
          Your email address is verified. Your mobile number is kept on file and is not
          verified.
        </p>
        @if (!signedIn()) {
          <a routerLink="/login" class="btn btn-primary btn-block" style="margin-top:12px;">Continue to Log In</a>
        } @else if (state() === 'upload-later') {
          <a routerLink="/profile" fragment="account-verification" class="btn btn-primary btn-block" style="margin-top:12px;">Upload My ID</a>
        } @else {
          <a routerLink="/dashboard" class="btn btn-primary btn-block" style="margin-top:12px;">Go to Dashboard</a>
        }
      </div>
      <a routerLink="/landing" class="auth-home"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>Back to home</a>
    </div>
  `,
})
export class RegistrationSuccessPage {
  private readonly auth = inject(AuthService);

  protected readonly signedIn = computed(() => this.auth.currentUser() !== null);

  /**
   * 'waiting': signed in and the ID was received. 'verified': an account
   * that needs nothing more (already verified, or a server from before
   * verification existed). 'upload-later': anything else — not signed in,
   * or signed in with no ID on file — so the citizen is told where to send it.
   */
  protected readonly state = computed<'waiting' | 'verified' | 'upload-later'>(() => {
    const user = this.auth.currentUser();
    if (user === null) return 'upload-later';
    const status = user.verification?.status ?? 'verified';
    if (status === 'pending') return 'waiting';
    if (status === 'verified') return 'verified';
    return 'upload-later';
  });
}
