import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { PrinterService } from './printer.service';
import { PrinterSlotConfig } from './printer.model';
import { I18nService } from './i18n.service';

// The API's sentinel for an unassigned slot - a stored value, not display text, so it stays
// untranslated; only its label in the dropdown is translated.
const NOT_DEFINED = 'Not defined';

const SLOT_LABEL_KEYS: Record<string, string> = {
  '1': 'printers.slot1',
  '2': 'printers.slot2',
  '3': 'printers.slot3',
  'customer': 'printers.customer'
};

@Component({
  selector: 'app-printers',
  imports: [CommonModule, FormsModule],
  templateUrl: './printers.html',
  styleUrl: './printers.css'
})
export class Printers implements OnInit {
  private svc = inject(PrinterService);
  protected t = inject(I18nService).t;

  actionMsg = signal('');

  installedPrinters = signal<string[]>([]);
  slots = signal<PrinterSlotConfig[]>([]);
  pendingSelection = signal<Record<string, string>>({});
  saving = signal<Record<string, boolean>>({});

  loading = signal(false);

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    forkJoin({ installed: this.svc.installed(), config: this.svc.config() }).subscribe({
      next: ({ installed, config }) => {
        this.installedPrinters.set(installed);
        this.slots.set(config);
        this.pendingSelection.set(Object.fromEntries(config.map(c => [c.slot, c.printerName ?? NOT_DEFINED])));
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.flash(this.t('printers.loadFailed')); }
    });
  }

  slotLabel(slot: string): string {
    const key = SLOT_LABEL_KEYS[slot];
    return key ? this.t(key) : slot;
  }

  onSelectionChange(slot: string, value: string) {
    this.pendingSelection.update(sel => ({ ...sel, [slot]: value }));
  }

  isDirty(slot: PrinterSlotConfig): boolean {
    return this.pendingSelection()[slot.slot] !== (slot.printerName ?? NOT_DEFINED);
  }

  save(slot: PrinterSlotConfig) {
    const printerName = this.pendingSelection()[slot.slot] ?? NOT_DEFINED;
    this.saving.update(s => ({ ...s, [slot.slot]: true }));
    this.svc.configure(slot.slot, printerName).subscribe({
      next: updated => {
        this.saving.update(s => ({ ...s, [slot.slot]: false }));
        this.slots.update(list => list.map(s => s.slot === updated.slot ? updated : s));
        this.flash(this.t('printers.saved', { slot: this.slotLabel(slot.slot), printer: updated.printerName }));
      },
      error: () => {
        this.saving.update(s => ({ ...s, [slot.slot]: false }));
        this.flash(this.t('printers.saveFailed', { slot: this.slotLabel(slot.slot) }));
      }
    });
  }

  private flash(msg: string) {
    this.actionMsg.set(msg);
    setTimeout(() => this.actionMsg.set(''), 3000);
  }
}
