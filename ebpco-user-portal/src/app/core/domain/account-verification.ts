/**
 * Account verification (ebpco-api migration 067, owner request 2026-10-21).
 *
 * Anyone can register and sign in; filing an application needs an account the
 * Municipality has verified, from one photo of a valid government ID. Until
 * then a citizen can still browse requirements, register businesses and save
 * drafts. Accounts that existed before, and walk-in applicants an officer
 * created, are already verified.
 *
 * The server is the authority: it refuses a filing (422, with a sentence for
 * the citizen) whatever this portal shows. What is here only says so first.
 */

/** What the citizen said at sign-up they will apply for. A starting point only: every application asks again. */
export type RegisteredAs = 'residential' | 'business' | 'both';

export type AccountVerificationStatus = 'unsubmitted' | 'pending' | 'verified' | 'rejected';

/** `GET /me`'s `verification`. */
export interface AccountVerification {
  status: AccountVerificationStatus;
  submittedAt: string | null;
  decidedAt: string | null;
  /** Why the ID was not accepted, when it was not. Shown word for word. */
  note: string | null;
  idType: string | null;
}

/** The server's list, exactly — `idType` must be one of these strings. */
export const ACCEPTED_ID_TYPES = [
  'PhilSys National ID (PhilID / ePhilID)',
  'Passport',
  "Driver's License",
  'UMID',
  'SSS ID',
  'GSIS eCard',
  'PRC ID',
  'Postal ID',
  "Voter's ID / Voter's Certification",
  'PhilHealth ID',
  'TIN ID',
  'Senior Citizen ID',
  'PWD ID',
  'Other government-issued ID with photo',
] as const;

export type AcceptedIdType = (typeof ACCEPTED_ID_TYPES)[number];

/** The server's own cap on each photo (`MAX_ID_BYTES`). */
export const MAX_ID_PHOTO_BYTES = 8 * 1024 * 1024;

/** `PUT /me/verification`. */
export interface VerificationRequest {
  idType: AcceptedIdType;
  idNumber: string;
  front: { fileName: string; contentBase64: string };
  back: { fileName: string; contentBase64: string } | null;
}

/** What `PUT /me/verification` answers: the same two fields `GET /me` carries. */
export interface VerificationResult {
  registeredAs: RegisteredAs | null;
  verification: AccountVerification | null;
}

const STATUS_LABELS: Record<AccountVerificationStatus, string> = {
  unsubmitted: 'No ID yet',
  pending: 'Waiting for verification',
  verified: 'Verified',
  rejected: 'ID not accepted',
};

/** The status chip's words. */
export function verificationStatusLabel(status: AccountVerificationStatus): string {
  return STATUS_LABELS[status];
}

/**
 * Whether this account may submit applications. A missing verification (a
 * server from before migration 067) is not held against the citizen: the
 * server's own refusal still applies if it disagrees.
 */
export function canSubmitApplications(verification: AccountVerification | null | undefined): boolean {
  return !verification || verification.status === 'verified';
}

/** Why this account cannot submit yet, in the citizen's words, or null when it can. */
export function submitBlockedMessage(verification: AccountVerification | null | undefined): string | null {
  if (canSubmitApplications(verification)) return null;
  switch (verification!.status) {
    case 'pending':
      return 'Your account is being verified. You can prepare applications now and submit once it is verified.';
    case 'rejected':
      return `${rejectedHeadline(verification!.note)} Upload your ID again under Profile > Account verification.`;
    default:
      return 'Verify your account to submit applications: upload a valid government ID under Profile > Account verification.';
  }
}

/** "Your ID was not accepted: <the officer's reason, word for word>." — with a full stop only if the reason has none. */
export function rejectedHeadline(note: string | null): string {
  const reason = (note ?? '').trim();
  if (!reason) return 'Your ID was not accepted.';
  return `Your ID was not accepted: ${reason}${/[.!?]$/.test(reason) ? '' : '.'}`;
}

/** Why this photo cannot be sent, or null. JPEG or PNG only (not a PDF), at most 8 MB. */
export function idPhotoProblem(file: File): string | null {
  const name = file.name.toLowerCase();
  const isImage = file.type === 'image/jpeg' || file.type === 'image/png'
    || (file.type === '' && /\.(jpe?g|png)$/.test(name));
  if (!isImage) return 'Choose a photo of the ID (JPEG or PNG), not a PDF or other file.';
  if (file.size > MAX_ID_PHOTO_BYTES) return 'That photo is larger than 8 MB. Take a smaller photo, or reduce its size.';
  return null;
}
