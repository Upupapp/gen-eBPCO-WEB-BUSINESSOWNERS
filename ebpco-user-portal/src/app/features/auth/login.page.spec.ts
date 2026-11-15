import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/session/auth.service';
import { LoginPage } from './login.page';

/**
 * Found by the live check of 15 Nov 2026 (a test citizen signing in on the
 * live Citizen Portal): Enter in the fields did nothing, and the button went
 * back to "Log in" for about 1.5 s while the dashboard loaded, which reads as
 * a click that did nothing.
 */
describe('LoginPage (Enter signs in; "Signing in" lasts until the dashboard)', () => {
  let login: ReturnType<typeof vi.fn>;

  function render() {
    login = vi.fn().mockResolvedValue({ ok: true });
    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [provideRouter([]), { provide: AuthService, useValue: { login } }],
    });
    const fixture = TestBed.createComponent(LoginPage);
    fixture.componentInstance.identifier = 'citizen@castilla.test';
    fixture.componentInstance.password = 'a password';
    fixture.detectChanges();
    return fixture;
  }
  afterEach(() => TestBed.resetTestingModule());

  const button = (el: HTMLElement) => el.querySelector('button.btn-primary') as HTMLButtonElement;

  it('signs in when Enter is pressed in the password field', async () => {
    const fixture = render();
    let arrive!: (value: boolean) => void;
    vi.spyOn(TestBed.inject(Router), 'navigate').mockReturnValue(new Promise<boolean>((resolve) => (arrive = resolve)));
    const password = (fixture.nativeElement as HTMLElement).querySelector('#login-password-2') as HTMLInputElement;
    password.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();
    expect(login).toHaveBeenCalledWith('citizen@castilla.test', 'a password');
    arrive(true);
  });

  it('keeps "Signing in" until the dashboard has opened', async () => {
    const fixture = render();
    let arrive!: (value: boolean) => void;
    vi.spyOn(TestBed.inject(Router), 'navigate').mockReturnValue(new Promise<boolean>((resolve) => (arrive = resolve)));
    const signingIn = fixture.componentInstance.submit();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    // Signed in, dashboard still loading: the button must not say "Log in" yet.
    expect(button(fixture.nativeElement).textContent?.trim()).toBe('Signing in');
    expect(button(fixture.nativeElement).disabled).toBe(true);
    arrive(true);
    await signingIn;
  });

  it('gives the button back when the dashboard could not open', async () => {
    const fixture = render();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(false);
    await fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(button(fixture.nativeElement).textContent?.trim()).toBe('Log in');
  });

  it('gives the button back with the reason when sign-in fails', async () => {
    const fixture = render();
    login.mockResolvedValue({ ok: false, error: 'That email and password do not match.' });
    await fixture.componentInstance.submit();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('That email and password do not match.');
    expect(button(fixture.nativeElement).textContent?.trim()).toBe('Log in');
  });
});
