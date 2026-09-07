import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, from, of, catchError, concatMap, map, toArray } from 'rxjs';
import * as XLSX from 'xlsx';
import { ProductService } from './product.service';
import { Product, ProductInput, Category, AttributeSet } from './product.model';
import { TaxService } from './tax.service';
import { TaxCategory, TaxRate } from './tax.model';
import { I18nService } from './i18n.service';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Suggests the next free value for Code/Reference on a new product: one above the highest
// number already in use, zero-padded to the width the existing values use.
function nextNumericValue(values: (string | null)[]): string {
  const numeric = values.map(v => (v ?? '').trim()).filter(v => /^\d+$/.test(v));
  if (numeric.length === 0) return '1';
  const max = numeric.reduce((acc, v) => Math.max(acc, Number(v)), 0);
  const width = numeric.reduce((acc, v) => Math.max(acc, v.length), 0);
  return String(max + 1).padStart(width, '0');
}

// One editable row of the bulk-insert grid. A row without a name is an unused row and is
// simply skipped on insert.
interface BulkDraft {
  code: string;
  reference: string;
  name: string;
  categoryId: string;
  attributeSetId: string;
  taxCatId: string;
  unit: string;
  priceBuy: number;
  pricesell: number;
  active: boolean;
}

const BULK_INITIAL_ROWS = 3;

const EMPTY_FORM: ProductInput = {
  reference: '',
  code: '',
  name: '',
  priceBuy: 0,
  pricesell: 0,
  taxCatId: '',
  categoryId: '',
  unit: '',
  attributeSetId: '',
  active: true
};

type SortKey = 'code' | 'name' | 'category' | 'pricesell' | 'priceInclTax';
type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-products',
  imports: [CommonModule, FormsModule],
  templateUrl: './products.html',
  styleUrl: './products.css'
})
export class Products implements OnInit {
  private svc = inject(ProductService);
  private taxSvc = inject(TaxService);
  protected t = inject(I18nService).t;

  actionMsg = signal('');

  products = signal<Product[]>([]);
  // Ids ticked in the list; a Set keeps the membership test cheap while rendering rows.
  selectedIds = signal<Set<string>>(new Set<string>());
  categories = signal<Category[]>([]);
  attributeSets = signal<AttributeSet[]>([]);
  taxCategories = signal<TaxCategory[]>([]);
  taxRatesByCategory = signal<Record<string, TaxRate[]>>({});
  categoryFilter = signal('');
  loading = signal(false);
  saving = signal(false);
  deleting = signal(false);

  sortKey = signal<SortKey>('name');
  sortDirection = signal<SortDirection>('asc');

  editingId = signal<string | null>(null);
  isNew = signal(false);
  form = signal<ProductInput>({ ...EMPTY_FORM });

  // Unfiltered snapshot: codes must be unique across all products, but products() may be
  // narrowed by the category filter.
  allProducts = signal<Product[]>([]);

  bulkOpen = signal(false);
  bulkDrafts = signal<BulkDraft[]>([]);
  bulkInserting = signal(false);

  // Rows carrying a name are the ones that will be posted; the rest are still blank.
  bulkReady = computed<ProductInput[]>(() =>
    this.bulkDrafts()
      .filter(draft => draft.name.trim() !== '')
      .map(draft => ({
        name: draft.name.trim(),
        code: draft.code.trim(),
        reference: draft.reference.trim(),
        priceBuy: draft.priceBuy,
        pricesell: draft.pricesell,
        taxCatId: draft.taxCatId,
        categoryId: draft.categoryId,
        unit: draft.unit,
        attributeSetId: draft.attributeSetId,
        active: draft.active
      }))
  );

  // Codes are editable, so check them before posting: the backend rejects duplicates and a
  // mid-run rejection is more painful than a warning here.
  bulkErrors = computed<string[]>(() => {
    const errors: string[] = [];
    const taken = new Set<string>();
    for (const product of this.allProducts()) {
      if (product.code) taken.add(product.code);
    }

    const seen = new Set<string>();
    for (const input of this.bulkReady()) {
      const code = input.code ?? '';
      if (!code) continue;
      if (seen.has(code)) errors.push(this.t('bulk.duplicateRow', { code }));
      else if (taken.has(code)) errors.push(this.t('bulk.duplicateExisting', { code }));
      seen.add(code);
    }

    return errors;
  });

  selectedCount = computed(() => this.selectedIds().size);

  allSelected = computed(() => {
    const products = this.products();
    return products.length > 0 && products.every(product => this.selectedIds().has(product.id_));
  });

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  toggleSelection(id: string, event: Event) {
    // The row itself opens the editor; ticking a box should not.
    event.stopPropagation();
    this.selectedIds.update(ids => {
      const next = new Set(ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  toggleAll(event: Event) {
    event.stopPropagation();
    const all = this.allSelected();
    this.selectedIds.set(all ? new Set<string>() : new Set(this.products().map(p => p.id_)));
  }

  exportSelectedProducts() {
    const selected = this.products().filter(product => this.selectedIds().has(product.id_));
    if (selected.length === 0) {
      this.flash('Select at least one product to export.');
      return;
    }

    const rows = selected.map(product => ({
      Reference: product.reference ?? '',
      Code: product.code ?? '',
      Name: product.name,
      Category: this.categoryName(product.categoryId),
      'Attribute set': this.attributeSets().find(set => set.id === product.attributeSetId)?.name ?? '',
      'Price buy': product.priceBuy,
      'Price sell': product.pricesell,
      'Price incl. tax': this.priceInclTaxFor(product.pricesell, product.taxCatId) ?? '',
      'Tax category': this.taxCategories().find(cat => cat.id === product.taxCatId)?.name ?? '',
      Unit: product.unit ?? '',
      Active: product.active ? 'Yes' : 'No'
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
    XLSX.writeFile(workbook, `products-${new Date().toISOString().slice(0, 10)}.xlsx`);
    this.flash(`Exported ${selected.length} product${selected.length === 1 ? '' : 's'} to XLSX.`);
  }

  importProductsFromXlsx(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result;
      if (!(buffer instanceof ArrayBuffer)) {
        input.value = '';
        this.flash('Unable to read the selected XLSX file.');
        return;
      }

      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) {
        input.value = '';
        this.flash('The selected file does not contain a worksheet.');
        return;
      }

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
      const imported = rows
        .map(row => this.parseImportedProductRow(row))
        .filter((row): row is ProductInput => row !== null);

      if (imported.length === 0) {
        input.value = '';
        this.flash('No valid product rows were found in the XLSX file.');
        return;
      }

      from(imported).pipe(
        concatMap(product => this.svc.create(product).pipe(
          map(() => true),
          catchError(() => of(false))
        )),
        toArray()
      ).subscribe(results => {
        const created = results.filter(Boolean).length;
        this.load();
        this.refreshAllProducts();
        input.value = '';
        this.flash(created > 0 ? `Imported ${created} product${created === 1 ? '' : 's'} from XLSX.` : 'No products were imported.');
      });
    };

    reader.readAsArrayBuffer(file);
  }

  private parseImportedProductRow(row: Record<string, unknown>): ProductInput | null {
    const name = this.readImportedText(row, 'Name');
    if (!name || !name.trim()) return null;

    const categoryId = this.resolveImportCategory(this.readImportedText(row, 'Category'));
    const attributeSetId = this.resolveImportAttributeSet(this.readImportedText(row, 'Attribute set'));
    const taxCatId = this.resolveImportTaxCategory(this.readImportedText(row, 'Tax category'));

    return {
      reference: this.readImportedText(row, 'Reference') || '',
      code: this.readImportedText(row, 'Code') || '',
      name: name.trim(),
      priceBuy: this.readImportedNumber(row, 'Price buy'),
      pricesell: this.readImportedNumber(row, 'Price sell'),
      taxCatId,
      categoryId,
      unit: this.readImportedText(row, 'Unit') || '',
      attributeSetId,
      active: this.readImportedBoolean(row, 'Active')
    };
  }

  private readImportedText(row: Record<string, unknown>, key: string): string {
    const value = row[key] ?? row[this.normalizeImportHeader(key)] ?? row[this.normalizeImportHeader(key).toLowerCase()] ?? '';
    return value == null ? '' : String(value).trim();
  }

  private readImportedNumber(row: Record<string, unknown>, key: string): number {
    const value = row[key] ?? row[this.normalizeImportHeader(key)] ?? row[this.normalizeImportHeader(key).toLowerCase()];
    if (value === null || value === undefined || value === '') return 0;
    const numeric = Number(String(value).replace(/[$\s,]/g, ''));
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private readImportedBoolean(row: Record<string, unknown>, key: string): boolean {
    const value = row[key] ?? row[this.normalizeImportHeader(key)] ?? row[this.normalizeImportHeader(key).toLowerCase()];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const text = String(value ?? '').trim().toLowerCase();
    return ['yes', 'true', '1', 'y', 'active', 'on'].includes(text);
  }

  private normalizeImportHeader(value: string): string {
    return value
      .replace(/\s+/g, ' ')
      .trim();
  }

  private resolveImportCategory(value: string): string {
    if (!value) return '';
    const exact = this.categories().find(cat => cat.name.trim().toLowerCase() === value.toLowerCase());
    return exact?.id_ ?? '';
  }

  private resolveImportAttributeSet(value: string): string {
    if (!value) return '';
    const exact = this.attributeSets().find(set => set.name.trim().toLowerCase() === value.toLowerCase());
    return exact?.id ?? '';
  }

  private resolveImportTaxCategory(value: string): string {
    if (!value) return '';
    const exact = this.taxCategories().find(cat => cat.name.trim().toLowerCase() === value.toLowerCase());
    return exact?.id ?? '';
  }

  // Deletes every ticked product, one request at a time, and keeps the ones that failed
  // ticked so a retry is one click away.
  deleteSelected() {
    const selected = this.products().filter(product => this.selectedIds().has(product.id_));
    if (selected.length === 0) return;
    if (!confirm(this.t('products.confirmDeleteSelected', { count: selected.length }))) return;

    this.deleting.set(true);
    const failed = new Set<string>();

    from(selected).pipe(
      concatMap(product => this.svc.delete(product.id_).pipe(
        map(() => true),
        catchError(() => { failed.add(product.id_); return of(false); })
      )),
      toArray()
    ).subscribe(results => {
      const deleted = results.filter(Boolean).length;
      this.deleting.set(false);
      this.selectedIds.set(failed);
      this.products.update(products => products.filter(p => !this.wasDeleted(p, selected, failed)));
      if (this.editingId() && !this.products().some(p => p.id_ === this.editingId())) this.cancelEdit();
      this.flash(this.t('products.deletedSelected', { deleted, total: results.length }));
    });
  }

  private wasDeleted(product: Product, attempted: Product[], failed: Set<string>): boolean {
    return attempted.some(p => p.id_ === product.id_) && !failed.has(product.id_);
  }

  ngOnInit() {
    this.svc.categories().subscribe({ next: cats => this.categories.set(cats), error: () => {} });
    this.svc.attributeSets().subscribe({ next: sets => this.attributeSets.set(sets), error: () => {} });
    this.svc.taxCategories().subscribe({
      next: cats => {
        this.taxCategories.set(cats);
        this.loadTaxRates(cats);
      },
      error: () => {}
    });
    this.load();
  }

  private loadTaxRates(categories: TaxCategory[]) {
    if (categories.length === 0) return;
    forkJoin(categories.map(c => this.taxSvc.getCategory(c.id))).subscribe({
      next: details => {
        const map: Record<string, TaxRate[]> = {};
        for (const detail of details) map[detail.id] = detail.rates;
        this.taxRatesByCategory.set(map);
      },
      error: () => {}
    });
  }

  load() {
    this.loading.set(true);
    this.svc.list(this.categoryFilter() || undefined).subscribe({
      next: products => {
        this.products.set(products);
        if (!this.categoryFilter()) this.allProducts.set(products);
        this.selectedIds.update(ids => new Set(products.filter(p => ids.has(p.id_)).map(p => p.id_)));
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.flash(this.t('products.loadFailed')); }
    });
  }

  onCategoryFilterChange(value: string) {
    this.categoryFilter.set(value);
    this.load();
  }

  categoryName(id: string | null): string {
    if (!id) return '—';
    return this.categories().find(c => c.id_ === id)?.name ?? id;
  }

  sortedProducts(): Product[] {
    const items = [...this.products()];
    const dir = this.sortDirection() === 'asc' ? 1 : -1;

    items.sort((a, b) => {
      let left: string | number;
      let right: string | number;

      switch (this.sortKey()) {
        case 'code':
          left = (a.code ?? '').toLowerCase();
          right = (b.code ?? '').toLowerCase();
          break;
        case 'name':
          left = a.name.toLowerCase();
          right = b.name.toLowerCase();
          break;
        case 'category':
          left = this.categoryName(a.categoryId).toLowerCase();
          right = this.categoryName(b.categoryId).toLowerCase();
          break;
        case 'pricesell':
          left = a.pricesell;
          right = b.pricesell;
          break;
        case 'priceInclTax':
          left = this.priceInclTaxFor(a.pricesell, a.taxCatId) ?? Number.NEGATIVE_INFINITY;
          right = this.priceInclTaxFor(b.pricesell, b.taxCatId) ?? Number.NEGATIVE_INFINITY;
          break;
        default:
          left = a.name.toLowerCase();
          right = b.name.toLowerCase();
      }

      if (left < right) return -1 * dir;
      if (left > right) return 1 * dir;
      return 0;
    });

    return items;
  }

  toggleSort(key: SortKey) {
    if (this.sortKey() === key) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
      return;
    }

    this.sortKey.set(key);
    this.sortDirection.set('asc');
  }

  sortIndicator(key: SortKey): string {
    if (this.sortKey() !== key) return '↕';
    return this.sortDirection() === 'asc' ? '▲' : '▼';
  }

  // Mirrors the backend's resolveTaxId(): the newest rate whose validFrom is on or before
  // today. Returns the raw stored fraction (e.g. 0.2 for 20%), matching TAXES.RATE - use
  // currentTaxRatePercent() to display it.
  currentTaxRate(taxCatId: string | null): number | null {
    if (!taxCatId) return null;
    const rates = this.taxRatesByCategory()[taxCatId];
    if (!rates || rates.length === 0) return null;
    const today = todayIso();
    const applicable = rates.filter(r => r.validFrom <= today).sort((a, b) => b.validFrom.localeCompare(a.validFrom));
    return applicable.length > 0 ? applicable[0].rate : null;
  }

  currentTaxRatePercent(taxCatId: string | null): number | null {
    const rate = this.currentTaxRate(taxCatId);
    return rate === null ? null : rate * 100;
  }

  priceInclTaxFor(pricesell: number, taxCatId: string | null): number | null {
    const rate = this.currentTaxRate(taxCatId);
    return rate === null ? null : pricesell * (1 + rate);
  }

  priceInclTax(): number | null {
    return this.priceInclTaxFor(this.form().pricesell, this.form().taxCatId);
  }

  updateForm<K extends keyof ProductInput>(key: K, value: ProductInput[K]) {
    this.form.update(f => ({ ...f, [key]: value }));
  }

  startCreate() {
    this.bulkOpen.set(false);
    this.isNew.set(true);
    this.editingId.set(null);
    this.form.set({ ...EMPTY_FORM });
    this.suggestCodes();
  }

  // The loaded list may be narrowed by the category filter, so pull the unfiltered list to
  // avoid suggesting a code that a product in another category already uses.
  private suggestCodes() {
    this.refreshAllProducts(products => this.applySuggestedCodes(products));
  }

  private refreshAllProducts(then?: (products: Product[]) => void) {
    this.svc.list().subscribe({
      next: products => { this.allProducts.set(products); then?.(products); },
      error: () => then?.(this.products())
    });
  }

  private applySuggestedCodes(products: Product[]) {
    if (!this.isNew()) return;
    this.form.update(f => ({
      ...f,
      code: f.code || nextNumericValue(products.map(p => p.code)),
      reference: f.reference || nextNumericValue(products.map(p => p.reference))
    }));
  }

  // Opens the new-product form seeded from an existing product; Code and Reference are left
  // blank so suggestCodes() assigns fresh ones.
  copyProduct(product: Product, event: Event) {
    event.stopPropagation();
    this.bulkOpen.set(false);
    this.isNew.set(true);
    this.editingId.set(null);
    this.form.set({
      reference: '',
      code: '',
      name: this.t('products.copySuffix', { name: product.name }),
      priceBuy: product.priceBuy,
      pricesell: product.pricesell,
      taxCatId: product.taxCatId ?? '',
      categoryId: product.categoryId ?? '',
      unit: product.unit ?? '',
      attributeSetId: product.attributeSetId ?? '',
      active: product.active
    });
    this.suggestCodes();
  }

  startEdit(product: Product) {
    this.bulkOpen.set(false);
    this.isNew.set(false);
    this.editingId.set(product.id_);
    this.form.set({
      reference: product.reference ?? '',
      code: product.code ?? '',
      name: product.name,
      priceBuy: product.priceBuy,
      pricesell: product.pricesell,
      taxCatId: product.taxCatId ?? '',
      categoryId: product.categoryId ?? '',
      unit: product.unit ?? '',
      attributeSetId: product.attributeSetId ?? '',
      active: product.active
    });
  }

  cancelEdit() {
    this.isNew.set(false);
    this.editingId.set(null);
  }

  startBulkInsert() {
    this.isNew.set(false);
    this.editingId.set(null);
    this.bulkOpen.set(true);
    this.bulkDrafts.set([]);
    // Seed the grid only once the unfiltered list is in, so the suggested codes are free ones.
    this.refreshAllProducts(() => {
      for (let i = 0; i < BULK_INITIAL_ROWS; i++) this.addBulkRow();
    });
  }

  addBulkRow() {
    this.bulkDrafts.update(drafts => [...drafts, this.draftAfter(drafts)]);
  }

  removeBulkRow(index: number) {
    this.bulkDrafts.update(drafts => drafts.filter((_, i) => i !== index));
  }

  updateBulkDraft<K extends keyof BulkDraft>(index: number, key: K, value: BulkDraft[K]) {
    this.bulkDrafts.update(drafts => drafts.map((d, i) => (i === index ? { ...d, [key]: value } : d)));
  }

  // Continues the Code/Reference numbering past both the stored products and the rows already
  // in the grid, so a grid filled in one go gets distinct codes. Category, attribute set, tax
  // category and unit are carried over from the row above - consecutive rows usually share
  // them, and each one stays editable.
  private draftAfter(drafts: BulkDraft[]): BulkDraft {
    const known = this.allProducts().length > 0 ? this.allProducts() : this.products();
    const previous = drafts[drafts.length - 1];
    return {
      code: nextNumericValue([...known.map(p => p.code), ...drafts.map(d => d.code)]),
      reference: nextNumericValue([...known.map(p => p.reference), ...drafts.map(d => d.reference)]),
      name: '',
      categoryId: previous?.categoryId ?? '',
      attributeSetId: previous?.attributeSetId ?? '',
      taxCatId: previous?.taxCatId ?? '',
      unit: previous?.unit ?? '',
      priceBuy: 0,
      pricesell: 0,
      active: previous?.active ?? true
    };
  }

  cancelBulkInsert() {
    this.bulkOpen.set(false);
  }

  // Posts the rows one at a time - the API takes a single product per request, and sequential
  // writes keep the products in the order shown in the grid.
  bulkInsert() {
    const inputs = this.bulkReady();
    if (inputs.length === 0) { this.flash(this.t('bulk.nothing')); return; }
    if (this.bulkErrors().length > 0) { this.flash(this.t('bulk.fixDuplicates')); return; }

    this.bulkInserting.set(true);
    const failed: BulkDraft[] = [];

    from(inputs).pipe(
      concatMap(input => this.svc.create(input).pipe(
        map(() => true),
        catchError(() => {
          failed.push({
            code: input.code ?? '',
            reference: input.reference ?? '',
            name: input.name,
            categoryId: input.categoryId ?? '',
            attributeSetId: input.attributeSetId ?? '',
            taxCatId: input.taxCatId ?? '',
            unit: input.unit ?? '',
            priceBuy: input.priceBuy,
            pricesell: input.pricesell,
            active: input.active
          });
          return of(false);
        })
      )),
      toArray()
    ).subscribe(results => {
      const created = results.filter(Boolean).length;
      this.bulkInserting.set(false);
      // Keep the rows that failed so they can be corrected and retried.
      this.bulkDrafts.set(failed);
      if (failed.length === 0) this.bulkOpen.set(false);
      this.flash(this.t('bulk.result', { created, total: results.length }));
      this.load();
      this.refreshAllProducts();
    });
  }

  save() {
    const value = this.form();
    if (!value.name.trim()) { this.flash(this.t('products.nameRequired')); return; }

    this.saving.set(true);
    const request = this.isNew() ? this.svc.create(value) : this.svc.update(this.editingId()!, value);
    const wasNew = this.isNew();

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.flash(this.t(wasNew ? 'products.created' : 'products.updated'));
        this.isNew.set(false);
        this.editingId.set(null);
        this.load();
      },
      error: () => { this.saving.set(false); this.flash(this.t('products.saveFailed')); }
    });
  }

  remove(product: Product, event: Event) {
    event.stopPropagation();
    if (!confirm(this.t('products.confirmDelete', { name: product.name }))) return;
    this.svc.delete(product.id_).subscribe({
      next: () => {
        this.products.update(products => products.filter(p => p.id_ !== product.id_));
        this.selectedIds.update(ids => {
          const next = new Set(ids);
          next.delete(product.id_);
          return next;
        });
        if (this.editingId() === product.id_) this.cancelEdit();
        this.flash(this.t('products.deleted', { name: product.name }));
      },
      error: () => this.flash(this.t('products.deleteFailed', { name: product.name }))
    });
  }

  private flash(msg: string) {
    this.actionMsg.set(msg);
    setTimeout(() => this.actionMsg.set(''), 3000);
  }
}
