import { Component, Input } from '@angular/core';

/** The tones a status can take (house style 2026-11-03, the same in both portals). */
export type StatusTone = 'neutral' | 'info' | 'progress' | 'warning' | 'success' | 'violet' | 'danger';

/**
 * Every status word the portal shows, and its tone: ONE map, for applications
 * and documents alike (they used to have a map each, plus a hand-made one on
 * several pages, and "Under Review" wore the same red as "Rejected").
 *
 * Keyed by the label TEXT, not the `ApplicantStatus` categorization —
 * `applicantStatusLabel()` (status.model.ts) shows "Cancelled" for a
 * citizen's own withdrawal even though it categorizes as `'Rejected'` for
 * filtering. A word not listed here is neutral.
 */
const STATUS_TONE: Readonly<Record<string, StatusTone>> = {
  // Nothing is happening, or it ended without a decision against anyone.
  Draft: 'neutral',
  Withdrawn: 'neutral',
  Cancelled: 'neutral',
  Archived: 'neutral',
  Inactive: 'neutral',
  Missing: 'neutral',
  'Not yet reviewed': 'neutral',
  Voided: 'neutral',
  Reversed: 'neutral',
  Refunded: 'neutral',
  // With the office, not yet taken up.
  Submitted: 'info',
  Received: 'info',
  Uploaded: 'info',
  // The office is working on it.
  'Document Verification': 'progress',
  'Under Evaluation': 'progress',
  'Under Review': 'progress',
  'For Approval': 'progress',
  'Payment Under Verification': 'progress',
  'Payment Verification': 'progress',
  'Awaiting Preparation': 'progress',
  // Waiting on the citizen.
  'Revision Required': 'warning',
  Assessed: 'warning',
  'Awaiting Payment': 'warning',
  'Payment Submitted': 'warning',
  'Pending Verification': 'warning',
  Pending: 'warning',
  // Done, or good to go.
  'Payment Verified': 'success',
  Paid: 'success',
  Approved: 'success',
  'Permit Generated': 'success',
  'Ready for Release': 'success',
  Released: 'success',
  Completed: 'success',
  Accepted: 'success',
  Active: 'success',
  Verified: 'success',
  // On its way by courier (migration 070).
  'Out for Delivery': 'violet',
  // Ended against the citizen, or late.
  Rejected: 'danger',
  'Payment Rejected': 'danger',
  Expired: 'danger',
  Overdue: 'danger',
  Disabled: 'danger',
  'Not accepted': 'danger',
};

/** The badge class for each tone (styles.scss). */
const TONE_CLASS: Readonly<Record<StatusTone, string>> = {
  neutral: 'badge-gray',
  info: 'badge-blue',
  progress: 'badge-indigo',
  warning: 'badge-amber',
  success: 'badge-green',
  violet: 'badge-violet',
  danger: 'badge-red',
};

/** The tone of a status word; neutral for one this map does not know. */
export function statusTone(label: string): StatusTone {
  return Object.prototype.hasOwnProperty.call(STATUS_TONE, label) ? (STATUS_TONE[label] ?? 'neutral') : 'neutral';
}

/** The badge class for a status word, for a status shown without the pill component. */
export function statusBadgeClass(label: string): string {
  return TONE_CLASS[statusTone(label)];
}

@Component({
  selector: 'app-status-pill',
  template: `<span class="badge badge-dot" [class]="cssClass">{{ label }}</span>`,
})
export class StatusPillComponent {
  @Input({ required: true }) label!: string;
  /**
   * Whose status it is. One tone map now serves both, so this no longer
   * changes the colour; kept so every existing use still compiles.
   */
  @Input() kind: 'applicant' | 'document' = 'applicant';

  get cssClass(): string {
    return statusBadgeClass(this.label);
  }
}
