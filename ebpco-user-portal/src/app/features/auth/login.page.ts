import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/session/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="auth-screen">
      <div class="card auth-card anim-pop-in">
        <div class="auth-head">
          <img src="logo.png" alt="eBPCO" class="auth-logo" />
          <h2>Log in</h2>
          <p class="muted small">Sign in to your eBPCO account</p>
        </div>

        <div class="field">
          <label for="login-email-or-mobile-1">Email or mobile number</label>
          <!-- Enter signs in from either field, as people expect; the fields sit in no <form> (live check, 15 Nov 2026). -->
          <input id="login-email-or-mobile-1" class="input" [(ngModel)]="identifier" placeholder="you@example.com" (keydown.enter)="submit()" />
        </div>
        <div class="field">
          <label for="login-password-2">Password</label>
          <div class="password-field">
            <input id="login-password-2" class="input" [type]="showPassword() ? 'text' : 'password'" [(ngModel)]="password" placeholder="••••••••" (keydown.enter)="submit()" />
            <button type="button" class="password-toggle" (click)="showPassword.set(!showPassword())" [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'">
              @if (showPassword()) {
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 12s3.6-7 9-7 9 7 9 7-3.6 7-9 7-9-7-9-7Z" stroke="currentColor" stroke-width="1.6" />
                  <circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.6" />
                </svg>
              } @else {
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 12s3.6-7 9-7 9 7 9 7-3.6 7-9 7-9-7-9-7Z" stroke="currentColor" stroke-width="1.6" />
                  <circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.6" />
                  <path d="m3 3 18 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                </svg>
              }
            </button>
          </div>
        </div>

        @if (error()) {
          <div class="field error">{{ error() }}</div>
        }

        <button class="btn btn-primary btn-block" [disabled]="submitting()" (click)="submit()">
          {{ submitting() ? 'Signing in' : 'Log in' }}
        </button>

        <div style="text-align:center; margin-top:14px;">
          <a routerLink="/forgot-password" class="small">Forgot password?</a>
        </div>
        <hr class="divider" />
        <div style="text-align:center;" class="small muted">
          Don't have an account? <a routerLink="/register">Register</a>
        </div>
      </div>
      <a routerLink="/landing" class="auth-home"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>Back to home</a>
    </div>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  identifier = '';
  password = '';
  readonly error = signal<string | null>(null);
  readonly showPassword = signal(false);

  readonly submitting = signal(false);

  async submit(): Promise<void> {
    if (this.submitting()) return; // Enter pressed again while signing in
    if (!this.identifier && !this.password) {
      this.error.set('Please enter your email/mobile number and password.');
      return;
    }
    if (!this.identifier) {
      this.error.set('Please enter your email or mobile number.');
      return;
    }
    if (!this.password) {
      this.error.set('Please enter your password.');
      return;
    }
    this.submitting.set(true);
    let leaving = false;
    try {
      const result = await this.auth.login(this.identifier, this.password);
      if (!result.ok) {
        this.error.set(result.error);
        return;
      }
      this.error.set(null);
      // "Signing in" stays until the dashboard is on screen. Not waiting for
      // it flipped the button back to "Log in" while the dashboard loaded
      // (about 1.5 s on the live site, 15 Nov 2026), which reads as a click
      // that did nothing.
      leaving = await this.router.navigate(['/dashboard']);
    } finally {
      if (!leaving) this.submitting.set(false);
    }
  }
}
