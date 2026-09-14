import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import * as XLSX from 'xlsx';
import { CategoryService, flattenCategories } from './category.service';
import { Category, CategoryInput, FlatCategory } from './category.model';
import { I18nService } from './i18n.service';
import { LANGS, TRANSLATIONS } from './translations';

// CATEGORIES.PRINTER selects the kitchen printer slot; anything <= 0 falls back to slot 1
// server-side (TicketPrintService.queryPrinterIndexForProduct), which is what -1 means here.
const PRINTER_DEFAULT = -1;
const PRINTER_SLOTS = [1, 2, 3];

const EMPTY_FORM: CategoryInput = {
  name: '',
  parentId: '',
  printer: PRINTER_DEFAULT
};

// The export writes the printer column as the label the table shows, so an unedited
// round-trip has to map it back. Both languages are accepted because the file may have
// been exported from a UI running the other one.
const PRINTER_LABEL_SLOTS = new Map<string, number>(
  LANGS.flatMap(lang => {
    const dict = TRANSLATIONS[lang];
    const pairs: Array<[string, number]> = [[dict['categories.printerDefault'], PRINTER_DEFAULT]];
    for (const slot of PRINTER_SLOTS) pairs.push([dict[`printers.slot${slot}`], slot]);
    return pairs;
  })
    .filter(([label]) => !!label)
    .map(([label, slot]) => [label.toLowerCase(), slot] as [string, number])
);

/** One row of the import sheet, before its ids are resolved against the live tree. */
interface CategoryImportRow {
  sourceId: string;
  name: string;
  sourceParentId: string;
  parentName: string;
  printer: number;
}

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

  // One row per category in the same order the table shows them, so the tree structure
  // survives the flattening: Level is the nesting depth and Parent names the row above it.
  // Ids are carried along because names alone are not unique across branches.
  exportCategories() {
    const entries = this.flat();
    if (entries.length === 0) {
      this.flash(this.t('categories.exportEmpty'));
      return;
    }

    const rows = entries.map(entry => ({
      Level: entry.depth + 1,
      Name: entry.category.name,
      Parent: entry.category.parentId ? this.categoryName(entry.category.parentId) : '',
      'Kitchen printer': this.printerLabel(entry.category.printer),
      Id: entry.category.id_,
      'Parent id': entry.category.parentId ?? ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Categories');
    XLSX.writeFile(workbook, `categories-${new Date().toISOString().slice(0, 10)}.xlsx`);
    this.flash(this.t('categories.exported', { count: entries.length }));
  }

  importCategories(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    if (!file) return;

    this.loading.set(true);
    file.arrayBuffer()
      .then(buffer => {
        const rows = this.readCategoryRows(XLSX.read(buffer, { type: 'array' }));
        if (rows.length === 0) throw new Error(this.t('categories.importNone'));
        return this.importParsedRows(rows);
      })
      .then(summary => {
        let message = this.t('categories.imported', { created: summary.created, updated: summary.updated });
        if (summary.failed > 0) message += ' ' + this.t('categories.importSkipped', { count: summary.failed });
        this.flash(message);
        this.load();
      })
      .catch(error => {
        this.loading.set(false);
        this.flash(error instanceof Error ? error.message : this.t('categories.importFailed'));
      })
      .finally(() => {
        if (input) input.value = '';
      });
  }

  // Reads the sheet the export writes, but stays lenient about where it came from: any
  // first sheet will do, and a row only needs a Name. Ids are optional - a hand-written
  // file addresses parents by name instead.
  private readCategoryRows(workbook: XLSX.WorkBook): CategoryImportRow[] {
    const sheet = workbook.Sheets['Categories'] ?? workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      .map(row => ({
        sourceId: this.toText(row['Id']),
        name: this.toText(row['Name']),
        sourceParentId: this.toText(row['Parent id']),
        parentName: this.toText(row['Parent']),
        printer: this.toPrinterSlot(row['Kitchen printer'])
      }))
      .filter(row => row.name !== '');
  }

  private async importParsedRows(rows: CategoryImportRow[]): Promise<{ created: number; updated: number; failed: number }> {
    const existing = flattenCategories(await firstValueFrom(this.svc.list())).map(entry => entry.category);
    const byId = new Map(existing.map(category => [category.id_, category]));
    const byParentAndName = new Map(existing.map(category => [this.matchKey(category.parentId, category.name), category]));

    // Ids in the file belong to whichever database it was exported from, so each one is
    // translated to the id the row actually ended up with here.
    const sourceToTarget = new Map<string, string>();
    const nameToTarget = new Map<string, string>();
    let created = 0;
    let updated = 0;
    let failed = 0;

    for (const row of this.orderParentsFirst(rows)) {
      let parentId = this.resolveParentId(row, byId, sourceToTarget, nameToTarget);
      const target = (row.sourceId ? byId.get(row.sourceId) : undefined)
        ?? byParentAndName.get(this.matchKey(parentId || null, row.name));
      // The backend rejects a self-parent with a 400; drop the edge instead of losing the row.
      if (target && parentId === target.id_) parentId = '';

      const value: CategoryInput = { name: row.name, parentId, printer: row.printer };
      try {
        const saved = target
          ? await firstValueFrom(this.svc.update(target.id_, value))
          : await firstValueFrom(this.svc.create(value));
        const savedId = saved?.id_ ?? target?.id_;
        if (savedId) {
          if (row.sourceId) sourceToTarget.set(row.sourceId, savedId);
          nameToTarget.set(row.name.toLowerCase(), savedId);
          byId.set(savedId, { ...value, id_: savedId, parentId: parentId || null });
          byParentAndName.set(this.matchKey(parentId || null, row.name), { ...value, id_: savedId, parentId: parentId || null });
        }
        if (target) updated++; else created++;
      } catch {
        failed++;
      }
    }

    return { created, updated, failed };
  }

  /**
   * Rows sorted so a parent is always saved before its children, whatever order the file
   * lists them in - a child saved first would have no parent to point at and would silently
   * land at top level. A row caught in a parent cycle is emitted before its parent, which
   * leaves it at top level rather than looping.
   */
  private orderParentsFirst(rows: CategoryImportRow[]): CategoryImportRow[] {
    const byId = new Map<string, CategoryImportRow>();
    const byName = new Map<string, CategoryImportRow>();
    for (const row of rows) {
      if (row.sourceId) byId.set(row.sourceId, row);
      const key = row.name.toLowerCase();
      if (!byName.has(key)) byName.set(key, row);
    }

    const ordered: CategoryImportRow[] = [];
    const done = new Set<CategoryImportRow>();
    const onStack = new Set<CategoryImportRow>();

    const visit = (row: CategoryImportRow) => {
      if (done.has(row) || onStack.has(row)) return;
      onStack.add(row);
      const parent = (row.sourceParentId ? byId.get(row.sourceParentId) : undefined)
        ?? (row.parentName ? byName.get(row.parentName.toLowerCase()) : undefined);
      if (parent && parent !== row) visit(parent);
      onStack.delete(row);
      done.add(row);
      ordered.push(row);
    };

    rows.forEach(visit);
    return ordered;
  }

  // Parent id first, since names repeat across branches; an id the file carries is only
  // usable directly when it also exists here. An unresolvable parent means top level.
  private resolveParentId(
    row: CategoryImportRow,
    byId: Map<string, Category>,
    sourceToTarget: Map<string, string>,
    nameToTarget: Map<string, string>
  ): string {
    if (row.sourceParentId) {
      const mapped = sourceToTarget.get(row.sourceParentId);
      if (mapped) return mapped;
      if (byId.has(row.sourceParentId)) return row.sourceParentId;
    }
    if (row.parentName) {
      const key = row.parentName.toLowerCase();
      const mapped = nameToTarget.get(key);
      if (mapped) return mapped;
      const match = Array.from(byId.values()).find(category => category.name.toLowerCase() === key);
      if (match) return match.id_;
    }
    return '';
  }

  private matchKey(parentId: string | null, name: string): string {
    return `${parentId ?? ''}::${name.toLowerCase()}`;
  }

  private toText(value: unknown): string {
    return String(value ?? '').trim();
  }

  private toPrinterSlot(value: unknown): number {
    const text = this.toText(value);
    if (text === '') return PRINTER_DEFAULT;
    const asNumber = Number(text);
    if (Number.isFinite(asNumber)) {
      const slot = Math.round(asNumber);
      return slot > 0 ? slot : PRINTER_DEFAULT;
    }
    return PRINTER_LABEL_SLOTS.get(text.toLowerCase()) ?? PRINTER_DEFAULT;
  }

  private flash(msg: string) {
    this.actionMsg.set(msg);
    setTimeout(() => this.actionMsg.set(''), 4000);
  }
}
