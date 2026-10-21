import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { RegisterPage } from './register.page';
import { CitizenIdentityApi } from '../../core/api/citizen-identity.api';
import { AuthService } from '../../core/session/auth.service';

/**
 * Registration wizard's own email verification (Step 3, Contact): the citizen enters
 * an email, sends a real 6-digit code, and must confirm it before Continue
 * moves on — mirroring the server's own gate in
 * `RegistrationVerificationService`/`consumeConfirmedProof`. These tests
 * cover the client half of that contract. Since the owner's decision of
 * 2026-09-27, Continue is held back until the email is confirmed — always,
 * including when the Municipality's mail could not be sent (the citizen is
 * told to try again instead of being let through unverified).
 */
type Delivery = { kind: 'sent' | 'not-sent' | 'failed'; detail: string } | { kind: 'too-soon'; detail: string };
type Confirmation = { kind: 'confirmed' } | { kind: 'refused'; detail: string };

class ScriptedIdentityApi {
  nextRequest: Delivery = { kind: 'sent', detail: 'A 6-digit code was sent.' };
  nextConfirm: Confirmation = { kind: 'confirmed' };
  requestedEmails: string[] = [];
  confirmedCodes: string[] = [];

  async register(): Promise<void> {}
  async requestRegistrationEmailCode(email: string): Promise<Delivery> {
    this.requestedEmails.push(email);
    return this.nextRequest;
  }
  async confirmRegistrationEmailCode(_email: string, code: string): Promise<Confirmation> {
    this.confirmedCodes.push(code);
    return this.nextConfirm;
  }
}

describe('RegisterPage — Step 3 email verification', () => {
  let api: ScriptedIdentityApi;

  function render() {
    TestBed.configureTestingModule({
      imports: [RegisterPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CitizenIdentityApi, useClass: ScriptedIdentityApi },
      ],
    });
    api = TestBed.inject(CitizenIdentityApi) as unknown as ScriptedIdentityApi;
    const fixture = TestBed.createComponent(RegisterPage);
    fixture.detectChanges();
    return fixture;
  }
  afterEach(() => TestBed.resetTestingModule());

  /** Fills every Contact (Step 3) field Continue requires other than email verification itself. */
  function fillStep2Contact(page: RegisterPage): void {
    page.step.set(3);
    page.email = 'juan@example.com';
    page.mobileNumber = '09171234567';
    page.street = 'Purok 3';
    page.barangay = 'Poblacion';
    page.city = 'Castilla';
    page.province = 'Sorsogon';
    page.postalCode = '4713';
  }

  it('holds Continue back when a code was sent and never confirmed', async () => {
    const fixture = render();
    const page = fixture.componentInstance;
    fillStep2Contact(page);

    await page.sendVerificationCode();
    expect(page.codeSent()).toBe(true);
    expect(page.emailVerified()).toBe(false);

    page.toValidId();
    expect(page.step()).toBe(3);
    expect(page.emailError()).toContain('Enter the 6-digit code');
  });

  it('confirming the right code unlocks Continue', async () => {
    const fixture = render();
    const page = fixture.componentInstance;
    fillStep2Contact(page);

    await page.sendVerificationCode();
    page.verificationCode = '123456';
    await page.confirmVerificationCode();

    expect(page.emailVerified()).toBe(true);
    expect(api.confirmedCodes).toEqual(['123456']);

    page.toValidId();
    expect(page.step()).toBe(4);
  });

  it('a wrong code reports the server’s refusal and does not verify', async () => {
    const fixture = render();
    const page = fixture.componentInstance;
    fillStep2Contact(page);

    await page.sendVerificationCode();
    api.nextConfirm = { kind: 'refused', detail: 'That code was not accepted.' };
    page.verificationCode = '000000';
    await page.confirmVerificationCode();

    expect(page.emailVerified()).toBe(false);
    expect(page.codeError()).toBe('That code was not accepted.');
  });

  it('editing the email after verifying resets verification — a stale confirmation must not carry over', async () => {
    const fixture = render();
    const page = fixture.componentInstance;
    fillStep2Contact(page);

    await page.sendVerificationCode();
    page.verificationCode = '123456';
    await page.confirmVerificationCode();
    expect(page.emailVerified()).toBe(true);

    page.onEmailInput('someone-else@example.com');
    expect(page.emailVerified()).toBe(false);
    expect(page.codeSent()).toBe(false);
    expect(page.verificationCode).toBe('');
  });

  it('still blocks Continue when no mail provider is configured, and tells the citizen to try again', async () => {
    const fixture = render();
    const page = fixture.componentInstance;
    fillStep2Contact(page);
    api.nextRequest = { kind: 'not-sent', detail: 'Email delivery is not configured yet.' };

    await page.sendVerificationCode();
    expect(page.codeSent()).toBe(false);
    expect(page.emailVerified()).toBe(false);
    expect(page.skipVerification()).toContain('try Verify Email again');
    expect(page.skipVerification()).not.toContain('continue without verifying');

    page.toValidId();
    expect(page.step()).toBe(3);
  });

  it('still blocks Continue when a real provider just failed to send', async () => {
    const fixture = render();
    const page = fixture.componentInstance;
    fillStep2Contact(page);
    api.nextRequest = { kind: 'failed', detail: 'The mail server refused the message.' };

    await page.sendVerificationCode();
    page.toValidId();
    expect(page.step()).toBe(3);
  });

  it('blocks Continue when the email was never verified at all, and says what to do', () => {
    const fixture = render();
    const page = fixture.componentInstance;
    fillStep2Contact(page);

    page.toValidId();
    expect(page.step()).toBe(3);
    expect(page.emailError()).toContain('Verify Email');
    expect(api.requestedEmails).toEqual([]);
  });
});

/**
 * Sign Up → Select Applicant Type → Enter Required Information → Create
 * Account (owner request, 2026-10-21). The applicant type is a starting point
 * only; the valid ID is what the Municipality verifies the account from, and
 * it is sent right after the account exists (`PUT /me/verification` needs a
 * signed-in account).
 */
describe('RegisterPage — applicant type, valid ID, and Create Account', () => {
  const PASSWORD = 'Mango Tree Lane 42!';
  const PNG_BYTES = [137, 80, 78, 71, 1, 2, 3];

  function render(): RegisterPage {
    TestBed.configureTestingModule({
      imports: [RegisterPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CitizenIdentityApi, useClass: ScriptedIdentityApi },
      ],
    });
    const fixture = TestBed.createComponent(RegisterPage);
    fixture.detectChanges();
    return fixture.componentInstance;
  }
  afterEach(() => TestBed.resetTestingModule());

  const png = () => new File([new Uint8Array(PNG_BYTES)], 'id-front.png', { type: 'image/png' });

  /** Every step filled in and passed, as if the citizen clicked through to Security. */
  async function readyToCreate(page: RegisterPage): Promise<void> {
    page.registeredAs = 'business';
    page.firstName = 'Juan';
    page.lastName = 'Dela Cruz';
    page.dateOfBirth = '1990-05-12';
    page.sex = 'Male';
    page.civilStatus = 'Married';
    page.email = 'juan@example.com';
    page.emailVerified.set(true);
    page.mobileNumber = '09171234567';
    page.street = 'Purok 3';
    page.barangay = 'Poblacion';
    page.idDraft.idType.set('UMID');
    page.idDraft.idNumber.set('0111-2222333-4');
    await page.idDraft.choose('front', png());
    page.password = PASSWORD;
    page.confirmPassword = PASSWORD;
    page.acceptedTerms = true;
    page.acceptedPrivacy = true;
    page.step.set(5);
  }

  function spies() {
    const auth = TestBed.inject(AuthService);
    return {
      register: vi.spyOn(auth, 'register').mockResolvedValue({ ok: true }),
      login: vi.spyOn(auth, 'login').mockResolvedValue({ ok: true }),
      submitVerification: vi.spyOn(auth, 'submitVerification').mockResolvedValue({ ok: true }),
      navigate: vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true),
    };
  }

  it('opens on the applicant type, and needs a choice before going on', () => {
    const page = render();
    expect(page.step()).toBe(1);

    page.toPersonal();
    expect(page.step()).toBe(1);
    expect(page.error()).toContain('Choose what you will apply for');

    page.registeredAs = 'both';
    page.toPersonal();
    expect(page.step()).toBe(2);
    expect(page.error()).toBeNull();
  });

  it('the Valid ID step needs the ID type, its number and a photo of the front; the back is optional', async () => {
    const page = render();
    page.step.set(4);

    page.toSecurity();
    expect(page.step()).toBe(4);
    expect(page.error()).toContain('type of ID');

    page.idDraft.idType.set('Passport');
    page.idDraft.idNumber.set('P1');
    page.toSecurity();
    expect(page.error()).toContain('ID number');

    page.idDraft.idNumber.set('P1234567A');
    page.toSecurity();
    expect(page.error()).toContain('front');

    await page.idDraft.choose('front', png());
    expect(page.idDraft.front()?.preview).toMatch(/^data:image\/png;base64,/);
    page.toSecurity();
    expect(page.step()).toBe(5);
    expect(page.idDraft.back()).toBeNull();
  });

  it('refuses a PDF, or a photo over 8 MB, and keeps neither', async () => {
    const page = render();
    await page.idDraft.choose('front', new File(['%PDF-1.7'], 'id.pdf', { type: 'application/pdf' }));
    expect(page.idDraft.front()).toBeNull();
    expect(page.idDraft.photoError()).toContain('JPEG or PNG');

    const huge = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' });
    await page.idDraft.choose('front', huge);
    expect(page.idDraft.front()).toBeNull();
    expect(page.idDraft.photoError()).toContain('8 MB');
  });

  it('Create Account registers with the applicant type, signs in with the same email and password, sends the ID, then shows success', async () => {
    const page = render();
    const s = spies();
    await readyToCreate(page);

    await page.submit();

    expect(s.register).toHaveBeenCalledTimes(1);
    expect(s.register.mock.calls[0][3]).toBe('business');
    expect(s.login).toHaveBeenCalledWith('juan@example.com', PASSWORD);
    expect(s.submitVerification).toHaveBeenCalledTimes(1);
    const sent = s.submitVerification.mock.calls[0][0];
    expect(sent.idType).toBe('UMID');
    expect(sent.idNumber).toBe('0111-2222333-4');
    expect(sent.front.fileName).toBe('id-front.png');
    expect(sent.front.contentBase64).toBe(btoa(String.fromCharCode(...PNG_BYTES)));
    expect(sent.back).toBeNull();
    expect(s.navigate).toHaveBeenCalledWith(['/registration-success']);
    expect(page.error()).toBeNull();
  });

  it('still shows success when the automatic sign-in fails, and sends no ID', async () => {
    // The success page then tells them to sign in and upload the ID under
    // Profile. The same whatever the reason the sign-in failed, so nothing
    // here says whether the email was already registered.
    const page = render();
    const s = spies();
    s.login.mockResolvedValue({ ok: false, error: 'Check your email and password and try again' });
    await readyToCreate(page);

    await page.submit();

    expect(s.submitVerification).not.toHaveBeenCalled();
    expect(s.navigate).toHaveBeenCalledWith(['/registration-success']);
    expect(page.error()).toBeNull();
  });

  it('still shows success when sending the ID fails', async () => {
    const page = render();
    const s = spies();
    s.submitVerification.mockResolvedValue({ ok: false, error: 'Upload a photo of the ID (JPEG or PNG), not a PDF.' });
    await readyToCreate(page);

    await page.submit();

    expect(s.navigate).toHaveBeenCalledWith(['/registration-success']);
    expect(page.error()).toBeNull();
  });

  it('a refused registration stays on the form with the reason, and signs nothing in', async () => {
    const page = render();
    const s = spies();
    s.register.mockResolvedValue({ ok: false, error: 'This password has appeared in a data breach.' });
    await readyToCreate(page);

    await page.submit();

    expect(page.error()).toBe('This password has appeared in a data breach.');
    expect(s.login).not.toHaveBeenCalled();
    expect(s.navigate).not.toHaveBeenCalled();
  });
});
