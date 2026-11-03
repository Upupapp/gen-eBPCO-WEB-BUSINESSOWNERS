// Icon + accent-color mapping for a permit type, keyed by substring — shared
// between the dashboard's "Recent Applications" list and the Permit Services
// catalog so the same permit type always reads with the same icon/color in
// both places. Paths are drawn in the Lucide visual style (24x24, round
// caps/joins) rather than pulling in lucide-angular, which doesn't yet
// support this app's Angular version.
//
// One icon per permit type (2026-11-03): seven ancillary types used to share
// the same cog, which read as a sun on every card. Colours are the house
// tones (chip background / chip text), not status colours by meaning.
export const PERMIT_VISUAL_ICONS = {
  building: [
    'M4 21V7a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v14',
    'M15 21V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v17',
    'M4 21h17',
    'M8 9h.01',
    'M8 13h.01',
    'M8 17h.01',
    'M18 9h.01',
    'M18 13h.01',
    'M18 17h.01',
  ],
  hammer: [
    'm15 12-8.4 8.4a2.1 2.1 0 0 1-3-3L12 9',
    'M17.6 15 22 10.6',
    'm20.9 11.7-1.5-1.5a2 2 0 0 1-.6-1.4V7.6l-2.3-2.3a6 6 0 0 0-4.2-1.7H9l.9.8a6.2 6.2 0 0 1 2.1 4.6v1.7l2 2h1.2a2 2 0 0 1 1.4.6l1.5 1.5',
  ],
  mapPin: ['M12 18.5S5 13 5 8.5a7 7 0 0 1 14 0c0 4.5-7 10-7 10Z', 'M12 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z'],
  zap: ['M13 3 5 13.5h5.5L11 21l8-10.5h-5.5L13 3Z'],
  chip: [
    'M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
    'M9.5 9.5h5v5h-5Z',
    'M9 2v3', 'M15 2v3', 'M9 19v3', 'M15 19v3',
    'M2 9h3', 'M2 15h3', 'M19 9h3', 'M19 15h3',
  ],
  wrench: ['M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4L15 12l-3-3 2.7-2.7Z'],
  droplet: ['M12 3s5 5.5 5 9a5 5 0 0 1-10 0c0-3.5 5-9 5-9Z'],
  badgeCheck: [
    'm9 12 2 2 4-4',
    'M12 3.5 13.8 5l2.5-.3.6 2.5 2.3 1.1-1 2.4 1 2.4-2.3 1.1-.6 2.5-2.5-.3L12 20.5 10.2 19l-2.5.3-.6-2.5-2.3-1.1 1-2.4-1-2.4 2.3-1.1.6-2.5 2.5.3Z',
  ],
  fan: [
    'M10.8 16.4a6 6 0 0 1-8.6-7l5.4 1.4a6 6 0 0 1 7-8.6l-1.4 5.4a6 6 0 0 1 8.6 7l-5.4-1.4a6 6 0 0 1-7 8.6l1.4-5.4Z',
    'M12 12v.01',
  ],
  compass: [
    'M12 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
    'm11 6.8-8 14.2',
    'm13 6.8 8 14.2',
    'M19.1 12a10 10 0 0 1-14.2 0',
  ],
  brickWall: [
    'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z',
    'M3 9h18', 'M3 15h18', 'M12 9v6', 'M8 3v6', 'M16 3v6', 'M8 15v6', 'M16 15v6',
  ],
  sofa: [
    'M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3',
    'M2 16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0Z',
    'M4 18v2',
    'M20 18v2',
  ],
  fence: [
    'M4 3 2 5v15a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V5Z',
    'M12 3l-2 2v15a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V5Z',
    'M20 3l-2 2v15a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V5Z',
    'M6 8h4', 'M6 16h4', 'M14 8h4', 'M14 16h4',
  ],
  signpost: [
    'M12 13v8',
    'M12 3v3',
    'M4 6a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h13a2 2 0 0 0 1.2-.4l3.4-2.3a1 1 0 0 0 0-1.6l-3.4-2.3A2 2 0 0 0 17 6Z',
  ],
  shovel: [
    'M2 22v-5l5-5 5 5-5 5Z',
    'M9.5 14.5 16 8',
    'm17 2 5 5-.5.5a3.5 3.5 0 0 1-5 0 3.5 3.5 0 0 1 0-5L17 2',
  ],
  store: [
    'M4 9 5 4h14l1 5',
    'M4 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0',
    'M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9',
    'M9 20v-5h6v5',
  ],
  fileText: ['M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z', 'M14 3v4h4', 'M9 13h6', 'M9 17h6'],
} as const;

export interface PermitVisual {
  icon: readonly string[];
  bg: string;
  fg: string;
}

/** The house tones as icon tiles (chip background, chip text). */
const TONE = {
  brand: { bg: '#fdeceb', fg: '#c81e2c' },
  success: { bg: '#dcfce7', fg: '#15803d' },
  warning: { bg: '#fef3c7', fg: '#b45309' },
  info: { bg: '#e8f1ff', fg: '#1d4ed8' },
  progress: { bg: '#eef2ff', fg: '#4338ca' },
  violet: { bg: '#ede9fe', fg: '#6d28d9' },
  neutral: { bg: '#f4f4f7', fg: '#565c6b' },
} as const;

/**
 * Icon + color for a permit, keyed by permit type substring. Order matters:
 * "Interior Design" contains "sign", and "Electronics" is not "Electrical".
 */
export function permitVisual(permitType: string): PermitVisual {
  const value = permitType.toLowerCase();
  const pick = (icon: readonly string[], tone: keyof typeof TONE): PermitVisual => ({ icon, ...TONE[tone] });
  if (value.includes('demolition')) return pick(PERMIT_VISUAL_ICONS.hammer, 'neutral');
  if (value.includes('building')) return pick(PERMIT_VISUAL_ICONS.building, 'brand');
  if (value.includes('zoning') || value.includes('locational')) return pick(PERMIT_VISUAL_ICONS.mapPin, 'success');
  if (value.includes('occupancy') || value.includes('fsic') || value.includes('fsec')) {
    return pick(PERMIT_VISUAL_ICONS.badgeCheck, 'success');
  }
  if (value.includes('electronics')) return pick(PERMIT_VISUAL_ICONS.chip, 'progress');
  if (value.includes('electrical')) return pick(PERMIT_VISUAL_ICONS.zap, 'warning');
  if (value.includes('plumbing')) return pick(PERMIT_VISUAL_ICONS.wrench, 'info');
  if (value.includes('sanitary')) return pick(PERMIT_VISUAL_ICONS.droplet, 'info');
  if (value.includes('mechanical')) return pick(PERMIT_VISUAL_ICONS.fan, 'info');
  if (value.includes('architectural')) return pick(PERMIT_VISUAL_ICONS.compass, 'violet');
  if (value.includes('civil') || value.includes('structural')) return pick(PERMIT_VISUAL_ICONS.brickWall, 'progress');
  if (value.includes('interior')) return pick(PERMIT_VISUAL_ICONS.sofa, 'violet');
  if (value.includes('fencing')) return pick(PERMIT_VISUAL_ICONS.fence, 'neutral');
  if (value.includes('sign')) return pick(PERMIT_VISUAL_ICONS.signpost, 'warning');
  if (value.includes('excavation')) return pick(PERMIT_VISUAL_ICONS.shovel, 'warning');
  if (value.includes('business')) return pick(PERMIT_VISUAL_ICONS.store, 'brand');
  return pick(PERMIT_VISUAL_ICONS.fileText, 'neutral');
}
