import { Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CitizenApiClient } from '../../core/api/citizen-api.client';
import { ApiError } from '../../core/api/problem';
import { AuthService } from '../../core/session/auth.service';
import {
  DeliveryChoiceDraft, DeliveryView, PermitDeliveryState, addressFromDelivery, addressFromProfile,
  deliveryAddressLine, deliveryAddressProblem, deliveryChoiceRequest, deliveryStatusText, formatDay,
} from '../../core/domain/permit-delivery';
import { DeliveryChoiceComponent } from '../../shared/ui/delivery-choice.component';
import { ToastService } from '../../shared/ui/toast.service';

/**
 * "Receiving your permit" (server migration 070): picked up at the office, or
 * delivered by courier — the citizen's choice, changeable until the permit is
 * handed to the courier; then the courier, the tracking number and the date
 * sent; "I received my permit", which closes the application; and, if the
 * courier brought it back, why, with the office's claim instructions (the
 * Your permit card) and "Ask for delivery again".
 *
 * Everything it offers is what the server says may be done now
 * (`canChange`, `canConfirmReceipt`), never inferred here.
 */
@Component({
  selector: 'app-permit-delivery',
  imports: [DeliveryChoiceComponent],
  styles: [`
    :host { display: block; }
    .delivery-facts { margin-top: 16px; }
    .delivery-tracking dd { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
    .delivery-tracking .btn { margin: -6px 0; }
    .delivery-note { margin: 12px 0 0; }
    .delivery-actions { display: flex; gap: 8px 12px; flex-wrap: wrap; align-items: center; margin-top: 16px; }
    .delivery-confirm { margin-top: 16px; }
  `],
  template: `
    <div class="card" id="permit-delivery-card">
      <!-- How it comes, once, as a chip in the card head (it was a badge, a callout and a sentence). -->
      <div class="card-head">
        <div class="card-title">Receiving your permit</div>
        @if (!editing()) {
          @if (delivery()) {
            <span id="delivery-choice" class="badge badge-violet card-head-action">Delivery by courier</span>
          } @else {
            <span id="delivery-choice" class="badge card-head-action">Pick up at the office</span>
          }
        }
      </div>

      @if (editing(); as draft) {
        <app-delivery-choice
          [value]="draft"
          [feeNote]="state().feeNote"
          [problem]="problem()"
          (edited)="problem.set(null)"
        />
        <div class="delivery-actions">
          <button type="button" class="btn btn-primary btn-sm" id="delivery-save" [disabled]="saving()" (click)="save()">
            {{ saving() ? 'Saving…' : 'Save' }}
          </button>
          <button type="button" class="btn btn-secondary btn-sm" id="delivery-cancel-edit" [disabled]="saving()" (click)="cancelEditing()">
            Cancel
          </button>
        </div>
      } @else if (delivery(); as d) {
        <div class="callout release-state" id="delivery-status" [class]="toneClass()" [attr.data-status]="d.status">
          <strong class="callout-title" id="delivery-status-title">{{ statusText().title }}</strong>
          <p>{{ statusText().detail }}</p>
        </div>

        @if (d.status === 'returned') {
          <p class="small muted delivery-note">Where and when to claim it are under Your permit.</p>
        }

        <dl class="kv delivery-facts">
          @if (d.status === 'returned' && d.returnReason) {
            <div id="delivery-return-reason" class="kv-wide"><dt>Reason</dt><dd>{{ d.returnReason }}</dd></div>
          }
          @if (d.courier) {
            <div id="delivery-courier"><dt>Courier</dt><dd>{{ d.courier }}</dd></div>
          }
          @if (d.trackingNumber) {
            <div class="delivery-tracking">
              <dt>Tracking no.</dt>
              <dd>
                <strong id="delivery-tracking-number">{{ d.trackingNumber }}</strong>
                <button type="button" class="btn btn-ghost btn-sm" id="delivery-copy-tracking"
                  aria-label="Copy tracking number" (click)="copyTracking(d.trackingNumber)">
                  {{ copied() ? 'Copied' : 'Copy' }}
                </button>
              </dd>
            </div>
          }
          @if (d.sentOn) {
            <div id="delivery-sent-on"><dt>Date sent</dt><dd>{{ formatDay(d.sentOn) }}</dd></div>
          }
          @if (d.deliveredOn && d.status !== 'returned') {
            <div id="delivery-delivered-on"><dt>Delivered</dt><dd>{{ formatDay(d.deliveredOn) }}</dd></div>
          }
          <div id="delivery-recipient"><dt>Recipient</dt><dd>{{ d.recipientName }}</dd></div>
          <div id="delivery-mobile"><dt>Mobile</dt><dd>{{ d.recipientMobile }}</dd></div>
          <div id="delivery-address" class="kv-wide"><dt>Deliver to</dt><dd>{{ addressLine(d) }}</dd></div>
          @if (d.landmark) {
            <div id="delivery-landmark" class="kv-wide"><dt>Landmark</dt><dd>{{ d.landmark }}</dd></div>
          }
        </dl>

        @if (d.status === 'requested' || d.status === 'returned') {
          <p class="small muted delivery-note" id="delivery-fee-reminder">{{ state().feeNote }}</p>
        }
        @if (d.status === 'delivered' && d.closableFrom) {
          <p class="small muted delivery-note">
            If you do not confirm, the office may close it from the courier’s proof of delivery from {{ formatDay(d.closableFrom) }}.
          </p>
        }

        @if (state().canConfirmReceipt) {
          @if (!confirming()) {
            <div class="delivery-actions">
              <button type="button" class="btn btn-primary btn-sm" id="delivery-received" (click)="confirming.set(true)">
                I received my permit
              </button>
              <span class="small muted">Confirm once the permit is in your hands.</span>
            </div>
          } @else {
            <div class="callout callout-success delivery-confirm" id="delivery-received-confirm" role="group" aria-labelledby="delivery-received-confirm-title">
              <strong class="callout-title" id="delivery-received-confirm-title">
                Confirm that you received {{ permitNumber() ? 'permit ' + permitNumber() : 'your permit' }}?
              </strong>
              <p>This closes the delivery and completes your application.</p>
              <div class="callout-actions">
                <button type="button" class="btn btn-secondary btn-sm" id="delivery-received-cancel" [disabled]="confirmingBusy()" (click)="confirming.set(false)">
                  Not yet
                </button>
                <button type="button" class="btn btn-primary btn-sm" id="delivery-received-yes" [disabled]="confirmingBusy()" (click)="confirmReceived()">
                  {{ confirmingBusy() ? 'Confirming…' : 'Yes, I received it' }}
                </button>
              </div>
            </div>
          }
        }

        @if (state().canChange) {
          <div class="delivery-actions">
            @if (d.status === 'returned') {
              <button type="button" class="btn btn-primary btn-sm" id="delivery-ask-again" (click)="startEditing()">Ask for delivery again</button>
            } @else {
              <button type="button" class="btn btn-secondary btn-sm" id="delivery-change" (click)="startEditing()">Change</button>
              <span class="small muted">Until the permit is sent, you can change the address or pick it up instead.</span>
            }
          </div>
        }
      } @else {
        <p class="small muted" style="margin:0;">Claim it at the issuing office when it is ready.</p>
        @if (state().canChange) {
          <div class="delivery-actions">
            <button type="button" class="btn btn-secondary btn-sm" id="delivery-change" (click)="startEditing()">Change</button>
            <span class="small muted">Until the permit is ready, you can have it delivered by courier instead.</span>
          </div>
        }
      }
    </div>
  `,
})
export class PermitDeliveryComponent {
  private readonly api = inject(CitizenApiClient);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  readonly applicationId = input.required<string>();
  readonly state = input.required<PermitDeliveryState>();
  /** For the confirmation's wording. */
  readonly permitNumber = input<string | null>(null);

  /** The new state after a change of choice or address. */
  readonly stateChange = output<PermitDeliveryState>();
  /** The new state after "I received my permit": the application is Completed. */
  readonly received = output<PermitDeliveryState>();

  protected readonly formatDay = formatDay;
  protected readonly addressLine = deliveryAddressLine;

  /** The form while Change (or Ask for delivery again) is open; null otherwise. */
  protected readonly editing = signal<DeliveryChoiceDraft | null>(null);
  protected readonly problem = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly confirming = signal(false);
  protected readonly confirmingBusy = signal(false);
  protected readonly copied = signal(false);

  /** The delivery, when the choice is delivery; null for a pick-up. */
  protected readonly delivery = computed<DeliveryView | null>(() => {
    const s = this.state();
    return s.receiveBy === 'delivery' ? s.delivery : null;
  });

  protected readonly statusText = computed(() => {
    const d = this.delivery();
    return d ? deliveryStatusText(d) : { title: '', detail: '' };
  });

  /**
   * The status callout's tone: grey while it waits to be sent, violet on its
   * way (it must not look like "not yet ready"), green once delivered, amber
   * when the courier brought it back and the citizen has to act.
   */
  protected readonly toneClass = computed(() => {
    switch (this.delivery()?.status) {
      case 'delivered':
      case 'received':
      case 'closed':
        return 'release-ready callout-success';
      case 'out-for-delivery':
        return 'release-waiting callout-violet';
      case 'returned':
        return 'release-waiting callout-warning';
      default:
        return 'release-waiting callout-neutral';
    }
  });

  /**
   * Opens the form: on the address already given (Change, or Ask for
   * delivery again after a return, which opens on Delivery), or on the
   * citizen's own profile address when they picked up until now.
   */
  protected startEditing(): void {
    const d = this.delivery();
    this.problem.set(null);
    this.editing.set(d
      ? { receiveBy: 'delivery', address: addressFromDelivery(d) }
      : { receiveBy: 'pickup', address: addressFromProfile(this.auth.currentUser()) });
  }

  protected cancelEditing(): void {
    this.editing.set(null);
    this.problem.set(null);
  }

  protected async save(): Promise<void> {
    const draft = this.editing();
    if (draft === null) return;
    if (draft.receiveBy === 'delivery') {
      const problem = deliveryAddressProblem(draft.address);
      if (problem !== null) { this.problem.set(problem); return; }
    }
    this.saving.set(true);
    try {
      const next = await firstValueFrom(this.api.setDelivery(this.applicationId(), deliveryChoiceRequest(draft)));
      this.editing.set(null);
      this.stateChange.emit(next);
      this.toast.success(next.receiveBy === 'delivery' && next.delivery
        ? `Saved. Your permit will be delivered by courier to ${next.delivery.city}.`
        : 'Saved. You will pick up your permit at the office.');
    } catch (e) {
      const message = this.explain(e);
      if (draft.receiveBy === 'delivery') this.problem.set(message);
      this.toast.error(message);
    } finally {
      this.saving.set(false);
    }
  }

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * "I received my permit" from the page's Next step callout: opens this
   * card's own confirmation and brings it into view, so the receipt is
   * confirmed in one place.
   */
  askToConfirm(): void {
    if (!this.state().canConfirmReceipt) return;
    this.confirming.set(true);
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.host.nativeElement.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    setTimeout(() => document.getElementById('delivery-received-yes')?.focus({ preventScroll: true }));
  }

  protected async confirmReceived(): Promise<void> {
    this.confirmingBusy.set(true);
    try {
      const next = await firstValueFrom(this.api.confirmPermitReceived(this.applicationId()));
      this.confirming.set(false);
      this.received.emit(next);
      this.toast.success('Thank you. Your application is complete.');
    } catch (e) {
      this.toast.error(this.explain(e));
    } finally {
      this.confirmingBusy.set(false);
    }
  }

  protected async copyTracking(trackingNumber: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(trackingNumber);
      this.copied.set(true);
      this.toast.success('Tracking number copied.');
    } catch {
      this.toast.error('Could not copy it. Select the tracking number and copy it instead.');
    }
  }

  private explain(error: unknown): string {
    return error instanceof ApiError
      ? error.citizenMessage
      : 'We could not reach the Municipality’s system. Check your connection and try again.';
  }
}
