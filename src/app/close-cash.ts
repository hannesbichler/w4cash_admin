import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { KassenabschlussService } from './kassenabschluss.service';
import { Kassenabschluss } from './kassenabschluss.model';
import { I18nService } from './i18n.service';

type PreviewError = 'not-found' | 'error';
type CloseError = 'not-found' | 'conflict' | 'error';

@Component({
  selector: 'app-close-cash',
  imports: [CommonModule, FormsModule],
  templateUrl: './close-cash.html',
  styleUrl: './close-cash.css'
})
export class CloseCash {
  private svc = inject(KassenabschlussService);
  protected t = inject(I18nService).t;

  actionMsg = signal('');

  tabletId = signal('');
  loadedTabletId = signal<string | null>(null);

  previewLoading = signal(false);
  closeLoading = signal(false);

  result = signal<Kassenabschluss | null>(null);
  justClosed = signal(false);

  previewError = signal<PreviewError | null>(null);
  closeError = signal<CloseError | null>(null);

  onTabletIdChange(value: string) {
    this.tabletId.set(value);
    if (value.trim() !== this.loadedTabletId()) {
      this.result.set(null);
      this.previewError.set(null);
      this.closeError.set(null);
      this.justClosed.set(false);
      this.loadedTabletId.set(null);
    }
  }

  preview() {
    const id = this.tabletId().trim();
    if (!id) return;

    this.previewLoading.set(true);
    this.previewError.set(null);
    this.closeError.set(null);
    this.justClosed.set(false);

    this.svc.preview(id).subscribe({
      next: k => {
        this.result.set(k);
        this.loadedTabletId.set(id);
        this.previewLoading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.previewLoading.set(false);
        this.result.set(null);
        this.loadedTabletId.set(null);
        this.previewError.set(err.status === 404 ? 'not-found' : 'error');
      }
    });
  }

  closeCash() {
    const id = this.loadedTabletId();
    if (!id || this.justClosed()) return;
    if (!confirm(this.t('closeCash.confirm', { tablet: id }))) return;

    this.closeLoading.set(true);
    this.closeError.set(null);

    this.svc.close(id).subscribe({
      next: k => {
        this.result.set(k);
        this.justClosed.set(true);
        this.closeLoading.set(false);
        this.flash(this.t('closeCash.done', { tablet: k.tabletId }));
      },
      error: (err: HttpErrorResponse) => {
        this.closeLoading.set(false);
        if (err.status === 404) this.closeError.set('not-found');
        else if (err.status === 409) this.closeError.set('conflict');
        else this.closeError.set('error');
      }
    });
  }

  private flash(msg: string) {
    this.actionMsg.set(msg);
    setTimeout(() => this.actionMsg.set(''), 3000);
  }
}
