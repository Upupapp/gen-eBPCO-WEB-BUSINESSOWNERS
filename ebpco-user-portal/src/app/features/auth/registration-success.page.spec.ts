import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RegistrationSuccessPage } from './registration-success.page';
import { AuthService } from '../../core/session/auth.service';
import { AccountVerificationStatus } from '../../core/domain/account-verification';

/**
 * Guards F-16: this screen told a new citizen to "verify your email and mobile
 * number from your Profile before submitting a permit application".
 *
 * The Profile screen had no verification action then — only two read-only
 * badges. Nothing could send a verification email or an OTP. A dead
 * instruction pointing at a control that did not exist.
 *
 * Since migration 067 (2026-10-21) the Municipality verifies an account from a
 * valid ID before it can submit, and Profile > Account verification is a real
 * control. Sign-up signs in and sends the ID itself; this page says what
 * actually happened, read from the session.
 */
describe('RegistrationSuccessPage (F-16: no instruction without a control)', () => {
  /** `null`: not signed in. Otherwise signed in, with that verification status. */
  function render(status: AccountVerificationStatus | null = null) {
    const user = status === null ? null : { verification: { status, submittedAt: null, decidedAt: null, note: null, idType: null } };
    TestBed.configureTestingModule({
      imports: [RegistrationSuccessPage],
      providers: [provideRouter([]), { provide: AuthService, useValue: { currentUser: () => user } }],
    });
    const fixture = TestBed.createComponent(RegistrationSuccessPage);
    fixture.detectChanges();
    return fixture;
  }
  afterEach(() => TestBed.resetTestingModule());

  const textOf = (status: AccountVerificationStatus | null = null) =>
    (render(status).nativeElement as HTMLElement).textContent ?? '';

  it('does not send the citizen to Profile to verify their email or mobile number', () => {
    const text = textOf();
    expect(text).not.toContain('verify your email and mobile number');
    expect(text).not.toContain('before submitting a permit application');
  });

  it('describes email verification as the sign-up step it now is, and mobile as recorded-not-verified', () => {
    // Sign-up confirms the email address with a real code since 2026-09-20,
    // so "not available yet" stopped being true. Mobile numbers are kept on
    // file and never verified — by decision, not as a gap — and the page
    // must not send anyone looking for a step that does not exist. Since
    // 2026-09-27 no one reaches this page without confirming the code, so it
    // no longer hedges with "If you confirmed".
    const text = textOf();
    expect(text).toContain('Your email address is verified');
    expect(text).not.toContain('If you confirmed');
    expect(text).toContain('mobile number is kept on file and is not verified');
    expect(text).not.toContain('not available yet');
    expect(text).not.toMatch(/verify your mobile/i);
  });

  it('does not imply the account reached the Municipality', () => {
    // Used to assert 'demonstration build' / 'browser only' here, because
    // registration used to write to a local, in-browser store and that was
    // the honest thing to say. It now calls the real POST /auth/register
    // (auth.service.ts's register()), so the false half of the old claim --
    // the account isn't real -- is gone; what remains to guard is the other
    // half, that creating an account is not the same as an office having
    // reviewed anything.
    for (const status of [null, 'pending'] as const) {
      const text = textOf(status);
      expect(text).toContain('account has been created');
      expect(text).not.toContain('reviewed');
      expect(text).not.toContain('approved');
      TestBed.resetTestingModule();
    }
  });

  it('once the ID was sent: waiting for verification, and the citizen will be notified', () => {
    const text = textOf('pending');
    expect(text).toContain('waiting for verification');
    expect(text).toContain('You\'ll be notified when the Municipality verifies your account');
    expect(text).not.toContain('Profile > Account verification');
    expect(text).toContain('Go to Dashboard');
  });

  it('when the sign-in or the upload did not go through: still created, and where to upload the ID', () => {
    for (const status of [null, 'unsubmitted'] as const) {
      const text = textOf(status);
      expect(text).toContain('account has been created');
      expect(text).toContain('Profile > Account verification');
      expect(text).toContain('You\'ll be notified when the Municipality verifies your account');
      TestBed.resetTestingModule();
    }
    expect(textOf()).toContain('Continue to Log In');
    TestBed.resetTestingModule();
    expect(textOf('unsubmitted')).toContain('Upload My ID');
  });
});
