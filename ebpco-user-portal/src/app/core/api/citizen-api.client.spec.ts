import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { CitizenApiClient, isOverResubmitLimit, newIdempotencyKey } from './citizen-api.client';
import { API_BASE_URL, ApiNotConfiguredError, RESUBMIT_MAX_FILE_BYTES } from './api-config';
import { ApiError } from './problem';
import { CONTRACT_SAMPLES } from './contract-samples.fixture';
import {
  GcashCheckoutStart, PaymentMethodOption, PermitRequirementsResponse, PermitTypesResponse, RequirementsChecklistResponse,
} from './citizen-api.models';

const BASE = 'https://api.example.gov.ph';
const APP = '00000000-0000-4000-8000-000000000000';

/**
 * Decodes the backend's OWN RECORDED RESPONSES — real bytes from the real
 * controllers over real PostgreSQL, copied from contract/response-samples.json.
 * A client tested against shapes we invented would prove only that we are
 * self-consistent.
 */
describe('CitizenApiClient against the recorded contract samples', () => {
  let api: CitizenApiClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: BASE }],
    });
    api = TestBed.inject(CitizenApiClient);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  it('decodes a permit, keeping conditions as a list', () => {
    let got: unknown;
    api.getPermit(APP).subscribe((p) => (got = p));
    http.expectOne(`${BASE}/applications/${APP}/permit`).flush(CONTRACT_SAMPLES['applicant.applications.permit'].body);
    const p = got as { conditions: string[]; release: { status: string } | null; scope: string | null };
    expect(Array.isArray(p.conditions)).toBe(true);
    expect(p.conditions[0]).toContain('1.5m setback');
    expect(p.release?.status).toBe('Ready for Release');
  });

  it('treats release: null as a fact, not a missing value', () => {
    // Both branches are recorded server-side. Null means "not yet ready to
    // collect" — a client that reads it as "no data" contradicts a deliberate
    // answer.
    let got: { release: unknown } | undefined;
    api.getPermit(APP).subscribe((p) => (got = p));
    http.expectOne(`${BASE}/applications/${APP}/permit`)
      .flush(CONTRACT_SAMPLES['applicant.applications.permit.beforeRelease'].body);
    expect(got).toBeTruthy();
    expect('release' in (got as object)).toBe(true);   // present…
    expect(got!.release).toBeNull();                    // …and null
  });

  it('decodes documents as a bare array and keeps byteSize a STRING', () => {
    let got: { byteSize: unknown; reviewStatus: unknown }[] = [];
    api.listDocuments(APP).subscribe((d) => (got = d as never));
    http.expectOne(`${BASE}/applications/${APP}/documents`)
      .flush(CONTRACT_SAMPLES['applicant.applications.documents'].body);
    expect(Array.isArray(got)).toBe(true);
    // bigint column: a JSON number would lose precision, so it must stay a string.
    expect(typeof got[0].byteSize).toBe('string');
    // NULL MEANS NOBODY HAS LOOKED YET — never a pass.
    expect(got[0].reviewStatus).toBeNull();
  });

  it('sends the Idempotency-Key header on resubmit', () => {
    const key = newIdempotencyKey();
    api.resubmitDocument(APP, APP, { fileName: 'f.pdf', label: 'Lot plan', contentBase64: 'AAA' }, key).subscribe();
    const req = http.expectOne(`${BASE}/applications/${APP}/documents/${APP}/resubmit`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Idempotency-Key')).toBe(key);
    req.flush(CONTRACT_SAMPLES['applicant.applications.resubmitDocument'].body, { status: 201, statusText: 'Created' });
  });

  it('surfaces a problem+json detail to the citizen', () => {
    let err: ApiError | undefined;
    api.getPermit(APP).subscribe({ error: (e) => (err = e) });
    http.expectOne(`${BASE}/applications/${APP}/permit`)
      .flush(CONTRACT_SAMPLES['problem.notFound'].body, { status: 404, statusText: 'Not Found' });
    expect(err).toBeInstanceOf(ApiError);
    expect(err!.bare).toBe(false);
    expect(err!.citizenMessage.length).toBeGreaterThan(0);
  });

  it('survives a BARE 413, which is not a problem document', () => {
    // The adapter rejects an oversized body before any controller runs, so
    // there is no `detail` to read. Code that assumed one would show nothing.
    let err: ApiError | undefined;
    api.resubmitDocument(APP, APP, { fileName: 'f.pdf', label: 'L', contentBase64: 'A' }, newIdempotencyKey())
      .subscribe({ error: (e) => (err = e) });
    http.expectOne(`${BASE}/applications/${APP}/documents/${APP}/resubmit`)
      .flush('Payload Too Large', { status: 413, statusText: 'Payload Too Large' });
    expect(err!.bare).toBe(true);
    expect(err!.citizenMessage).toContain('too large');
  });
});

describe('CitizenApiClient: who may apply for each permit type (migration 068)', () => {
  let api: CitizenApiClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: BASE }],
    });
    api = TestBed.inject(CitizenApiClient);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  it('reads GET /permit-types', () => {
    let got: PermitTypesResponse | undefined;
    api.getPermitTypes().subscribe((r) => (got = r));
    http.expectOne(`${BASE}/permit-types`).flush({ items: [{ permitType: 'Sign Permit', applicantKinds: ['business'] }] });
    expect(got?.items[0].applicantKinds).toEqual(['business']);
  });

  it('asks for the checklist as the chosen kind, and as before when none is given', () => {
    api.getRequirementsForPermitType('Sign Permit', 'New', 'business').subscribe();
    http.expectOne(`${BASE}/requirements/Sign%20Permit?applicationAction=New&applyingAs=business`)
      .flush({ permitType: 'Sign Permit', documents: [] });
    api.getRequirementsForPermitType('Sign Permit', 'New').subscribe();
    http.expectOne(`${BASE}/requirements/Sign%20Permit?applicationAction=New`)
      .flush({ permitType: 'Sign Permit', documents: [] });
    api.getRequirementsForPermitType('Sign Permit').subscribe();
    http.expectOne(`${BASE}/requirements/Sign%20Permit`).flush({ permitType: 'Sign Permit', documents: [] });
  });
});

describe('CitizenApiClient — hard copies, payment methods and the GCash checkout (ebpco-api 071)', () => {
  let api: CitizenApiClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: BASE }],
    });
    api = TestBed.inject(CitizenApiClient);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  const BFP_NOTE = 'The BFP requires a hard copy. Submit it at the Castilla Fire Station.';

  it('keeps each document\'s hard copies, and reads an older server\'s silence as online only', () => {
    let got: PermitRequirementsResponse | undefined;
    api.getRequirementsForPermitType('Building Permit', 'New').subscribe((r) => (got = r));
    http.expectOne(`${BASE}/requirements/Building%20Permit?applicationAction=New`).flush({
      permitType: 'Building Permit',
      documents: [
        { code: 'bpnc-fire-safety-clearance', label: 'FSEC', description: '', required: true, hardCopies: 1, hardCopyNote: BFP_NOTE },
        { code: 'bpnc-survey-plan', label: 'Survey Plan', description: '', required: true },
        { code: 'bpnc-road-clearance', label: 'Road Clearance', description: '', required: false, hardCopies: 0, hardCopyNote: '  ' },
      ],
    });
    expect(got?.documents.map((d) => [d.code, d.hardCopies, d.hardCopyNote])).toEqual([
      ['bpnc-fire-safety-clearance', 1, BFP_NOTE],
      ['bpnc-survey-plan', 0, null],
      ['bpnc-road-clearance', 0, null],
    ]);
  });

  it('does the same for an application\'s own checklist', () => {
    let got: RequirementsChecklistResponse | undefined;
    api.getRequirements(APP).subscribe((r) => (got = r));
    http.expectOne(`${BASE}/applications/${APP}/requirements`).flush({
      requirements: [
        { code: 'coo-fsic', label: 'FSIC', description: '', required: true, documentIds: [], status: 'not-provided', hardCopies: 1, hardCopyNote: BFP_NOTE },
        { code: 'coo-asbuilt', label: 'As-Built Plans', description: '', required: true, documentIds: [], status: 'not-provided' },
      ],
      unattributedDocuments: 0,
      attributionComplete: true,
    });
    expect(got?.requirements.map((r) => [r.hardCopies, r.hardCopyNote])).toEqual([[1, BFP_NOTE], [0, null]]);
  });

  it('reads GET /payment-methods as a bare array', () => {
    let got: PaymentMethodOption[] | undefined;
    api.getPaymentMethods().subscribe((r) => (got = r));
    const methods: PaymentMethodOption[] = [
      { method: 'GCash', label: 'GCash', instructions: 'Pay online with GCash. You are sent to the GCash checkout.', mode: 'test' },
      { method: 'Onsite', label: 'Onsite', instructions: 'Pay at the Municipal Hall.' },
    ];
    http.expectOne(`${BASE}/payment-methods`).flush(methods);
    expect(got).toEqual(methods);
  });

  it('opens a GCash checkout with no body to speak of and no Idempotency-Key', () => {
    let got: GcashCheckoutStart | undefined;
    api.startGcashPayment(APP).subscribe((r) => (got = r));
    const req = http.expectOne(`${BASE}/applications/${APP}/payments/gcash`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    expect(req.request.headers.has('Idempotency-Key')).toBe(false);
    req.flush({
      checkoutId: 'chk-1', reference: 'GC-TEST-AB12CD34EF', amount: 6820.5, amountCentavos: 682050,
      expiresAt: '2026-11-04T08:30:00.000Z', mode: 'test', checkoutUrl: 'https://citizen.example/pay/gcash/chk-1?t=abc',
    }, { status: 201, statusText: 'Created' });
    expect(got?.checkoutUrl).toBe('https://citizen.example/pay/gcash/chk-1?t=abc');
  });

  it('reads and settles a checkout with the link\'s own secret, encoded', () => {
    api.getGcashCheckout('chk-1', 'a+b/c=').subscribe();
    http.expectOne(`${BASE}/payments/gcash/checkouts/chk-1?t=a%2Bb%2Fc%3D`).flush({});

    api.simulateGcashCheckout('chk-1', 'a+b/c=', 'failed').subscribe();
    const req = http.expectOne(`${BASE}/payments/gcash/checkouts/chk-1/simulate?t=a%2Bb%2Fc%3D`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ outcome: 'failed' });
    req.flush({});
  });

  it('hands a refusal over as the server\'s own sentence', () => {
    let error: unknown;
    api.startGcashPayment(APP).subscribe({ error: (e) => (error = e) });
    http.expectOne(`${BASE}/applications/${APP}/payments/gcash`).flush(
      { type: '/problems/unprocessable', title: 'A precondition is unmet', status: 422, detail: 'This application is not waiting for payment.' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).citizenMessage).toBe('This application is not waiting for payment.');
  });
});

describe('CitizenApiClient when no API is configured', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  });
  afterEach(() => TestBed.resetTestingModule());

  // EVERY operation must refuse, not just the one that happened to be tested.
  // A first draft of this suite covered getPermit only, so removing the guard
  // from resubmitDocument changed nothing — the guard was real and the test was
  // blind to it.
  it('refuses on every operation rather than resolving to nothing', () => {
    const api = TestBed.inject(CitizenApiClient);
    expect(api.configured).toBe(false);
    const errs: unknown[] = [];
    api.getPermit(APP).subscribe({ error: (e) => errs.push(e) });
    api.listDocuments(APP).subscribe({ error: (e) => errs.push(e) });
    api
      .resubmitDocument(APP, APP, { fileName: 'f.pdf', label: 'L', contentBase64: 'A' }, newIdempotencyKey())
      .subscribe({ error: (e) => errs.push(e) });
    expect(errs.length).toBe(3);
    for (const e of errs) expect(e).toBeInstanceOf(ApiNotConfiguredError);
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });
});

describe('Resubmission size ceiling', () => {
  it('catches an oversized file before the upload is spent, at the default limit', () => {
    // Measured by the backend (C-8): base64 inflates by a third against a 1MB
    // body limit, so ~750KB of file. A ~400KB PDF is accepted; a ~900KB PDF 413s.
    TestBed.configureTestingModule({});
    const limit = TestBed.inject(RESUBMIT_MAX_FILE_BYTES);
    expect(isOverResubmitLimit({ size: 700_000 }, limit)).toBe(false);
    expect(isOverResubmitLimit({ size: 900_000 }, limit)).toBe(true);
    TestBed.resetTestingModule();
  });

  it('follows the limit a deployment configures, not a hardcoded one', () => {
    // BODY_LIMIT_BYTES is the server's, is configurable, and the backend has
    // filed that it needs raising for production. A client that hardcoded 750KB
    // would then refuse files the server would happily accept.
    TestBed.configureTestingModule({ providers: [{ provide: RESUBMIT_MAX_FILE_BYTES, useValue: 4_000_000 }] });
    const raised = TestBed.inject(RESUBMIT_MAX_FILE_BYTES);
    expect(isOverResubmitLimit({ size: 900_000 }, raised)).toBe(false);
    TestBed.resetTestingModule();
  });

  it('still handles a 413 whatever the client-side limit says', () => {
    // The pre-check is optimistic; the server is the authority.
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(),
                  { provide: API_BASE_URL, useValue: BASE },
                  { provide: RESUBMIT_MAX_FILE_BYTES, useValue: 50_000_000 }],
    });
    const api = TestBed.inject(CitizenApiClient);
    const http = TestBed.inject(HttpTestingController);
    let err: ApiError | undefined;
    api.resubmitDocument(APP, APP, { fileName: 'f.pdf', label: 'L', contentBase64: 'A' }, newIdempotencyKey())
      .subscribe({ error: (e) => (err = e) });
    http.expectOne(`${BASE}/applications/${APP}/documents/${APP}/resubmit`)
      .flush('Payload Too Large', { status: 413, statusText: 'Payload Too Large' });
    expect(err!.citizenMessage).toContain('too large');
    http.verify();
    TestBed.resetTestingModule();
  });
});

/**
 * Records before eBPCO (migration 069): the citizen's routes, and a paper
 * permit number on the public check, which may hold "/" or spaces.
 */
describe('CitizenApiClient: records before eBPCO', () => {
  let api: CitizenApiClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: BASE }],
    });
    api = TestBed.inject(CitizenApiClient);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  it('reads the earlier permits and the requests from /me', () => {
    let permits: unknown;
    let claims: unknown;
    api.listEarlierPermits().subscribe((r) => (permits = r.data));
    api.listRecordClaims().subscribe((r) => (claims = r.data));
    http.expectOne({ method: 'GET', url: `${BASE}/me/earlier-permits` }).flush({ data: [] });
    http.expectOne({ method: 'GET', url: `${BASE}/me/record-claims` }).flush({ data: [] });
    expect(permits).toEqual([]);
    expect(claims).toEqual([]);
  });

  it('sends a claim as given, with no Idempotency-Key', () => {
    const body = { permitNumber: 'CO 2020/0033', dateIssued: null, orNumber: '7781234' };
    api.claimEarlierPermit(body).subscribe();
    const req = http.expectOne({ method: 'POST', url: `${BASE}/me/record-claims` });
    expect(req.request.body).toEqual(body);
    expect(req.request.headers.has('Idempotency-Key')).toBe(false);
    req.flush({ claim: { id: 'c1', ...body, status: 'pending', note: null, createdAt: '2026-10-23T00:00:00.000Z', decidedAt: null } },
      { status: 201, statusText: 'Created' });
  });

  it('encodes a register number with a slash and spaces on the public check', () => {
    api.verifyPermit('CO 2020/0033').subscribe();
    http.expectOne(`${BASE}/public/permits/CO%202020%2F0033`).flush({});
  });
});

/** Permit delivery (migration 070): the three citizen routes. */
describe('CitizenApiClient — permit delivery', () => {
  let api: CitizenApiClient;
  let http: HttpTestingController;
  const STATE = { receiveBy: 'pickup', delivery: null, canChange: true, canConfirmReceipt: false, feeNote: 'x' };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: BASE }],
    });
    api = TestBed.inject(CitizenApiClient);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  it('reads the choice, saves it with PUT, and confirms receipt with an empty POST', () => {
    api.getDelivery(APP).subscribe();
    http.expectOne({ method: 'GET', url: `${BASE}/applications/${APP}/delivery` }).flush(STATE);

    api.setDelivery(APP, { receiveBy: 'pickup' }).subscribe();
    const put = http.expectOne({ method: 'PUT', url: `${BASE}/applications/${APP}/delivery` });
    expect(put.request.body).toEqual({ receiveBy: 'pickup' });
    put.flush(STATE);

    api.confirmPermitReceived(APP).subscribe();
    const post = http.expectOne({ method: 'POST', url: `${BASE}/applications/${APP}/delivery/received` });
    expect(post.request.body).toEqual({});
    post.flush({ ...STATE, lifecycleStatus: 'Completed' });
  });

  it('gives a refusal in the server’s own words', () => {
    let error: unknown;
    api.setDelivery(APP, { receiveBy: 'pickup' }).subscribe({ error: (e) => (error = e) });
    http.expectOne(`${BASE}/applications/${APP}/delivery`).flush(
      { title: 'The resource is not in a state that permits this',
        detail: 'The permit has already left the office, so how it reaches you can no longer change.' },
      { status: 409, statusText: 'Conflict' },
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).citizenMessage).toContain('already left the office');
  });
});
