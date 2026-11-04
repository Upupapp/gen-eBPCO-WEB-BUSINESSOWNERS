import { DEFAULT_BANK_INFO } from './payment.model';
import {
  MUNICIPAL_ENGINEER,
  MUNICIPAL_HALL_ADDRESS,
  MUNICIPAL_TREASURER,
  OFFICES,
  PLANNING_AND_DEVELOPMENT,
} from './lgu-contact';

/**
 * One name per office (design review I5). Copied word for word from the
 * backend's apps/ebpco-api/src/modules/applications/domain/issuing-office.ts;
 * change both together.
 */
describe('OFFICES: one name per office', () => {
  it('names the issuing offices exactly as the backend does', () => {
    expect(OFFICES.buildingOfficial.name).toBe('Office of the Building Official (Municipal Engineering Office)');
    expect(OFFICES.zoning.name).toBe('Municipal Planning and Development Office (Zoning Administrator)');
    expect(OFFICES.buildingOfficial.short).toBe('OBO');
    expect(OFFICES.zoning.short).toBe('MPDO');
  });

  it('sends payments to the Municipal Treasurer\'s Office and its Cashier', () => {
    expect(MUNICIPAL_TREASURER.name).toBe("Municipal Treasurer's Office");
    expect(MUNICIPAL_TREASURER.cashierLabel).toBe('Cashier');
  });
});

/**
 * Guards F-4 and F-7 at the source, so a fabricated value cannot be
 * reintroduced in one screen at a time. Each assertion below names the bundled
 * document the value is transcribed from.
 */
describe('LGU contact details (F-7: sourced, never invented)', () => {
  it('carries the Municipal Engineer details from the bundled BP/Occupancy checklist', () => {
    // assets/LGU Castilla BPCO Forms/Checklist (Building Permit & Occupancy).pdf
    // Named as the issuing office, so the permit and the contact card agree.
    expect(MUNICIPAL_ENGINEER.name).toBe(OFFICES.buildingOfficial.name);
    expect(MUNICIPAL_ENGINEER.mobile).toBe('09054818572');
    expect(MUNICIPAL_ENGINEER.email).toBe('meocastilla@gmail.com');
  });

  it('carries the MPDO details from the bundled zoning checklist', () => {
    // assets/LGU Castilla BPCO Forms/Zoning Checklist.pdf (FM-MPD-12)
    expect(PLANNING_AND_DEVELOPMENT.name).toBe(OFFICES.zoning.name);
    expect(PLANNING_AND_DEVELOPMENT.email).toBe('castillampdo@gmail.com');
    // The form publishes no telephone number, so neither do we.
    expect(PLANNING_AND_DEVELOPMENT.mobile).toBeNull();
  });

  it('names the municipal hall as the zoning form footer writes it', () => {
    expect(MUNICIPAL_HALL_ADDRESS).toBe('Castilla Town Hall, Cumadcad, Castilla, Sorsogon');
  });

  it('holds none of the fabricated values that shipped before', () => {
    const all = JSON.stringify([MUNICIPAL_ENGINEER, PLANNING_AND_DEVELOPMENT, MUNICIPAL_HALL_ADDRESS]);
    for (const invented of ['000-0000', 'ebpco.gov.ph', 'example.com']) {
      expect(all).not.toContain(invented);
    }
  });
});

describe('Bank transfer details (F-4: no placeholder account number)', () => {
  it('is absent until the Municipality publishes a real account', () => {
    // A labelled fake account number can still be copied, and a partially-real
    // one (right bank, wrong number) is the most dangerous form of all.
    expect(DEFAULT_BANK_INFO).toBeNull();
  });
});
