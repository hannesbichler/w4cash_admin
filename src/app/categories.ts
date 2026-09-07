import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { CategoryService, flattenCategories } from './category.service';
import { Category, CategoryInput, FlatCategory } from './category.model';
import { I18nService } from './i18n.service';

// CATEGORIES.PRINTER selects the kitchen printer slot; anything <= 0 falls back to slot 1
// server-side (TicketPrintService.queryPrinterIndexForProduct), which is what -1 means here.
const PRINTER_DEFAULT = -1;
const PRINTER_SLOTS = [1, 2, 3];

const EMPTY_FORM: CategoryInput = {
  name: '',
  parentId: '',
  printer: PRINTER_DEFAULT
};

@Component({
  selector: 'app-categories',
  imports: [CommonModule, FormsModule],
  templateUrl: './categories.html',
  styleUrl: './categories.css'
})
export class Categories implements OnInit {
  private svc = inject(CategoryService);
  protected t = inject(I18nService).t;

  actionMsg = signal('');

  roots = signal<Category[]>([]);
  loading = signal(false);
  saving = signal(false);

  editingId = signal<string | null>(null);
  isNew = signal(false);
  form = signal<CategoryInput>({ ...EMPTY_FORM });

  printerSlots = PRINTER_SLOTS;
  printerDefault = PRINTER_DEFAULT;

  flat = computed<FlatCategory[]>(() => flattenCategories(this.roots()));

  // A category cannot be moved under itself or one of its own descendants, so those are left
  // out of the parent picker rather than rejected on save.
  parentOptions = computed<FlatCategory[]>(() => {
    const id = this.editingId();
    if (!id) return this.flat();
    const blocked = new Set<string>();
    const collect = (category: Category) => {
      blocked.add(category.id_);
      for (const child of category.children ?? []) collect(child);
    };
    const self = this.flat().find(entry => entry.category.id_ === id);
    if (self) collect(self.category);
    return this.flat().filter(entry => !blocked.has(entry.category.id_));
  });

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.svc.list().subscribe({
      next: roots => { this.roots.set(roots); this.loading.set(false); },
      error: () => { this.loading.set(false); this.flash(this.t('categories.loadFailed')); }
    });
  }

  categoryName(id: string | null): string {
    if (!id) return '—';
    return this.flat().find(entry => entry.category.id_ === id)?.category.name ?? id;
  }

  printerLabel(printer: number): string {
    if (printer <= 0) return this.t('categories.printerDefault');
    return this.t(`printers.slot${printer}`);
  }

  updateForm<K extends keyof CategoryInput>(key: K, value: CategoryInput[K]) {
    this.form.set({ ...this.form(), [key]: value });
  }

  startCreate() {
    this.isNew.set(true);
    this.editingId.set(null);
    this.form.set({ ...EMPTY_FORM });
  }

  startEdit(category: Category) {
    this.isNew.set(false);
    this.editingId.set(category.id_);
    this.form.set({
      name: category.name,
      parentId: category.parentId ?? '',
      printer: category.printer
    });
  }

  cancelEdit() {
    this.isNew.set(false);
    this.editingId.set(null);
  }

  save() {
    const value = this.form();
    if (!value.name.trim()) { this.flash(this.t('categories.nameRequired')); return; }

    this.saving.set(true);
    const wasNew = this.isNew();
    const request = wasNew ? this.svc.create(value) : this.svc.update(this.editingId()!, value);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.flash(this.t(wasNew ? 'categories.created' : 'categories.updated'));
        this.cancelEdit();
        this.load();
      },
      error: () => { this.saving.set(false); this.flash(this.t('categories.saveFailed')); }
    });
  }

  remove(category: Category, event: Event) {
    event.stopPropagation();
    if (!confirm(this.t('categories.confirmDelete', { name: category.name }))) return;
    this.svc.delete(category.id_).subscribe({
      next: () => {
        if (this.editingId() === category.id_) this.cancelEdit();
        this.flash(this.t('categories.deleted', { name: category.name }));
        this.load();
      },
      // 409 means the category still has subcategories or products; the body says which.
      error: (err: HttpErrorResponse) => this.flash(
        err.status === 409 && typeof err.error === 'string'
          ? err.error
          : this.t('categories.deleteFailed', { name: category.name })
      )
    });
  }

  private flash(msg: string) {
    this.actionMsg.set(msg);
    setTimeout(() => this.actionMsg.set(''), 4000);
  }
}
