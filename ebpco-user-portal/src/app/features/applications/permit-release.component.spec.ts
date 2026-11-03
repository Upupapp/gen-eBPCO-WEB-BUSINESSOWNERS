import { TestBed } from '@angular/core/testing';
import { PermitReleaseComponent } from './permit-release.component';
import { PermitRelease, PermitResponse } from '../../core/api/citizen-api.models';
import { CONTRACT_SAMPLES } from '../../core/api/contract-samples.fixture';

const READY = CONTRACT_SAMPLES['applicant.applications.permit'].body as unknown as PermitResponse;
const BEFORE = CONTRACT_SAMPLES['applicant.applications.permit.beforeRelease'].body as unknown as PermitResponse;

function render(permitNumber: string | null, release: PermitRelease | null, byCourier = false, loading = false) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [PermitReleaseComponent] });
  const f = TestBed.createComponent(PermitReleaseComponent);
  f.componentRef.setInput('permitNumber', permitNumber);
  f.componentRef.setInput('release', release);
  f.componentRef.setInput('byCourier', byCourier);
  f.componentRef.setInput('loading', loading);
  f.detectChanges();
  return (f.nativeElement as HTMLElement);
}

/**
 * Both `release` branches are RECORDED server-side, so these decode real bytes
 * rather than shapes anyone invented.
 */
describe('PermitRelease — can the citizen collect it? (task 21)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows the permit number, which is what the endpoint exists for', () => {
    // "Before this, a citizen who filed, paid and was approved had no way to
    // learn their permit number."
    const el = render(READY.permitNumber, READY.release);
    expect(el.textContent).toContain('FP-2026-000001');
  });

  it('renders the RECORDED ready branch as collectable, with where to go', () => {
    const el = render(READY.permitNumber, READY.release);
    expect(el.textContent).toContain('Ready to collect');
    expect(el.textContent).toContain('Office of the Municipal Engineer');
    expect(el.querySelector('.release-ready')).toBeTruthy();
  });

  it('renders the RECORDED null branch as a fact, never as missing data', () => {
    // The contract: release is "ALWAYS PRESENT, and null until an officer has
    // prepared the release. Null is a fact to render, not an absent key."
    expect(BEFORE.release).toBeNull();
    const el = render(BEFORE.permitNumber, BEFORE.release);
    expect(el.textContent).toContain('Not yet ready to collect');
    expect(el.textContent).toContain('has not arranged collection');
    // It still shows the permit number: not-collectable is not not-issued.
    expect(el.textContent).toContain('FP-2026-000001');
  });

  it('distinguishes "nobody arranged it" from an officer saying Not Ready', () => {
    const nullText = render('FP-1', null).textContent ?? '';
    const notReady = render('FP-1', { status: 'Not Ready', method: null, releasedAt: null }).textContent ?? '';
    expect(nullText).toContain('has not arranged collection');
    expect(notReady).toContain('has not finished preparing');
    expect(nullText).not.toBe(notReady);
  });

  it('never lets a non-ready state read as collectable', () => {
    for (const r of [null,
                     { status: 'Not Ready' as const, method: null, releasedAt: null },
                     { status: 'Released' as const, method: null, releasedAt: null }]) {
      const el = render('FP-1', r);
      expect(el.querySelector('.release-ready')).toBeNull();
      expect(el.textContent).not.toContain('Ready to collect');
    }
  });

  it('says a representative may collect only when the office said so', () => {
    const rep = render('FP-1', { status: 'Ready for Release', method: 'Authorized Representative', releasedAt: null });
    expect(rep.textContent).toContain('authorised representative');
    expect(rep.textContent).toContain('letter of authorisation');

    const inPerson = render('FP-1', { status: 'Ready for Release', method: 'Physical Claim', releasedAt: null });
    expect(inPerson.textContent).toContain('in person');
    expect(inPerson.textContent).not.toContain('letter of authorisation');
  });

  it('says plainly when no permit has been issued', () => {
    const el = render(null, null);
    expect(el.textContent).toContain('No permit has been issued');
  });

  it('while the permit is still being read, says so and nothing else', () => {
    const el = render(null, null, false, true);
    expect(el.textContent).toContain('Checking your permit');
    expect(el.textContent).not.toContain('No permit has been issued');
    expect(el.textContent).not.toContain('Not yet ready to collect');
  });
});

/**
 * A delivery (migration 070): once sent, the office's release record names
 * where the parcel went ("Delivered by courier"), not a counter to visit.
 * The card must never tell a citizen whose permit is on its way to collect it.
 */
describe('PermitRelease — delivered by courier', () => {
  afterEach(() => TestBed.resetTestingModule());

  const SENT: PermitRelease = {
    status: 'Ready for Release', method: null, releasedAt: null,
    claimLocation: 'Delivered by courier', officeHours: 'Not applicable: delivered by courier', bringWithYou: [],
  };

  it('says Delivery by courier instead of Where, When and Bring, and not "Delivered" before it is', () => {
    const el = render('FP-1', SENT, true);
    expect(el.querySelector('.release-state strong')?.textContent).toBe('Delivery by courier');
    expect(el.textContent).not.toContain('Delivered by courier');
    expect(el.textContent).not.toContain('Where:');
    expect(el.textContent).not.toContain('Bring:');
    expect(el.textContent).not.toContain('Ready to collect');
    expect(el.querySelector('.release-ready')).toBeNull();
  });

  it('says when it was delivered once confirmed', () => {
    const el = render('FP-1', { status: 'Released', method: 'Courier Delivery', releasedAt: '2026-11-05T02:00:00.000Z' }, true);
    expect(el.querySelector('.release-state strong')?.textContent).toBe('Delivered by courier');
    expect(el.textContent).toContain('Delivered on');
    expect(el.textContent).not.toContain('Collected');
  });

  it('gives the claim instructions again once the courier brought it back (byCourier false)', () => {
    const el = render('FP-1', { ...SENT, claimLocation: 'Office of the Municipal Engineer', officeHours: 'Mon–Fri 8–5' }, false);
    expect(el.textContent).toContain('Ready to collect');
    expect(el.querySelector('.claim-rows dt')?.textContent).toBe('Where');
  });
});
