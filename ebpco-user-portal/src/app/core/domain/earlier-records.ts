import { EarlierPermit, RecordClaim } from '../api/citizen-api.models';
import { Business } from './business.model';
import { FILEABLE_PERMIT_TYPES, PermitType } from './permit.model';

/**
 * Records before eBPCO (ebpco-api migration 069): the permits the
 * Municipality issued on paper and the businesses it registered before eBPCO,
 * imported from its registers and matched to a citizen's account by an
 * officer. The citizen sees them labelled, never mixed in with the
 * applications they filed through eBPCO.
 */
export const BEFORE_EBPCO_LABEL = 'Issued before eBPCO';
/** A business is registered, not issued: its badge says so. */
export const REGISTERED_BEFORE_EBPCO_LABEL = 'Registered before eBPCO';

/** Said once over the citizen's earlier permits: there is nothing to track, download or print. */
export const BEFORE_EBPCO_NOTE =
  "Issued on paper before eBPCO. Keep your paper permit; this is the Municipality's register record.";

/** Today's date in Castilla (Asia/Manila), YYYY-MM-DD, whatever the device's own time zone. */
export function manilaToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * Valid or Expired by the date the register gives; null when it gives none.
 * The last day itself still counts as Valid.
 */
export function earlierPermitStanding(validUntil: string | null, today: string): 'Valid' | 'Expired' | null {
  if (!validUntil) return null;
  return validUntil.slice(0, 10) >= today ? 'Valid' : 'Expired';
}

/** A permit type eBPCO still files, so the earlier permit can be renewed through the application wizard. */
export function canRenewEarlierPermit(permitType: string): permitType is PermitType {
  return (FILEABLE_PERMIT_TYPES as readonly string[]).includes(permitType);
}

/**
 * The business an earlier permit was issued for, to preselect it for a
 * renewal: the one the server names (`businessId`), when it is still on the
 * account; from an older server, the one business that also came from the
 * register under that same name. The server's renewal check is still the judge.
 */
export function businessForEarlierPermit(
  permit: Pick<EarlierPermit, 'businessName' | 'businessId'>, businesses: readonly Business[],
): string | null {
  if (permit.businessId) return businesses.some((b) => b.id === permit.businessId) ? permit.businessId : null;
  const name = permit.businessName?.trim().toLowerCase();
  if (!name) return null;
  const matches = businesses.filter((b) => b.importedBeforeEbpco === true && b.name.trim().toLowerCase() === name);
  return matches.length === 1 ? matches[0].id : null;
}

/** The chip on a "Find my earlier permits" request. */
export const CLAIM_STATUS: Readonly<Record<RecordClaim['status'], { label: string; badge: string }>> = {
  pending: { label: 'Waiting', badge: 'badge-amber' },
  confirmed: { label: 'Confirmed', badge: 'badge-green' },
  rejected: { label: 'Not confirmed', badge: 'badge-gray' },
};
