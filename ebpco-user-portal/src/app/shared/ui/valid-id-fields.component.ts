import { Component, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toBase64 } from '../../core/api/document-resubmission.service';
import {
  ACCEPTED_ID_TYPES, AcceptedIdType, VerificationRequest, idPhotoProblem,
} from '../../core/domain/account-verification';

export type IdSide = 'front' | 'back';

export interface IdPhoto {
  readonly file: File;
  /** The same file as a data: URL, for the preview only. */
  readonly preview: string;
}

/**
 * The valid ID a citizen sends for account verification (migration 067),
 * held by the page that shows `app-valid-id-fields` rather than by the fields
 * themselves: sign-up keeps it across its steps, and a step that is not on
 * screen is not rendered. Signals throughout, because a photo is read
 * asynchronously and this app has no zone.js to notice a plain field change.
 */
export class ValidIdDraft {
  readonly idType = signal<AcceptedIdType | null>(null);
  readonly idNumber = signal('');
  readonly front = signal<IdPhoto | null>(null);
  readonly back = signal<IdPhoto | null>(null);
  /** Why the last photo chosen was refused. */
  readonly photoError = signal<string | null>(null);

  /** What is still missing, in the citizen's words, or null when it can be sent. Same limits as the server. */
  problem(): string | null {
    if (this.idType() === null) return 'Choose the type of ID.';
    const number = this.idNumber().trim();
    if (number.length < 3 || number.length > 40) return 'Enter the ID number as printed on the ID.';
    if (this.front() === null) return 'Add a photo of the front of the ID.';
    return null;
  }

  /** Checks the photo (JPEG or PNG, at most 8 MB) before keeping it. */
  async choose(side: IdSide, file: File | undefined): Promise<void> {
    if (!file) return;
    const problem = idPhotoProblem(file);
    if (problem) {
      this.photoError.set(problem);
      return;
    }
    this.photoError.set(null);
    try {
      const preview = await readAsDataUrl(file);
      this.slot(side).set({ file, preview });
    } catch {
      this.photoError.set('That photo could not be read. Try taking it again.');
    }
  }

  remove(side: IdSide): void {
    this.slot(side).set(null);
  }

  /** The `PUT /me/verification` body. Call only once `problem()` is null. */
  async toRequest(): Promise<VerificationRequest> {
    const front = this.front()!;
    const back = this.back();
    return {
      idType: this.idType()!,
      idNumber: this.idNumber().trim(),
      front: { fileName: front.file.name, contentBase64: await toBase64(front.file) },
      back: back === null ? null : { fileName: back.file.name, contentBase64: await toBase64(back.file) },
    };
  }

  reset(): void {
    this.idType.set(null);
    this.idNumber.set('');
    this.front.set(null);
    this.back.set(null);
    this.photoError.set(null);
  }

  private slot(side: IdSide) {
    return side === 'front' ? this.front : this.back;
  }
}

/**
 * The valid ID fields: type, number, and a photo of each side with a preview.
 * Shared by sign-up's Valid ID step and Profile > Account verification, so
 * the two cannot drift apart.
 */
@Component({
  selector: 'app-valid-id-fields',
  imports: [FormsModule],
  template: `
    <div class="field">
      <label [for]="prefix() + '-type'">Type of ID<span class="required">*</span></label>
      <select [id]="prefix() + '-type'" class="input" [disabled]="disabled()"
              [ngModel]="draft().idType()" (ngModelChange)="draft().idType.set($event)">
        <option [ngValue]="null" disabled>Select</option>
        @for (t of idTypes; track t) {
          <option [ngValue]="t">{{ t }}</option>
        }
      </select>
    </div>
    <div class="field">
      <label [for]="prefix() + '-number'">ID Number<span class="required">*</span></label>
      <input [id]="prefix() + '-number'" class="input" maxlength="40" autocomplete="off" [disabled]="disabled()"
             [ngModel]="draft().idNumber()" (ngModelChange)="draft().idNumber.set($event)" />
      <div class="hint">As printed on the ID.</div>
    </div>
    <div class="form-row">
      <div class="field">
        <label [for]="prefix() + '-front'">Photo of the front<span class="required">*</span></label>
        @if (draft().front(); as photo) {
          <img class="id-preview" [src]="photo.preview" alt="Front of your ID, as you chose it" />
          <div class="id-file">
            <span class="small muted">{{ photo.file.name }}</span>
            <button type="button" class="btn btn-ghost btn-sm" [disabled]="disabled()" (click)="draft().remove('front')">Remove</button>
          </div>
        }
        <input [id]="prefix() + '-front'" type="file" accept="image/jpeg,image/png" [disabled]="disabled()"
               (change)="pick('front', $event)" />
      </div>
      <div class="field">
        <label [for]="prefix() + '-back'">Photo of the back <span class="small muted">(optional)</span></label>
        @if (draft().back(); as photo) {
          <img class="id-preview" [src]="photo.preview" alt="Back of your ID, as you chose it" />
          <div class="id-file">
            <span class="small muted">{{ photo.file.name }}</span>
            <button type="button" class="btn btn-ghost btn-sm" [disabled]="disabled()" (click)="draft().remove('back')">Remove</button>
          </div>
        }
        <input [id]="prefix() + '-back'" type="file" accept="image/jpeg,image/png" [disabled]="disabled()"
               (change)="pick('back', $event)" />
      </div>
    </div>
    <p class="small muted" style="margin-top:-6px;">
      A clear photo (JPEG or PNG, up to 8 MB each) where your name, photo and ID number can be read.
    </p>
    @if (draft().photoError(); as err) { <div class="field error">{{ err }}</div> }
  `,
  styles: `
    :host { display: block; }
    .id-preview {
      display: block; width: 100%; max-height: 170px; object-fit: contain; margin-bottom: 6px;
      border: 1px solid var(--border-light); border-radius: var(--radius-sm); background: var(--gray-50);
    }
    .id-file { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
    .id-file span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `,
})
export class ValidIdFieldsComponent {
  readonly draft = input.required<ValidIdDraft>();
  /** Keeps each control's id unique on the page. */
  readonly prefix = input('valid-id');
  readonly disabled = input(false);

  protected readonly idTypes = ACCEPTED_ID_TYPES;

  protected async pick(side: IdSide, event: Event): Promise<void> {
    const control = event.target as HTMLInputElement;
    const file = control.files?.[0];
    // Cleared so choosing the same file again (after Remove) still fires.
    control.value = '';
    await this.draft().choose(side, file);
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('could not read the file'));
    reader.readAsDataURL(file);
  });
}
