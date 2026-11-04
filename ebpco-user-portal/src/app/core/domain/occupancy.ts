/**
 * The use or character of occupancy (LGU initial findings, 4 Nov 2026: "step 1
 * is business type, no option for residential, institutional").
 *
 * The National Building Code groups a building by its use, Groups A to J, and
 * the Unified Building Permit form asks for it. Asked on step 1 of a Building
 * Permit or Certificate of Occupancy application, right after "Applying as",
 * and kept in the application's form: `form.occupancyGroup`, plus
 * `form.occupancyOther` for "Others (specify)". The values, labels and
 * messages are the server's (ebpco-api 071, domain/occupancy.ts) and the same
 * in every app: change them there first.
 */
export type OccupancyGroup = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'other';

export const OCCUPANCY_GROUPS: readonly { readonly value: OccupancyGroup; readonly label: string }[] = [
  { value: 'A', label: 'Group A — Residential, Dwellings' },
  { value: 'B', label: 'Group B — Residential Hotel, Apartment' },
  { value: 'C', label: 'Group C — Educational, Recreational' },
  { value: 'D', label: 'Group D — Institutional' },
  { value: 'E', label: 'Group E — Business and Mercantile' },
  { value: 'F', label: 'Group F — Industrial' },
  { value: 'G', label: 'Group G — Industrial Storage and Hazardous' },
  { value: 'H', label: 'Group H — Recreational or Assembly (below 1,000)' },
  { value: 'I', label: 'Group I — Recreational or Assembly (1,000 or more)' },
  { value: 'J', label: 'Group J — Agricultural, Accessory' },
  { value: 'other', label: 'Others (specify)' },
];

export const OCCUPANCY_FIELD_LABEL = 'Use or character of occupancy';
export const OCCUPANCY_HINT = "The building's use, as grouped in the National Building Code.";

/** "Others (specify)": how long the specified use may be, as the server checks it (after trimming). */
export const OCCUPANCY_OTHER_MIN = 3;
export const OCCUPANCY_OTHER_MAX = 120;

/** The permit types whose application asks for it. */
const ASKED_OF: readonly string[] = ['Building Permit', 'Certificate of Occupancy'];

export function asksOccupancy(permitType: string | null | undefined): boolean {
  return !!permitType && ASKED_OF.includes(permitType);
}

export function isOccupancyGroup(value: unknown): value is OccupancyGroup {
  return typeof value === 'string' && OCCUPANCY_GROUPS.some((group) => group.value === value);
}

function otherIsValid(other: string): boolean {
  const text = other.trim();
  return text.length >= OCCUPANCY_OTHER_MIN && text.length <= OCCUPANCY_OTHER_MAX;
}

/** Why the answer cannot be filed, in the server's own words; null when it can. */
export function occupancyProblem(group: OccupancyGroup | null, other: string): string | null {
  if (group === null) return 'Choose the use or character of occupancy.';
  if (group === 'other' && !otherIsValid(other)) return 'Specify the use of the building, in 3 to 120 characters.';
  return null;
}

/**
 * The answer as the application's form keeps it. Nothing until chosen, and
 * nothing for "Others" while the use is not specified yet: the server checks a
 * value on every save, and a draft may be half-chosen (Save & Exit on step 1).
 * `occupancyOther` is null for a group, so a use typed earlier is not kept.
 */
export function occupancyForm(group: OccupancyGroup | null, other: string): Record<string, unknown> {
  if (group === null) return {};
  if (group !== 'other') return { occupancyGroup: group, occupancyOther: null };
  return otherIsValid(other) ? { occupancyGroup: 'other', occupancyOther: other.trim() } : {};
}

/** What a saved form holds, read defensively: an unknown value reads as not chosen. */
export function occupancyFromForm(form: Readonly<Record<string, unknown>> | null | undefined): {
  group: OccupancyGroup | null;
  other: string;
} {
  const group = form?.['occupancyGroup'];
  const other = form?.['occupancyOther'];
  return {
    group: isOccupancyGroup(group) ? group : null,
    other: isOccupancyGroup(group) && group === 'other' && typeof other === 'string' ? other : '',
  };
}

/** The label for a choice: the group's, or "Others — <the use given>". */
export function occupancyLabel(group: OccupancyGroup, other: string): string {
  if (group === 'other') {
    const text = other.trim();
    return text === '' ? 'Others (specify)' : `Others — ${text}`;
  }
  return OCCUPANCY_GROUPS.find((option) => option.value === group)!.label;
}

/** The label a filed application shows and prints; null when none was given (an older filing, or another type). */
export function occupancyLabelOf(form: Readonly<Record<string, unknown>> | null | undefined): string | null {
  const { group, other } = occupancyFromForm(form);
  return group === null ? null : occupancyLabel(group, other);
}
