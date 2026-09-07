import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TaxService } from './tax.service';
import { TaxCategory, TaxCategoryDetail, TaxRate } from './tax.model';
import { I18nService } from './i18n.service';

interface RateForm {
  name: string;
  /** Percentage as typed by the admin (e.g. 20 for 20%) - converted to/from the
   *  backend's stored decimal fraction (0.2) at the service-call boundary below. */
  rate: number;
  validFrom: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_RATE_FORM: RateForm = { name: '', rate: 0, validFrom: todayIso() };

@Component({
  selector: 'app-taxes',
  imports: [CommonModule, FormsModule],
  templateUrl: './taxes.html',
  styleUrl: './taxes.css'
})
export class Taxes implements OnInit {
  private svc = inject(TaxService);
  protected t = inject(I18nService).t;

  actionMsg = signal('');

  categories = signal<TaxCategory[]>([]);
  selectedCategoryId = signal<string | null>(null);
  selectedCategory = signal<TaxCategoryDetail | null>(null);

  loadingCategories = signal(false);
  loadingDetail = signal(false);

  newCategoryName = signal('');
  renameValue = signal('');

  editingRateId = signal<string | null>(null);
  rateForm = signal<RateForm>({ ...EMPTY_RATE_FORM });

  ngOnInit() {
    this.loadCategories();
  }

  loadCategories() {
    this.loadingCategories.set(true);
    this.svc.listCategories().subscribe({
      next: cats => { this.categories.set(cats); this.loadingCategories.set(false); },
      error: () => { this.loadingCategories.set(false); this.flash(this.t('taxes.loadFailed')); }
    });
  }

  selectCategory(id: string) {
    this.selectedCategoryId.set(id);
    this.loadingDetail.set(true);
    this.cancelRateForm();
    this.svc.getCategory(id).subscribe({
      next: detail => {
        this.selectedCategory.set(detail);
        this.renameValue.set(detail.name);
        this.loadingDetail.set(false);
      },
      error: () => { this.loadingDetail.set(false); this.flash(this.t('taxes.loadOneFailed')); }
    });
  }

  closeDetail() {
    this.selectedCategoryId.set(null);
    this.selectedCategory.set(null);
  }

  createCategory() {
    const name = this.newCategoryName().trim();
    if (!name) return;
    this.svc.createCategory(name).subscribe({
      next: () => { this.newCategoryName.set(''); this.flash(this.t('taxes.created', { name })); this.loadCategories(); },
      error: () => this.flash(this.t('taxes.createFailed'))
    });
  }

  saveRename() {
    const id = this.selectedCategoryId();
    const name = this.renameValue().trim();
    if (!id || !name) return;
    this.svc.renameCategory(id, name).subscribe({
      next: () => {
        this.selectedCategory.update(cat => cat ? { ...cat, name } : cat);
        this.flash(this.t('taxes.renamed'));
        this.loadCategories();
      },
      error: () => this.flash(this.t('taxes.renameFailed'))
    });
  }

  deleteCategory(category: TaxCategory, event: Event) {
    event.stopPropagation();
    if (!confirm(this.t('taxes.confirmDelete', { name: category.name }))) return;
    this.svc.deleteCategory(category.id).subscribe({
      next: () => {
        this.categories.update(cats => cats.filter(c => c.id !== category.id));
        if (this.selectedCategoryId() === category.id) this.closeDetail();
        this.flash(this.t('taxes.deleted', { name: category.name }));
      },
      error: () => this.flash(this.t('taxes.deleteFailed', { name: category.name }))
    });
  }

  updateRateForm<K extends keyof RateForm>(key: K, value: RateForm[K]) {
    this.rateForm.update(f => ({ ...f, [key]: value }));
  }

  startAddRate() {
    this.editingRateId.set(null);
    this.rateForm.set({ ...EMPTY_RATE_FORM });
  }

  startEditRate(rate: TaxRate) {
    this.editingRateId.set(rate.id);
    this.rateForm.set({ name: rate.name, rate: rate.rate * 100, validFrom: rate.validFrom });
  }

  cancelRateForm() {
    this.editingRateId.set(null);
    this.rateForm.set({ ...EMPTY_RATE_FORM });
  }

  saveRate() {
    const categoryId = this.selectedCategoryId();
    const form = this.rateForm();
    if (!categoryId || !form.name.trim() || !form.validFrom) return;

    const fraction = form.rate / 100;
    const editingId = this.editingRateId();
    const request = editingId
      ? this.svc.updateRate(categoryId, editingId, form.name.trim(), fraction, form.validFrom)
      : this.svc.createRate(categoryId, form.name.trim(), fraction, form.validFrom);

    request.subscribe({
      next: () => {
        this.flash(this.t(editingId ? 'taxes.rateUpdated' : 'taxes.rateAdded'));
        this.cancelRateForm();
        this.selectCategory(categoryId);
      },
      error: () => this.flash(this.t('taxes.rateSaveFailed'))
    });
  }

  deleteRate(rate: TaxRate) {
    const categoryId = this.selectedCategoryId();
    if (!categoryId) return;
    if (!confirm(this.t('taxes.confirmDeleteRate', { name: rate.name, percent: rate.rate * 100 }))) return;
    this.svc.deleteRate(categoryId, rate.id).subscribe({
      next: () => {
        this.selectedCategory.update(cat => cat ? { ...cat, rates: cat.rates.filter(r => r.id !== rate.id) } : cat);
        this.flash(this.t('taxes.rateDeleted', { name: rate.name }));
      },
      error: () => this.flash(this.t('taxes.rateDeleteFailed', { name: rate.name }))
    });
  }

  private flash(msg: string) {
    this.actionMsg.set(msg);
    setTimeout(() => this.actionMsg.set(''), 3000);
  }
}
