import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DELIVERY_FEE_NOTE, DeliveryChoiceDraft } from '../../core/domain/permit-delivery';
import { CASTILLA_BARANGAYS, CITIES, PH_PROVINCES } from '../../core/domain/ph-reference-data';

/**
 * Pick up at the office, or delivery by courier to an address (server
 * migration 070). One form for the wizard's Review step and the application
 * page's Change, so both ask the same thing in the same words.
 *
 * `value` is the parent's own object and is edited in place; `edited` fires on
 * every change so the parent can clear a message it showed.
 *
 * The address is anywhere the courier can reach, not only Castilla: the
 * barangay, city and province lists are suggestions, never a restriction.
 */
@Component({
  selector: 'app-delivery-choice',
  imports: [FormsModule],
  styles: [`
    .delivery-fee-note {
      margin: 0 0 14px; padding: 10px 12px; border-radius: var(--radius-md);
      background: var(--info-100); color: var(--info-text); font-size: 13px;
    }
  `],
  template: `
    <fieldset class="choice-cards choice-cards--row" id="receive-by">
      <legend>{{ legend }}</legend>
      <label class="choice-card" [class.selected]="value.receiveBy === 'pickup'">
        <input type="radio" id="receive-by-pickup" name="receive-by" value="pickup"
          [(ngModel)]="value.receiveBy" (ngModelChange)="edited.emit()" />
        <span class="choice-card-text">
          <strong>Pick up at the office</strong>
          <span>Claim it at the issuing office when it is ready.</span>
        </span>
      </label>
      <label class="choice-card" [class.selected]="value.receiveBy === 'delivery'">
        <input type="radio" id="receive-by-delivery" name="receive-by" value="delivery"
          [(ngModel)]="value.receiveBy" (ngModelChange)="edited.emit()" />
        <span class="choice-card-text">
          <strong>Delivery by courier</strong>
          <span>Sent to the address you give. You pay the courier when it arrives.</span>
        </span>
      </label>
    </fieldset>

    @if (value.receiveBy === 'delivery') {
      <div id="delivery-address-form">
        <p class="delivery-fee-note" id="delivery-fee-note">{{ feeNote || defaultFeeNote }}</p>
        <div class="form-row">
          <div class="field">
            <label for="delivery-recipient-name">Recipient's name<span class="required">*</span></label>
            <input id="delivery-recipient-name" class="input" maxlength="160" autocomplete="name"
              [(ngModel)]="value.address.recipientName" (ngModelChange)="edited.emit()" />
            <div class="hint">Whoever will receive it at the door.</div>
          </div>
          <div class="field">
            <label for="delivery-recipient-mobile">Mobile number<span class="required">*</span></label>
            <input id="delivery-recipient-mobile" class="input" type="tel" inputmode="tel" maxlength="20"
              autocomplete="tel" placeholder="09XXXXXXXXX"
              [(ngModel)]="value.address.recipientMobile" (ngModelChange)="edited.emit()" />
            <div class="hint">The courier calls this number.</div>
          </div>
        </div>
        <div class="field">
          <label for="delivery-address-line">House no. and street, or purok<span class="required">*</span></label>
          <input id="delivery-address-line" class="input" maxlength="300" autocomplete="address-line1"
            [(ngModel)]="value.address.addressLine" (ngModelChange)="edited.emit()" />
        </div>
        <div class="form-row">
          <div class="field">
            <label for="delivery-barangay">Barangay<span class="required">*</span></label>
            <input id="delivery-barangay" class="input" maxlength="120" list="delivery-barangay-options"
              [(ngModel)]="value.address.barangay" (ngModelChange)="edited.emit()" />
          </div>
          <div class="field">
            <label for="delivery-city">City / Municipality<span class="required">*</span></label>
            <input id="delivery-city" class="input" maxlength="120" list="delivery-city-options" autocomplete="address-level2"
              [(ngModel)]="value.address.city" (ngModelChange)="edited.emit()" />
          </div>
          <div class="field">
            <label for="delivery-province">Province<span class="required">*</span></label>
            <input id="delivery-province" class="input" maxlength="120" list="delivery-province-options" autocomplete="address-level1"
              [(ngModel)]="value.address.province" (ngModelChange)="edited.emit()" />
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="delivery-postal-code">ZIP code (optional)</label>
            <input id="delivery-postal-code" class="input" maxlength="4" inputmode="numeric" autocomplete="postal-code"
              placeholder="e.g. 4713" [(ngModel)]="value.address.postalCode" (ngModelChange)="edited.emit()" />
          </div>
          <div class="field">
            <label for="delivery-landmark">Landmark (optional)</label>
            <input id="delivery-landmark" class="input" maxlength="300" placeholder="e.g. beside the chapel, green gate"
              [(ngModel)]="value.address.landmark" (ngModelChange)="edited.emit()" />
          </div>
        </div>
        @if (problem) {
          <div class="field error" role="alert" id="delivery-address-problem">{{ problem }}</div>
        }
        <datalist id="delivery-barangay-options">
          @for (b of barangays; track b) { <option [value]="b"></option> }
        </datalist>
        <datalist id="delivery-city-options">
          @for (c of cities; track c) { <option [value]="c"></option> }
        </datalist>
        <datalist id="delivery-province-options">
          @for (p of provinces; track p) { <option [value]="p"></option> }
        </datalist>
      </div>
    }
  `,
})
export class DeliveryChoiceComponent {
  /** The parent's choice, edited in place. */
  @Input({ required: true }) value!: DeliveryChoiceDraft;
  /** The server's `feeNote`; its own wording until that has been read. */
  @Input() feeNote: string | null = DELIVERY_FEE_NOTE;
  /** Why the address cannot be used, once the parent has checked it. */
  @Input() problem: string | null = null;
  @Input() legend = 'How do you want to receive your permit?';
  @Output() readonly edited = new EventEmitter<void>();

  protected readonly defaultFeeNote = DELIVERY_FEE_NOTE;
  protected readonly barangays = CASTILLA_BARANGAYS;
  protected readonly cities = CITIES;
  protected readonly provinces = PH_PROVINCES;
}
