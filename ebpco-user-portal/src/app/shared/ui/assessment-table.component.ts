import { Component, input } from '@angular/core';
import { pesos } from '../../core/domain/assessment.model';
import { AssessmentView, BALANCE, TOTAL_AMOUNT_DUE } from '../../core/domain/assessment-view';

/**
 * The assessment as one table (design review I15): the fees in the body, then
 * "Total amount due" and "Balance" in the foot, every amount right-aligned in
 * the same column. The application page and the pay page both use it; the pay
 * page's totals used to be loose rows 14px outside the fee column, with the
 * balance in red on an ordinary unpaid bill.
 */
@Component({
  selector: 'app-assessment-table',
  template: `
    <table class="table">
      <thead><tr><th>Fee</th><th class="num">Amount</th></tr></thead>
      <tbody>
        @for (line of view().lineItems; track line.code) {
          <tr><td>{{ line.name }}</td><td class="num">{{ line.amountCentavos !== null ? pesos(line.amountCentavos) : 'Pending' }}</td></tr>
        }
      </tbody>
      <tfoot>
        <tr><td>{{ totalLabel }}</td><td class="num">{{ pesos(view().totalCentavos) }}</td></tr>
        <tr class="table-balance">
          <td>{{ balanceLabel }}</td>
          <td class="num">{{ pesos(view().balanceCentavos) }}@if (view().pendingVerification) { — pending verification }</td>
        </tr>
      </tfoot>
    </table>
  `,
})
export class AssessmentTableComponent {
  readonly view = input.required<AssessmentView>();
  protected readonly pesos = pesos;
  protected readonly totalLabel = TOTAL_AMOUNT_DUE;
  protected readonly balanceLabel = BALANCE;
}
