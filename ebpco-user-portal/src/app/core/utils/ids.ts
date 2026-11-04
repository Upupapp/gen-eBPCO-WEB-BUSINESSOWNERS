let counter = 1000;

/** Simple incrementing id generator for this mock/in-memory build — swap for server-issued ids once a backend is wired to this portal (see master command Section 15, Open Decision #3). */
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function todayIso(): string {
  return new Date().toISOString();
}

/**
 * The portal's two date formats, the same as the Admin Portal's (design
 * review I22): 'Nov 4, 2026', and 'Nov 4, 2026 · 4:00 PM' where the time
 * matters. Documents, lists, timelines and document footers all use these;
 * only native date inputs keep the browser's own format.
 */
export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const time = new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  return `${formatDate(iso)} · ${time}`;
}
