import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { RequirementsModalComponent } from './requirements-modal.component';
import { CitizenApiClient } from '../../core/api/citizen-api.client';
import { PermitRequirementsResponse } from '../../core/api/citizen-api.models';
import { documentsFor, hardCopiesText } from '../../core/domain/requirements-catalog';

/**
 * The requirements window (LGU initial findings, 4 Nov 2026; ebpco-api 071;
 * design review I13): the documents in two sections, Required then If
 * applicable, with live counts; one "online only" line under the tabs, and a
 * "Hard copies: n" chip only on a document that needs paper, with the LGU's
 * note under it. The static fallback says the same until the live checklist
 * answers. Escape closes it; the tabs move with the arrow keys.
 */
const BFP_NOTE = 'The BFP requires a hard copy. Submit it at the Castilla Fire Station.';

function render(answer: (action?: string, applyingAs?: string) => Observable<PermitRequirementsResponse>) {
  const calls: Array<[string, string | undefined, string | undefined]> = [];
  TestBed.configureTestingModule({
    imports: [RequirementsModalComponent],
    providers: [{
      provide: CitizenApiClient,
      useValue: {
        getRequirementsForPermitType: (type: string, action?: string, applyingAs?: string) => {
          calls.push([type, action, applyingAs]);
          return answer(action, applyingAs);
        },
      },
    }],
  });
  const fixture = TestBed.createComponent(RequirementsModalComponent);
  fixture.componentRef.setInput('permitType', 'Building Permit');
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const rows = () => Array.from(el.querySelectorAll('.req-modal-item')) as HTMLElement[];
  const row = (label: string) => rows().find((r) => r.querySelector('.req-modal-name')?.textContent?.includes(label))!;
  const sections = () => Array.from(el.querySelectorAll('.req-modal-group')).map((g) => ({
    title: g.querySelector('.req-modal-group-title')?.textContent?.trim(),
    names: Array.from(g.querySelectorAll('.req-modal-name')).map((n) => n.textContent?.trim()),
  }));
  return { fixture, el, rows, row, sections, calls };
}

const LIVE: PermitRequirementsResponse = {
  permitType: 'Building Permit',
  documents: [
    { code: 'bpnc-fire-safety-clearance', label: 'Fire Safety Evaluation Clearance', description: '', required: true, hardCopies: 1, hardCopyNote: BFP_NOTE },
    { code: 'bpnc-road-clearance', label: 'Road Clearance', description: 'Only if the project is along a national road.', required: false, hardCopies: 0, hardCopyNote: null },
    { code: 'bpnc-design-plans', label: 'Design Plans (duly signed and sealed)', description: '', required: true, hardCopies: 3, hardCopyNote: null },
    { code: 'bpnc-soil', label: 'Soil Analysis', description: 'Only if applicable: when the structural design calls for it.', required: false, hardCopies: 0, hardCopyNote: null },
    { code: 'business-signatory-authority', label: 'Authority to sign for the business', description: '', required: false, applicantKind: 'business', hardCopies: 0, hardCopyNote: null },
  ],
};

describe('RequirementsModalComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('lists Required, then If applicable, with counts, and the business-only rows under their own heading', () => {
    const { el, sections, calls } = render(() => of(LIVE));
    expect(sections()).toEqual([
      { title: 'Required (2)', names: ['Fire Safety Evaluation Clearance', 'Design Plans (duly signed and sealed)'] },
      { title: 'If applicable (3)', names: ['Road Clearance', 'Soil Analysis', 'Authority to sign for the business'] },
    ]);
    expect(el.querySelector('.req-modal-subtitle')?.textContent?.trim()).toBe('Business applications only');
    // Asked as a business applies, so the business's own row comes back.
    expect(calls).toContainEqual(['Building Permit', 'New', 'business']);
    expect(el.textContent).not.toContain('Optional');
  });

  it('says "online only" once, and marks only the documents that need paper, with the LGU note verbatim', () => {
    const { el, row } = render(() => of(LIVE));
    expect(el.querySelector('.req-modal-note')?.textContent?.trim()).toBe('Upload everything online. Paper copies only where marked.');
    expect(el.textContent).not.toContain('Online only, no hard copy');
    const fire = row('Fire Safety Evaluation Clearance');
    expect(fire.querySelector('.badge')?.textContent?.trim()).toBe('Hard copies: 1');
    expect(fire.textContent).toContain(BFP_NOTE);
    expect(row('Design Plans').querySelector('.badge')?.textContent?.trim()).toBe('Hard copies: 3');
    expect(row('Road Clearance').querySelector('.badge')).toBeNull();
    // The name over its description; the description never repeats "If applicable".
    expect(row('Soil Analysis').querySelector('.req-modal-desc')?.textContent?.trim()).toBe('When the structural design calls for it.');
  });

  it('puts the "online only" line on its own row under the tabs, and only the list gives way to a long checklist', () => {
    const { el } = render(() => of(LIVE));
    const dialog = el.querySelector('[role="dialog"]')!;
    // Head, tabs, note, list, foot: the note is neither in the tablist nor in the scrolling list.
    expect(Array.from(dialog.children).map((c) => c.classList[0]))
      .toEqual(['req-modal-head', 'req-modal-tabs', 'req-modal-note', 'req-modal-body', 'req-modal-foot']);
    expect(el.querySelector('[role="tablist"] .req-modal-note')).toBeNull();
    // It half-covered the tabs once the column squeezed them (demo recording, 5 Nov 2026).
    for (const part of ['.req-modal-head', '.req-modal-tabs', '.req-modal-note', '.req-modal-foot']) {
      expect(getComputedStyle(el.querySelector(part)!).flexShrink, part).toBe('0');
    }
  });

  it('says the same from the static checklist when the live one cannot be read', () => {
    const { row, sections } = render(() => throwError(() => new Error('offline')));
    expect(sections().map((s) => s.title?.replace(/ \(\d+\)$/, ''))).toEqual(['Required', 'If applicable']);
    expect(row('Road Clearance').querySelector('.badge')).toBeNull();
    const fire = row('Fire Safety Evaluation Clearance');
    expect(fire.textContent).toContain('Hard copies: 1');
    expect(fire.textContent).toContain(BFP_NOTE);
  });

  it('is a dialog a keyboard can use: focus on Close, Escape closes, the tabs move with the arrow keys', () => {
    const { fixture, el } = render(() => of(LIVE));
    const closed: unknown[] = [];
    fixture.componentInstance.close.subscribe(() => closed.push(true));
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close');

    const tabs = Array.from(el.querySelectorAll<HTMLElement>('[role="tab"]'));
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['New', 'Renewal', 'Amendment']);
    expect(tabs.map((t) => t.getAttribute('aria-controls'))).toEqual(['req-panel', 'req-panel', 'req-panel']);
    expect(el.querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe('req-tab-New');

    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs[1]);
    expect(el.querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe('req-tab-Renewal');

    el.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed.length).toBe(1);
  });

  it('starts an application of the type and the tab being read', () => {
    const { fixture, el } = render(() => of(LIVE));
    const started: string[] = [];
    fixture.componentInstance.start.subscribe((a: string) => started.push(a));
    el.querySelectorAll<HTMLElement>('[role="tab"]')[1].click();
    fixture.detectChanges();
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Start Application')!.click();
    expect(started).toEqual(['Renewal']);
  });
});

describe('requirements catalog (static fallback, ebpco-api 071)', () => {
  it('no longer requires the four if-applicable Building Permit documents, nor the Amendment added-load analysis', () => {
    const newDocs = documentsFor('Building Permit', 'New');
    const byId = (id: string) => newDocs.find((d) => d.id === id)!;
    for (const id of ['bpnc-structural-design-analysis', 'bpnc-soil-analysis', 'bpnc-construction-safety-health', 'bpnc-road-clearance']) {
      expect(byId(id).required).toBe(false);
    }
    expect(byId('bpnc-road-clearance').description)
      .toBe('Issued by DPWH or the Provincial Engineering Office. Only if the project is along, or opens onto, a national or provincial road.');
    expect(byId('bpnc-construction-safety-health').description).toBe(
      'Not required for the building permit since NBCDO Memorandum Circular No. 02, s. 2026. Your contractor files the CSHP '
      + 'with DOLE before construction starts; attach the approved CSHP here only if you already have it.',
    );
    // Still required: everything else the LGU did not mention.
    expect(byId('bpnc-survey-plan').required).toBe(true);

    const addedLoad = documentsFor('Building Permit', 'Amendment').find((d) => d.id === 'addition-struct-plan')!;
    expect(addedLoad.required).toBe(false);
    // No "Only if applicable:" before it: the section already says so (design review I13).
    expect(addedLoad.description).toBe('When the added load needs structural computations, as the Office of the Building Official advises.');
  });

  it('gives the BFP documents one hard copy with the note, and everything else none', () => {
    const fire = documentsFor('Building Permit', 'New').find((d) => d.id === 'bpnc-fire-safety-clearance')!;
    expect([fire.hardCopies, fire.hardCopyNote]).toEqual([1, BFP_NOTE]);
    expect(documentsFor('Building Permit', 'Renewal').find((d) => d.id === 'fsec')?.hardCopies).toBe(1);
    expect(documentsFor('Certificate of Occupancy', 'New').find((d) => d.id === 'coo-fsic')?.hardCopies).toBe(1);
    const survey = documentsFor('Building Permit', 'New').find((d) => d.id === 'bpnc-survey-plan')!;
    expect([survey.hardCopies, survey.hardCopyNote]).toEqual([0, null]);
    // A chip only where paper is needed; "online only" is said once, above the list.
    expect(hardCopiesText(survey.hardCopies)).toBeNull();
    expect(hardCopiesText(undefined)).toBeNull();
    expect(hardCopiesText(2)).toBe('Hard copies: 2');
  });
});
