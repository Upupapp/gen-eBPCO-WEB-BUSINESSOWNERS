import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { EMPTY, Subject, of } from 'rxjs';
import { ApplicationDetailsPage } from './application-details.page';
import { CitizenApiClient } from '../../core/api/citizen-api.client';
import {
  ApplicationDocumentResponse, ApplicationSummary, PermitRelease, PermitResponse,
} from '../../core/api/citizen-api.models';
import { ToastService } from '../../shared/ui/toast.service';
import { ApplicationStore } from '../../core/stores/application.store';
import { DELIVERY_FEE_NOTE, PermitDeliveryState } from '../../core/domain/permit-delivery';

/**
 * A citizen's own real, backend-uploaded document must actually open when they
 * click "Preview".
 *
 * `onPreview` used to look the clicked document up in the LOCAL DEMO store
 * (`ApplicationStore.documentsFor`) unconditionally, even once
 * `GET /applications/{id}/documents` had already populated `realDocuments()`.
 * A real document's id is a server-generated UUID that never matches anything
 * in the demo store, so the lookup always missed, `previewing` was set to
 * `null`, and the preview modal simply never opened — no error, no toast,
 * nothing a citizen could act on.
 */
describe('ApplicationDetailsPage — previewing a real, backend-uploaded document', () => {
  const REAL_DOC: ApplicationDocumentResponse = {
    id: 'real-doc-1',
    label: 'Land Title',
    fileName: 'land-title.pdf',
    contentType: 'application/pdf',
    byteSize: '11',
    sha256: 'deadbeef',
    uploadedAt: '2026-09-01T00:00:00.000Z',
    expiresOn: null,
    reviewStatus: null,
    reviewedAt: null,
    reviewReason: null,
  } as ApplicationDocumentResponse;

  function render(api: Partial<CitizenApiClient>) {
    TestBed.configureTestingModule({
      imports: [ApplicationDetailsPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'app-real-1' }) } } },
        { provide: CitizenApiClient, useValue: api },
      ],
    });
    return TestBed.createComponent(ApplicationDetailsPage).componentInstance;
  }

  const baseApi: Partial<CitizenApiClient> = {
    configured: true,
    listDocuments: () => of([REAL_DOC]),
    getTimeline: () => EMPTY,
    getInstructions: () => of([]),
    getPermit: () => EMPTY,
    getRequirementsForPermitType: () => EMPTY,
  } as Partial<CitizenApiClient>;

  afterEach(() => TestBed.resetTestingModule());

  it('fetches the real signed content and shows the actual file, not a silent no-op', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 9, 9]);
    const page = render({
      ...baseApi,
      getDocumentContent: () => of({ url: 'https://signed.example/land-title.pdf' }),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(bytes, { status: 200 })) as typeof fetch;
    try {
      await (page as unknown as { onPreview(d: ApplicationDocumentResponse): Promise<void> }).onPreview(REAL_DOC);
    } finally {
      globalThis.fetch = originalFetch;
    }

    const previewing = (page as unknown as { previewing(): { file: File | null; fileName: string } | null }).previewing();
    expect(previewing).not.toBeNull();
    expect(previewing!.fileName).toBe('land-title.pdf');
    expect(previewing!.file).toBeInstanceOf(File);
    const readBack = new Uint8Array(await previewing!.file!.arrayBuffer());
    expect(Array.from(readBack)).toEqual(Array.from(bytes));
  });

  it('reports a real failure with a toast rather than silently doing nothing', async () => {
    const page = render({
      ...baseApi,
      getDocumentContent: () => { throw new Error('network down'); },
    });
    const toasts = TestBed.inject(ToastService);

    await (page as unknown as { onPreview(d: ApplicationDocumentResponse): Promise<void> }).onPreview(REAL_DOC);

    expect(toasts.toasts().some((t) => t.kind === 'error')).toBe(true);
  });
});

/**
 * An application the office returned for changes can go back to it.
 *
 * It used to sit at Revision Required for good: the only way back was
 * answering a Letter of Instruction, which the backend never issues, and
 * replacing the returned document changed nothing on its own.
 */
describe('ApplicationDetailsPage — sending a returned application back to the office', () => {
  const doc = (over: Partial<ApplicationDocumentResponse>): ApplicationDocumentResponse => ({
    id: 'doc', label: 'Survey Plan', fileName: 'plan.pdf', contentType: 'application/pdf', byteSize: '11',
    sha256: 'x', uploadedAt: '2026-09-27T00:00:00.000Z', expiresOn: null, reviewStatus: null, reviewedAt: null,
    reviewReason: null, supersedesDocumentId: null, supersededByDocumentId: null, ...over,
  } as ApplicationDocumentResponse);

  const RETURNED = doc({ id: 'returned', reviewStatus: 'Revision Required' });
  const REPLACED_ORIGINAL = doc({ id: 'returned', reviewStatus: 'Revision Required', supersededByDocumentId: 'new' });
  const REPLACEMENT = doc({ id: 'new', supersedesDocumentId: 'returned' });
  const ACCEPTED = doc({ id: 'title', label: 'Land Title', reviewStatus: 'Accepted' });

  interface Testable {
    returnedNotReplaced(): ApplicationDocumentResponse[];
    returnedNotReplacedNames(): string;
    sendBack(id: string): Promise<void>;
  }

  function render(docs: ApplicationDocumentResponse[], extra: Partial<CitizenApiClient> = {}) {
    TestBed.configureTestingModule({
      imports: [ApplicationDetailsPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'app-real-1' }) } } },
        {
          provide: CitizenApiClient,
          useValue: {
            configured: true,
            listDocuments: () => of(docs),
            getTimeline: () => EMPTY,
            getPermit: () => EMPTY,
            getRequirementsForPermitType: () => EMPTY,
            listApplications: () => of({ data: [], nextCursor: null }),
            getInstructions: () => of([]),
            ...extra,
          } as Partial<CitizenApiClient>,
        },
      ],
    });
    return TestBed.createComponent(ApplicationDetailsPage).componentInstance as unknown as Testable;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('names the returned document that still needs replacing', () => {
    const page = render([RETURNED, ACCEPTED]);

    expect(page.returnedNotReplaced().map((d) => d.id)).toEqual(['returned']);
    expect(page.returnedNotReplacedNames()).toBe('Survey Plan');
  });

  it('counts nothing outstanding once the returned document has a replacement', () => {
    const page = render([REPLACED_ORIGINAL, REPLACEMENT, ACCEPTED]);

    expect(page.returnedNotReplaced()).toEqual([]);
  });

  it('sends it back through POST /applications/{id}/resubmit and says so', async () => {
    const calls: string[] = [];
    const page = render([REPLACED_ORIGINAL, REPLACEMENT], {
      sendBackToOffice: (id: string) => { calls.push(id); return of({ status: 'Under Evaluation', version: 7 }); },
    });
    const toast = TestBed.inject(ToastService);
    const said: string[] = [];
    toast.success = (m: string) => { said.push(m); };

    await page.sendBack('app-real-1');

    expect(calls).toEqual(['app-real-1']);
    expect(said.join(' ')).toMatch(/sent back to the office/i);
  });
});

/**
 * Permit delivery (migration 070): the application page reads how the permit
 * reaches the citizen, and a permit on its way is not "ready to collect".
 */
describe('ApplicationDetailsPage — receiving the permit', () => {
  const summary = (lifecycleStatus: string): ApplicationSummary => ({
    id: 'app-real-1', referenceNumber: 'E-BPCO-2026-000010', serviceDomain: 'Construction Permit',
    permitType: 'Fencing Permit', applicationAction: 'New', businessId: null, businessName: null, location: 'Rizal St.',
    renewsPermitNumber: null, priorPermitClaim: null, lifecycleStatus, applicantStatus: 'Ready for Release',
    requiresApplicantAction: false, dateSubmitted: '2026-10-20T00:00:00.000Z', updatedAt: '2026-11-03T00:00:00.000Z',
    openInstructionCount: 0, form: {}, payment: { status: 'Paid' },
  });

  const onItsWay: PermitDeliveryState = {
    receiveBy: 'delivery', canChange: false, canConfirmReceipt: true, feeNote: DELIVERY_FEE_NOTE,
    delivery: {
      status: 'out-for-delivery', recipientName: 'Juan Dela Cruz', recipientMobile: '09171234567', addressLine: 'Rizal St.',
      barangay: 'Poblacion', city: 'Castilla', province: 'Sorsogon', postalCode: null, landmark: null,
      requestedAt: '2026-11-01T00:00:00.000Z', courier: 'LBC Express', trackingNumber: 'LBC123', sentOn: '2026-11-03',
      deliveredOn: null, proofReference: null, receivedAt: null, closedAt: null, closeNote: null, returnedAt: null,
      returnReason: null, closableFrom: null,
    },
  };

  const permit = (release: PermitRelease) => ({
    permitNumber: 'FP-2026-000001', issuedDate: '2026-11-02', conditions: [], release,
  }) as unknown as PermitResponse;

  afterEach(() => TestBed.resetTestingModule());

  it('reads the delivery, shows the courier card, and never says "Ready to collect"', async () => {
    const asked: string[] = [];
    TestBed.configureTestingModule({
      imports: [ApplicationDetailsPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'app-real-1' }) } } },
        {
          provide: CitizenApiClient,
          useValue: {
            configured: true,
            listApplications: () => of({ data: [summary('Out for Delivery')], nextCursor: null }),
            listDocuments: () => of([]),
            getTimeline: () => EMPTY,
            getInstructions: () => of([]),
            getRequirementsForPermitType: () => EMPTY,
            getPermit: () => of(permit({
              status: 'Ready for Release', method: null, releasedAt: null,
              claimLocation: 'Delivered by courier', officeHours: 'Not applicable: delivered by courier', bringWithYou: [],
            })),
            getDelivery: (id: string) => { asked.push(id); return of(onItsWay); },
          } as Partial<CitizenApiClient>,
        },
      ],
    });
    const fixture = TestBed.createComponent(ApplicationDetailsPage);
    // Signed out, the store's own effect empties its list on the first pass;
    // the list is loaded after it, as a sign-in would.
    fixture.detectChanges();
    await TestBed.inject(ApplicationStore).refreshMine();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(asked).toEqual(['app-real-1']);
    expect(text).toContain('Out for Delivery');
    expect(text).toContain('Your permit is on its way by courier. Confirm here when you receive it.');
    expect(text).toContain('Receiving your permit');
    expect(text).toContain('LBC123');
    expect(text).toContain('Delivered by courier');
    expect(text).not.toContain('Ready to collect');
    expect(text).not.toContain('Where:');
    expect((fixture.nativeElement as HTMLElement).querySelector('#delivery-received')).not.toBeNull();
  });

  it('says nothing about the permit until it is read: never "No permit has been issued" on an issued one', async () => {
    const permitAnswer = new Subject<PermitResponse>();
    const deliveryAnswer = new Subject<PermitDeliveryState>();
    TestBed.configureTestingModule({
      imports: [ApplicationDetailsPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'app-real-1' }) } } },
        {
          provide: CitizenApiClient,
          useValue: {
            configured: true,
            listApplications: () => of({ data: [summary('Out for Delivery')], nextCursor: null }),
            listDocuments: () => of([]),
            getTimeline: () => EMPTY,
            getInstructions: () => of([]),
            getRequirementsForPermitType: () => EMPTY,
            getPermit: () => permitAnswer,
            getDelivery: () => deliveryAnswer,
          } as Partial<CitizenApiClient>,
        },
      ],
    });
    const fixture = TestBed.createComponent(ApplicationDetailsPage);
    fixture.detectChanges();
    await TestBed.inject(ApplicationStore).refreshMine();
    fixture.detectChanges();
    const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text()).toContain('Checking your permit');
    expect(text()).not.toContain('No permit has been issued');
    expect(text()).not.toContain('Not yet ready to collect');

    // The permit alone is not enough: whether it says "Delivered by courier" waits on the delivery.
    permitAnswer.next(permit({ status: 'Ready for Release', method: null, releasedAt: null }));
    fixture.detectChanges();
    expect(text()).toContain('Checking your permit');

    deliveryAnswer.next(onItsWay);
    fixture.detectChanges();
    expect(text()).not.toContain('Checking your permit');
    expect(text()).toContain('FP-2026-000001');
    expect(text()).toContain('Delivered by courier');
  });
});
