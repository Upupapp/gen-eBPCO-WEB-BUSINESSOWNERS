import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/session/auth.service';
import { CitizenIdentityApi } from '../../core/api/citizen-identity.api';
import { CivilStatus, Sex } from '../../core/domain/user.model';
import { RegisteredAs } from '../../core/domain/account-verification';
import { CapitalizeNameDirective } from '../../core/utils/capitalize-name.directive';
import { CASTILLA_BARANGAYS, NATIONALITIES } from '../../core/domain/ph-reference-data';
import { firstPasswordRejectionMessage, passwordChecks } from '../../core/domain/password-policy';
import { LegalDocument, LegalModalComponent } from '../../shared/ui/legal-modal.component';
import { ValidIdDraft, ValidIdFieldsComponent } from '../../shared/ui/valid-id-fields.component';
import { StepperComponent } from '../../shared/ui/stepper.component';

/**
 * Sign Up → Select Applicant Type → Enter Required Information → Create
 * Account (owner request, 2026-10-21): 1 Applicant type, 2 Personal,
 * 3 Contact, 4 Valid ID, 5 Security.
 */
type Step = 1 | 2 | 3 | 4 | 5;

/** Step 1's three cards. What they choose never restricts anything: every application asks again. */
const APPLICANT_TYPES: readonly { value: RegisteredAs; title: string; description: string }[] = [
  { value: 'residential', title: 'Residential / Private Individual', description: 'For your home or other private property.' },
  { value: 'business', title: 'Business', description: 'For a business or commercial establishment.' },
  { value: 'both', title: 'Both', description: 'You’ll apply for both.' },
];

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink, CapitalizeNameDirective, NgTemplateOutlet, LegalModalComponent, ValidIdFieldsComponent, StepperComponent],
  template: `
    <div class="auth-screen">
      <div class="card auth-card anim-pop-in">
        <div class="auth-head">
          <img src="logo.png" alt="eBPCO" class="auth-logo" />
          <h2>Create your account</h2>
          <p class="muted small">Step {{ step() }} of 5</p>
        </div>
        <app-stepper [steps]="signUpSteps" [current]="step() - 1" label="Sign-up steps" />

        @if (step() === 1) {
          <fieldset class="choice-cards">
            <legend>What will you apply for?<span class="required">*</span></legend>
            @for (option of applicantTypes; track option.value) {
              <label class="choice-card" [class.selected]="registeredAs === option.value">
                <input type="radio" name="register-applicant-type" [value]="option.value"
                  [(ngModel)]="registeredAs" (ngModelChange)="error.set(null)" />
                <span class="choice-card-text">
                  <strong>{{ option.title }}</strong>
                  <span>{{ option.description }}</span>
                </span>
              </label>
            }
          </fieldset>
          <p class="small muted">This only sets up your account. Every application asks again, so one account covers both.</p>
          @if (error()) { <div class="field error">{{ error() }}</div> }
          <button class="btn btn-primary btn-block" (click)="toPersonal()">Continue</button>
        }

        @if (step() === 2) {
          <div class="form-row">
            <div class="field"><label for="register-first-name-1">First Name<span class="required">*</span></label><input id="register-first-name-1" class="input" [(ngModel)]="firstName" appCapitalizeName /></div>
            <div class="field"><label for="register-middle-name-2">Middle Name</label><input id="register-middle-name-2" class="input" [(ngModel)]="middleName" appCapitalizeName /></div>
          </div>
          <div class="field"><label for="register-last-name-3">Last Name<span class="required">*</span></label><input id="register-last-name-3" class="input" [(ngModel)]="lastName" appCapitalizeName /></div>
          <div class="form-row">
            <div class="field"><label for="register-date-of-birth-4">Date of Birth<span class="required">*</span></label><input id="register-date-of-birth-4" class="input" type="date" [(ngModel)]="dateOfBirth" /></div>
            <div class="field">
              <label for="register-sex-5">Sex<span class="required">*</span></label>
              <select id="register-sex-5" class="input" [(ngModel)]="sex">
                <option [ngValue]="null" disabled>Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="field">
              <label for="register-civil-status-6">Civil Status<span class="required">*</span></label>
              <select id="register-civil-status-6" class="input" [(ngModel)]="civilStatus">
                <option [ngValue]="null" disabled>Select</option>
                <option value="Single">Single</option>
                <option value="Married">Married</option>
                <option value="Widowed">Widowed</option>
                <option value="Separated">Separated</option>
                <option value="Divorced">Divorced</option>
              </select>
            </div>
            <div class="field">
              <label for="register-nationality-7">Nationality<span class="required">*</span></label>
              <select id="register-nationality-7" class="input" [(ngModel)]="nationality">
                @for (n of nationalities; track n) {
                  <option [value]="n">{{ n }}</option>
                }
              </select>
              @if (nationality === 'Other') {
                <input class="input" style="margin-top:8px;" placeholder="Enter your nationality" [(ngModel)]="otherNationality" aria-label="Specify your nationality" />
              }
            </div>
          </div>
          @if (error()) { <div class="field error">{{ error() }}</div> }
          <div style="display:flex; gap:10px;">
            <button class="btn btn-secondary" style="flex:1" (click)="step.set(1)">Back</button>
            <button class="btn btn-primary" style="flex:2" (click)="toContact()">Continue</button>
          </div>
        }

        @if (step() === 3) {
          <div class="field">
            <label for="register-email-address-8">Email Address<span class="required">*</span></label>
            <div style="display:flex; gap:8px; align-items:center;">
              <input id="register-email-address-8" class="input" type="email" style="flex:1"
                [ngModel]="email" (ngModelChange)="onEmailInput($event)" [disabled]="emailVerified()" />
              @if (emailVerified()) {
                <span class="badge badge-green" style="white-space:nowrap;">✓ Verified</span>
              } @else {
                <button type="button" class="btn btn-secondary btn-sm" style="white-space:nowrap;"
                  [disabled]="sendingCode() || !email"
                  (click)="sendVerificationCode()">
                  {{ sendingCode() ? 'Sending…' : (codeSent() ? 'Resend Code' : 'Verify Email') }}
                </button>
              }
            </div>
            @if (emailError()) { <div class="field error" style="margin-top:6px;">{{ emailError() }}</div> }

            @if (codeSent() && !emailVerified()) {
              <div style="margin-top:10px;">
                <label for="register-email-code">Enter the 6-digit code sent to your email<span class="required">*</span></label>
                <div style="display:flex; gap:8px; margin-top:4px;">
                  <input id="register-email-code" class="input" style="flex:1" inputmode="numeric" maxlength="6"
                    [(ngModel)]="verificationCode" placeholder="123456" />
                  <button type="button" class="btn btn-primary btn-sm" style="white-space:nowrap;"
                    [disabled]="confirmingCode() || verificationCode.length !== 6"
                    (click)="confirmVerificationCode()">
                    {{ confirmingCode() ? 'Checking…' : 'Confirm' }}
                  </button>
                </div>
                @if (codeError()) { <div class="field error" style="margin-top:6px;">{{ codeError() }}</div> }
                @if (codeNotice()) { <p class="small muted" style="margin-top:6px;">{{ codeNotice() }}</p> }
              </div>
            } @else if (skipVerification()) {
              <div class="field error" style="margin-top:6px;">{{ skipVerification() }}</div>
            } @else if (!emailVerified()) {
              <p class="small muted" style="margin-top:6px;">You need to verify your email before you can continue.</p>
            }
          </div>
          <div class="field">
            <label for="register-mobile-number-9">Mobile Number<span class="required">*</span></label>
            <input #mobileInput id="register-mobile-number-9" class="input" type="tel" inputmode="numeric" maxlength="11"
              placeholder="09XXXXXXXXX" [ngModel]="mobileNumber" (ngModelChange)="onMobileNumberInput($event, mobileInput)" />
            <p class="small muted" style="margin-top:4px;">Numbers only, 11 digits starting with 09 (e.g. 09171234567).</p>
            @if (mobileError()) { <div class="field error" style="margin-top:6px;">{{ mobileError() }}</div> }
          </div>
          <div class="field"><label for="register-house-number-street-10">House Number / Street<span class="required">*</span></label><input id="register-house-number-street-10" class="input" [(ngModel)]="street" /></div>
          <div class="form-row">
            <div class="field">
              <label for="register-barangay-11">Barangay<span class="required">*</span></label>
              <select id="register-barangay-11" class="input" [(ngModel)]="barangay">
                <option value="" disabled>Select</option>
                @for (b of barangays; track b) {
                  <option [value]="b">{{ b }}</option>
                }
              </select>
            </div>
            <div class="field">
              <label for="register-city-municipality-12">City / Municipality<span class="required">*</span></label>
              <select id="register-city-municipality-12" class="input" [(ngModel)]="city">
                <option value="Castilla">Castilla</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="field">
              <label for="register-province-13">Province<span class="required">*</span></label>
              <select id="register-province-13" class="input" [(ngModel)]="province">
                <option value="Sorsogon">Sorsogon</option>
              </select>
            </div>
            <div class="field">
              <label for="register-postal-code-14">Postal Code<span class="required">*</span></label>
              <input #postalInput id="register-postal-code-14" class="input" type="text" inputmode="numeric" maxlength="4"
                placeholder="0000" [ngModel]="postalCode" (ngModelChange)="onPostalCodeInput($event, postalInput)" />
            </div>
          </div>
          @if (error()) { <div class="field error">{{ error() }}</div> }
          <div style="display:flex; gap:10px;">
            <button class="btn btn-secondary" style="flex:1" (click)="step.set(2)">Back</button>
            <button class="btn btn-primary" style="flex:2" (click)="toValidId()">Continue</button>
          </div>
        }

        @if (step() === 4) {
          <p class="small muted" style="margin-top:0;">
            The Municipality checks your ID before you can submit applications. You can prepare applications while you wait.
          </p>
          <app-valid-id-fields [draft]="idDraft" prefix="register-id" />
          @if (error()) { <div class="field error">{{ error() }}</div> }
          <div style="display:flex; gap:10px;">
            <button class="btn btn-secondary" style="flex:1" (click)="step.set(3)">Back</button>
            <button class="btn btn-primary" style="flex:2" (click)="toSecurity()">Continue</button>
          </div>
        }

        @if (step() === 5) {
          <div class="field">
            <label for="register-password-15">Password<span class="required">*</span></label>
            <div class="password-field">
              <input id="register-password-15" class="input" [type]="showPassword() ? 'text' : 'password'" [(ngModel)]="password" />
              <button type="button" class="password-toggle" (click)="showPassword.set(!showPassword())" [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'">
                <ng-container *ngTemplateOutlet="eyeIcon; context: { open: showPassword() }" />
              </button>
            </div>
            <div class="hint">A longer phrase is easier to remember and harder to guess than a short one with symbols in it.</div>
            <ul class="password-checklist" aria-label="Password requirements">
              @for (check of passwordChecks; track check.label) {
                <li [class.met]="check.passed">
                  <span class="check-icon" aria-hidden="true">✓</span>
                  {{ check.label }}
                </li>
              }
            </ul>
            <div class="hint">We also check it isn't a password already known from a real data breach — that part happens when you submit, not here in the browser.</div>
          </div>
          <div class="field">
            <label for="register-confirm-password-16">Confirm Password<span class="required">*</span></label>
            <div class="password-field">
              <input id="register-confirm-password-16" class="input" [type]="showConfirmPassword() ? 'text' : 'password'" [(ngModel)]="confirmPassword" />
              <button type="button" class="password-toggle" (click)="showConfirmPassword.set(!showConfirmPassword())" [attr.aria-label]="showConfirmPassword() ? 'Hide password' : 'Show password'">
                <ng-container *ngTemplateOutlet="eyeIcon; context: { open: showConfirmPassword() }" />
              </button>
            </div>
          </div>
          <!-- The words sit in one <span>: as loose flex items they came apart around the link. -->
          <label class="checkbox-row" style="margin-bottom:10px;">
            <input type="checkbox" [(ngModel)]="acceptedTerms" />
            <span>I agree to the <button type="button" class="link-button" (click)="openLegalModal.set('terms')">Terms &amp; Conditions</button></span>
          </label>
          <label class="checkbox-row" style="margin-bottom:16px;">
            <input type="checkbox" [(ngModel)]="acceptedPrivacy" />
            <span>I agree to the <button type="button" class="link-button" (click)="openLegalModal.set('privacy')">Privacy Policy</button></span>
          </label>
          @if (error()) { <div class="field error">{{ error() }}</div> }
          <div style="display:flex; gap:10px;">
            <button class="btn btn-secondary" style="flex:1" [disabled]="submitting()" (click)="step.set(4)">Back</button>
            <button class="btn btn-primary" style="flex:2" [disabled]="submitting()" (click)="submit()">
              {{ submitting() ? 'Creating Account' : 'Create Account' }}
            </button>
          </div>
        }

        @if (openLegalModal(); as doc) {
          <app-legal-modal [document]="doc" (close)="openLegalModal.set(null)" />
        }

        <hr class="divider" />
        <div style="text-align:center;" class="small muted">Already have an account? <a routerLink="/login">Log in</a></div>
      </div>
      <a routerLink="/landing" class="auth-home"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>Back to home</a>
    </div>

    <ng-template #eyeIcon let-open="open">
      @if (open) {
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
    </ng-template>
  `,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly identity = inject(CitizenIdentityApi);
  private readonly router = inject(Router);

  readonly step = signal<Step>(1);
  /** The step bar's names, in order (step() is 1-based). */
  protected readonly signUpSteps = ['Applicant', 'Personal', 'Contact', 'Valid ID', 'Security'] as const;
  readonly error = signal<string | null>(null);
  /** Field-level, shown directly under Email/Mobile Number rather than the shared step-level `error` banner or a floating toast — the same "typical warning" placement every other field-format check in this app already uses. */
  readonly emailError = signal<string | null>(null);
  readonly mobileError = signal<string | null>(null);

  readonly nationalities = NATIONALITIES;
  readonly barangays = CASTILLA_BARANGAYS;
  protected readonly applicantTypes = APPLICANT_TYPES;

  // Step 1 — sent as `registeredAs`. A starting point only: it sets which
  // "Applying as" a new application opens on, and nothing else.
  registeredAs: RegisteredAs | null = null;

  // Step 2
  firstName = '';
  middleName = '';
  lastName = '';
  dateOfBirth = '';
  sex: Sex | null = null;
  civilStatus: CivilStatus | null = null;
  nationality = 'Filipino';
  /** Only sent when `nationality === 'Other'` — see the dropdown's own fallback field. */
  otherNationality = '';

  // Step 3
  email = '';
  mobileNumber = '';
  street = '';
  barangay = '';
  city = 'Castilla';
  province = 'Sorsogon';
  /** Castilla, Sorsogon's own postal code — the correct default for virtually every citizen registering here, still editable for the rare address that genuinely differs. */
  postalCode = '4713';

  onEmailInput(value: string): void {
    this.email = value;
    this.emailError.set(null);
    // A verified/in-progress code belongs to the PREVIOUS email — editing
    // the field after Verify Email (or after confirming) must reset the
    // whole verification state, or a citizen could type in someone else's
    // already-confirmed address and register it as verified on the strength
    // of a code that was never sent to that address at all.
    if (this.emailVerified() || this.codeSent()) {
      this.emailVerified.set(false);
      this.codeSent.set(false);
      this.verificationCode = '';
      this.codeError.set(null);
      this.codeNotice.set(null);
      this.skipVerification.set(null);
    }
  }

  // ---- Email verification (Step 3, before an account exists) ------------
  // Sends and checks a real 6-digit code via /auth/register/email/request
  // and /auth/register/email/confirm — see RegistrationVerificationService
  // on the server. Confirming here does not itself create anything; the
  // server spends the confirmation once, the moment submit() below actually
  // calls register().

  readonly emailVerified = signal(false);
  readonly codeSent = signal(false);
  readonly sendingCode = signal(false);
  readonly confirmingCode = signal(false);
  readonly codeError = signal<string | null>(null);
  /** A non-error status line under the code field — "code resent", not a failure. */
  readonly codeNotice = signal<string | null>(null);
  /**
   * Set only when the LGU could not send a code at all (no mail provider,
   * or a real one that just failed) — explains why Continue works without a
   * confirmed code, rather than a citizen wondering why the requirement
   * they were just shown silently stopped applying. `null` the rest of the
   * time, including before Verify Email has ever been clicked.
   */
  readonly skipVerification = signal<string | null>(null);
  verificationCode = '';

  async sendVerificationCode(): Promise<void> {
    if (!RegisterPage.EMAIL_PATTERN.test(this.email)) {
      this.emailError.set('Please enter a valid email address.');
      return;
    }
    this.emailError.set(null);
    this.codeError.set(null);
    this.codeNotice.set(null);
    this.sendingCode.set(true);
    try {
      const result = await this.identity.requestRegistrationEmailCode(this.email);
      if (result.kind === 'sent') {
        this.codeSent.set(true);
        this.skipVerification.set(null);
        this.codeNotice.set('A 6-digit code was sent. It expires in a few minutes.');
      } else if (result.kind === 'too-soon') {
        // A live code from moments ago is still good — keep that entry open
        // rather than treating this as a failure.
        this.codeSent.set(true);
        this.codeNotice.set(result.detail);
      } else {
        // 'not-sent' (no provider configured) or 'failed' (a real one that
        // just failed). Verification is required (see toValidId), so the
        // citizen is told to try again rather than offered a way around it.
        this.codeSent.set(false);
        this.skipVerification.set(
          `${result.detail} Please try Verify Email again in a moment. If it keeps failing, contact the Office of the Municipal Engineer.`,
        );
      }
    } catch {
      this.skipVerification.set(
        'Could not reach the Municipality’s system to send a code. '
          + 'Check your connection and click Verify Email again.',
      );
    } finally {
      this.sendingCode.set(false);
    }
  }

  async confirmVerificationCode(): Promise<void> {
    if (!/^\d{6}$/.test(this.verificationCode)) {
      this.codeError.set('Enter the 6-digit code exactly as sent.');
      return;
    }
    this.codeError.set(null);
    this.codeNotice.set(null);
    this.confirmingCode.set(true);
    try {
      const result = await this.identity.confirmRegistrationEmailCode(this.email, this.verificationCode);
      if (result.kind === 'confirmed') {
        this.emailVerified.set(true);
        this.codeSent.set(false);
        this.verificationCode = '';
      } else {
        this.codeError.set(result.detail);
      }
    } finally {
      this.confirmingCode.set(false);
    }
  }

  /**
   * Digits only, capped at 11 — matches the `09XXXXXXXXX` format this form
   * actually accepts (see the regex check in `toValidId`). Sanitized on every
   * keystroke rather than only on submit, same as a normal sign-up form's
   * phone field.
   *
   * The `input` element is passed and its `.value` set directly, not left to
   * `[ngModel]="mobileNumber"`'s own re-render. When a rejected keystroke
   * sanitizes back to the SAME string `mobileNumber` already held (typing a
   * letter into an empty field: '' -> '' both before and after), Angular's
   * change detection sees no change in the bound expression and never
   * rewrites the DOM -- so the field kept showing whatever the citizen had
   * just typed, letters included, while the component's own `mobileNumber`
   * was correctly empty underneath. Confirmed live: typing "sasaas" left
   * "sasaas" sitting in the field. Setting `.value` here is unconditional,
   * not gated on Angular detecting a change, so it always matches reality.
   */
  onMobileNumberInput(value: string, input: HTMLInputElement): void {
    this.mobileNumber = value.replace(/\D/g, '').slice(0, 11);
    input.value = this.mobileNumber;
    this.mobileError.set(null);
  }

  /**
   * Digits only, capped at 4 — the PH postal-code format the server itself
   * enforces (`postal_code ~ '^[0-9]{4}$'`, migration 036_applicant_address.sql).
   * `.value` set directly on the element for the same reason
   * `onMobileNumberInput` does — see its own doc comment.
   */
  onPostalCodeInput(value: string, input: HTMLInputElement): void {
    this.postalCode = value.replace(/\D/g, '').slice(0, 4);
    input.value = this.postalCode;
  }

  // Step 4 — the valid ID, sent right after the account is created (see
  // sendIdAfterSignUp). Held here, not in the step's own fields, because a
  // step that is not on screen is not rendered.
  readonly idDraft = new ValidIdDraft();

  // Step 5
  password = '';
  confirmPassword = '';
  acceptedTerms = false;
  acceptedPrivacy = false;
  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);
  readonly openLegalModal = signal<LegalDocument | null>(null);

  /** The subset of the server's password policy a browser can actually evaluate live —
   *  see `core/domain/password-policy.ts` for what's excluded and why (the breach screen). */
  get passwordChecks(): { label: string; passed: boolean }[] {
    return passwordChecks(this.password, { email: this.email, firstName: this.firstName, lastName: this.lastName });
  }

  toPersonal(): void {
    if (this.registeredAs === null) {
      this.error.set('Choose what you will apply for.');
      return;
    }
    this.error.set(null);
    this.step.set(2);
  }

  toContact(): void {
    if (!this.firstName || !this.lastName || !this.dateOfBirth || !this.sex || !this.civilStatus || !this.nationality) {
      this.error.set('Please complete all required fields.');
      return;
    }
    const age = this.ageFrom(this.dateOfBirth);
    if (age < 18) {
      this.error.set('You must be at least 18 years old to register.');
      return;
    }
    if (this.nationality === 'Other' && !this.otherNationality.trim()) {
      this.error.set('Please specify your nationality.');
      return;
    }
    this.error.set(null);
    this.step.set(3);
  }

  private ageFrom(dob: string): number {
    const birth = new Date(dob);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
      age -= 1;
    }
    return age;
  }

  /** Same shape the server itself enforces (`z.string().email()`, auth.controller.ts) — this
   *  is a UX shortcut so a typo is caught on this step instead of after Step 5's password
   *  fields, not the actual guarantee. The server re-validates regardless. */
  private static readonly EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  toValidId(): void {
    this.emailError.set(null);
    this.mobileError.set(null);
    // Named per field rather than one blanket message — a citizen looking at
    // six filled-in fields and a seventh they missed should be told which one,
    // not left to hunt for it themselves.
    const missing: [boolean, string][] = [
      [!this.email, 'Email Address'],
      [!this.mobileNumber, 'Mobile Number'],
      [!this.street, 'House Number / Street'],
      [!this.barangay, 'Barangay'],
      [!this.city, 'City / Municipality'],
      [!this.province, 'Province'],
      [!this.postalCode, 'Postal Code'],
    ];
    const firstMissing = missing.find(([isMissing]) => isMissing);
    if (firstMissing) {
      this.error.set(`${firstMissing[1]} is required.`);
      return;
    }
    if (!RegisterPage.EMAIL_PATTERN.test(this.email)) {
      this.emailError.set('Please enter a valid email address.');
      return;
    }
    if (!/^09\d{9}$/.test(this.mobileNumber)) {
      this.mobileError.set('Mobile number must be in the format 09XXXXXXXXX.');
      return;
    }
    if (!/^\d{4}$/.test(this.postalCode)) {
      this.error.set('Postal code must be exactly 4 digits.');
      return;
    }
    // Owner decision, 2026-09-27: every account starts with a confirmed email.
    // There is no longer an "continue unverified" path — not when the code was
    // never requested, and not when the Municipality's mail could not be sent
    // (the citizen is told to try again instead). The Municipality writes to
    // this address about permits and payments; an unconfirmed one is how a
    // typo silently cuts a citizen off from their own application.
    if (!this.emailVerified()) {
      this.emailError.set(
        this.codeSent()
          ? 'Enter the 6-digit code sent to your email and click Confirm, or use Resend Code if it did not arrive.'
          : 'Verify your email address first: click Verify Email and enter the 6-digit code we send you.',
      );
      return;
    }
    this.error.set(null);
    this.step.set(4);
  }

  /** The ID type, its number and a photo of the front are required; the back is optional. */
  toSecurity(): void {
    const problem = this.idDraft.problem();
    if (problem) {
      this.error.set(problem);
      return;
    }
    this.error.set(null);
    this.step.set(5);
  }

  readonly submitting = signal(false);

  async submit(): Promise<void> {
    const passwordRejection = firstPasswordRejectionMessage(this.password, {
      email: this.email, firstName: this.firstName, lastName: this.lastName,
    });
    if (passwordRejection) {
      this.error.set(passwordRejection);
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.error.set('Passwords do not match.');
      return;
    }
    if (!this.acceptedTerms || !this.acceptedPrivacy) {
      this.error.set('You must agree to the Terms & Conditions and Privacy Policy.');
      return;
    }
    this.submitting.set(true);
    try {
      const result = await this.auth.register(
        {
          firstName: this.firstName,
          middleName: this.middleName || null,
          lastName: this.lastName,
          dateOfBirth: this.dateOfBirth,
          sex: this.sex!,
          civilStatus: this.civilStatus!,
          nationality: this.nationality === 'Other' ? this.otherNationality.trim() : this.nationality,
        },
        {
          email: this.email,
          mobileNumber: this.mobileNumber,
          street: this.street,
          barangay: this.barangay,
          city: this.city,
          province: this.province,
          postalCode: this.postalCode,
        },
        { password: this.password },
        this.registeredAs,
      );
      if (!result.ok) {
        this.error.set(result.error);
        return;
      }
      await this.sendIdAfterSignUp();
      this.router.navigate(['/registration-success']);
    } finally {
      this.submitting.set(false);
    }
  }

  /**
   * Signs in with the email and password just chosen, then sends the valid
   * ID (`PUT /me/verification` needs a signed-in account). Neither failure
   * is shown as an error here: the account exists either way, and the
   * success page reads what actually happened from the session — signed in
   * with the ID waiting for verification, or told to sign in and upload it
   * under Profile. A sign-in that fails reads the same whatever the reason,
   * so nothing says whether this email was already registered.
   */
  private async sendIdAfterSignUp(): Promise<void> {
    try {
      const signedIn = await this.auth.login(this.email, this.password);
      if (!signedIn.ok) return;
      await this.auth.submitVerification(await this.idDraft.toRequest());
    } catch {
      // See above: the success page says what to do next.
    }
  }
}
