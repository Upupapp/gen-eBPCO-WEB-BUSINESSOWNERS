import { ApplicationSummary } from '../api/citizen-api.models';
import { Assessment } from './assessment.model';

type OrderOfPayment = NonNullable<ApplicationSummary['payment']['orderOfPayment']>;

/** One fee on the assessment: null amount is a fee the assessor has yet to price. */
export interface AssessmentFeeLine {
  readonly code: string;
  readonly name: string;
  readonly amountCentavos: number | null;
}

/**
 * The ONE assessment every screen and document shows (design review I3, I15):
 * the fees, then "Total amount due" and "Balance", and the Order of Payment
 * number. The application page, the pay page and the permit all read this, so
 * the same money has the same lines and the same names everywhere. The
 * receipt keeps its own "Amount paid", which is a different figure.
 */
export interface AssessmentView {
  readonly lineItems: readonly AssessmentFeeLine[];
  readonly totalCentavos: number;
  readonly balanceCentavos: number;
  readonly opsNumber: string | null;
  readonly dueDate: string | null;
  /** A payment is with the Cashier: the balance stands until it is verified. */
  readonly pendingVerification: boolean;
  /** The balance can be paid now. */
  readonly canPay: boolean;
}

/** The labels the assessment's totals carry, on screen and on paper. */
export const TOTAL_AMOUNT_DUE = 'Total amount due';
export const BALANCE = 'Balance';

/** The Order of Payment's own fees, only those that apply: ₱0.00 lines beside the real ones read as charges (QA TC-05). */
export function feeLinesOf(order: OrderOfPayment): AssessmentFeeLine[] {
  return [
    { code: 'filing', name: 'Filing Fee', amountCentavos: order.fees.filing },
    { code: 'processing', name: 'Processing Fee', amountCentavos: order.fees.processing },
    { code: 'architectural', name: 'Architectural Fee', amountCentavos: order.fees.architectural },
    { code: 'structural', name: 'Structural Fee', amountCentavos: order.fees.structural },
    { code: 'electrical', name: 'Electrical Fee', amountCentavos: order.fees.electrical },
    { code: 'others', name: 'Other Fees', amountCentavos: order.fees.others },
  ].filter((line) => line.amountCentavos > 0);
}

/**
 * The assessment from the real Order of Payment (`payment.orderOfPayment` on
 * the application), else from the local demo store. A real application has no
 * partial payments server-side, so its balance is the total until it is Paid.
 */
export function assessmentViewOf(
  paymentStatus: string | null | undefined,
  real: OrderOfPayment | null | undefined,
  demo: Assessment | null | undefined,
): AssessmentView | null {
  if (real) {
    const paid = paymentStatus === 'Paid';
    return {
      lineItems: feeLinesOf(real),
      totalCentavos: real.totalCentavos,
      balanceCentavos: paid ? 0 : real.totalCentavos,
      opsNumber: real.number,
      dueDate: real.dueDate ?? null,
      pendingVerification: paymentStatus === 'Pending Verification',
      canPay: paymentStatus === 'Not Yet Available' || paymentStatus === 'Overdue',
    };
  }
  if (!demo) return null;
  return {
    lineItems: demo.lineItems.map((line) => ({ code: line.code, name: line.name, amountCentavos: line.amountCentavos })),
    totalCentavos: demo.totalCentavos,
    balanceCentavos: demo.balanceCentavos,
    opsNumber: demo.opsNumber,
    dueDate: demo.dueDate,
    pendingVerification: false,
    canPay: demo.balanceCentavos > 0,
  };
}
