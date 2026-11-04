import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { RequirementsModalComponent } from './requirements-modal.component';
import { CitizenApiClient } from '../../core/api/citizen-api.client';
import { PermitRequirementsResponse } from '../../core/api/citizen-api.models';
import { documentsFor, hardCopiesText } from '../../core/domain/requirements-catalog';

/**
 * The requirements window (LGU initial findings, 4 Nov 2026; ebpco-api 071):
 * "If applicable" rather than "Optional", and for each document whether paper
 * copies are needed — "Online only, no hard copy", or "Hard copies: n" with
 * the LGU's note under it. The static fallback says the same until the live
 * checklist answers.
 */
const BFP_NOTE = 'The BFP requires a hard copy. Submit it at the Castilla Fire Station.';

function render(answer: () => Observable<PermitRequirementsResponse>) {
  TestBed.configureTestingModule({
    imports: [RequirementsModalComponent],
    providers: [{ provide: CitizenApiClient, useValue: { getRequirementsForPermitType: () => answer() } }],
  });
  const fixture = TestBed.createComponent(RequirementsModalComponent);
  fixture.componentRef.setInput('permitType', 'Building Permit');
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const rows = () => Array.from(el.querySelectorAll('.req-modal-list li')) as HTMLElement[];
  const row = (label: string) => rows().find((r) => r.textContent?.includes(label))!;
  return { el, rows, row };
}

describe('RequirementsModalComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('tags a document "If applicable" and says how many hard copies each needs', () => {
    const { el, row } = render(() => of({
      permitType: 'Building Permit',
      documents: [
        { code: 'bpnc-fire-safety-clearance', label: 'Fire Safety Evaluation Clearance', description: '', required: true, hardCopies: 1, hardCopyNote: BFP_NOTE },
        { code: 'bpnc-road-clearance', label: 'Road Clearance', description: 'Only if the project is along a national road.', required: false, hardCopies: 0, hardCopyNote: null },
        { code: 'bpnc-design-plans', label: 'Design Plans (duly signed and sealed)', description: '', required: true, hardCopies: 3, hardCopyNote: null },
      ],
    }));

    expect(el.textContent).not.toContain('Optional');
    const fire = row('Fire Safety Evaluation Clearance');
    expect(fire.querySelector('.tag')?.textContent?.trim()).toBe('Required');
    expect(Array.from(fire.querySelectorAll('.req-modal-copies')).map((c) => c.textContent?.trim())).toEqual(['Hard copies: 1', BFP_NOTE]);

    const road = row('Road Clearance');
    expect(road.querySelector('.tag')?.textContent?.trim()).toBe('If applicable');
    expect(Array.from(road.querySelectorAll('.req-modal-copies')).map((c) => c.textContent?.trim())).toEqual(['Online only, no hard copy']);

    expect(row('Design Plans').textContent).toContain('Hard copies: 3');
  });

  it('says the same from the static checklist when the live one cannot be read', () => {
    const { row } = render(() => throwError(() => new Error('offline')));
    const road = row('Road Clearance');
    expect(road.querySelector('.tag')?.textContent?.trim()).toBe('If applicable');
    expect(road.textContent).toContain('Online only, no hard copy');
    const fire = row('Fire Safety Evaluation Clearance');
    expect(fire.textContent).toContain('Hard copies: 1');
    expect(fire.textContent).toContain(BFP_NOTE);
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
    expect(addedLoad.description).toContain('Only if applicable');
  });

  it('gives the BFP documents one hard copy with the note, and everything else none', () => {
    const fire = documentsFor('Building Permit', 'New').find((d) => d.id === 'bpnc-fire-safety-clearance')!;
    expect([fire.hardCopies, fire.hardCopyNote]).toEqual([1, BFP_NOTE]);
    expect(documentsFor('Building Permit', 'Renewal').find((d) => d.id === 'fsec')?.hardCopies).toBe(1);
    expect(documentsFor('Certificate of Occupancy', 'New').find((d) => d.id === 'coo-fsic')?.hardCopies).toBe(1);
    const survey = documentsFor('Building Permit', 'New').find((d) => d.id === 'bpnc-survey-plan')!;
    expect([survey.hardCopies, survey.hardCopyNote]).toEqual([0, null]);
    expect(hardCopiesText(survey.hardCopies)).toBe('Online only, no hard copy');
    expect(hardCopiesText(undefined)).toBe('Online only, no hard copy');
    expect(hardCopiesText(2)).toBe('Hard copies: 2');
  });
});
