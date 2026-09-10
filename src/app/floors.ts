import { Component, ElementRef, HostListener, computed, inject, signal, viewChild, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin, from, map, of, concatMap, toArray, Observable } from 'rxjs';
import * as XLSX from 'xlsx';
import { FloorService } from './floor.service';
import { Floor, FloorInput, Place, PlaceInput } from './floor.model';
import { I18nService } from './i18n.service';

const EMPTY_FLOOR_FORM: FloorInput = {
  name: '',
  sortOrder: null
};

// A new table starts at a workable size rather than unset, so it is visible on the plan and
// can be dragged straight away; font colour still stays null for the POS default.
const NEW_PLACE_WIDTH = 100;
const NEW_PLACE_HEIGHT = 100;
const NEW_PLACE_FONT_SIZE = 18;

// X/Y are NOT NULL in PLACES.
const EMPTY_PLACE_FORM: PlaceInput = {
  name: '',
  floorId: '',
  x: 0,
  y: 0,
  width: NEW_PLACE_WIDTH,
  height: NEW_PLACE_HEIGHT,
  fontSize: NEW_PLACE_FONT_SIZE,
  fontColor: null
};

// What the POS falls back to when WIDTH/HEIGHT/FONTSIZE are NULL (see Place.java in the
// desktop app), so the preview draws an unset table the same size the POS does.
const PLACE_DEFAULT_WIDTH = 100;
const PLACE_DEFAULT_HEIGHT = 60;
const PLACE_DEFAULT_FONT_SIZE = 12;
const PLACE_DEFAULT_FONT_COLOR = '#1a1a2e';

// Breathing room right and below the outermost table, in floor-plan units.
const PLAN_PADDING = 20;

// The drag handle drawn in each table's bottom-right corner, and the smallest table a drag is
// allowed to produce - both in floor-plan units.
const PLAN_HANDLE_SIZE = 14;
const PLAN_MIN_SIZE = 20;

// How far the pointer has to travel, in plan units, before a press counts as a drag rather
// than a click that opens the table in the editor.
const PLAN_DRAG_THRESHOLD = 3;

// The right-click menu's own size in screen pixels, used to keep it inside the plan when a
// table near the right or bottom edge is clicked. Kept in step with .plan-menu in floors.css.
const PLAN_MENU_WIDTH = 170;
const PLAN_MENU_HEIGHT = 76;

/** One table resolved to what the plan actually draws, drag preview included. */
interface PlanTable {
  place: Place;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontColor: string;
}

/** A drag in progress on the plan: moving a table, or resizing it by its corner. */
interface PlanDrag {
  mode: 'move' | 'resize';
  place: Place;
  originX: number;
  originY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  moved: boolean;
}

/** The open right-click menu: which table it acts on, and where it sits over the plan. */
interface PlanMenu {
  place: Place;
  /** Pixels from the plan wrapper's top-left corner, not the page's. */
  x: number;
  y: number;
}

/** The geometry a drag is previewing; only written to the place on drop. */
interface PlanPreview {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FloorImportRow {
  sourceFloorId: string;
  floorName: string;
  sortOrder: number | null;
}

interface TableImportRow {
  sourceFloorId: string;
  sourceFloorName: string;
  tableName: string;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  fontSize: number | null;
  fontColor: string | null;
}

/**
 * What a number input's ngModelChange actually emits: a number, or null once the field is
 * cleared - never the string the old handlers assumed.
 */
type NumberInput = number | string | null | undefined;

/** Blank stays null ("unset"); the columns behind these fields are integers. */
function toNullableInt(value: NumberInput): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === '') return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

/** Which entity the detail panel is editing: the floor itself or one of its tables. */
type Panel = 'floor' | 'place' | null;

@Component({
  selector: 'app-floors',
  imports: [CommonModule, FormsModule],
  templateUrl: './floors.html',
  styleUrl: './floors.css'
})
export class Floors implements OnInit {
  private svc = inject(FloorService);
  protected t = inject(I18nService).t;

  actionMsg = signal('');

  floors = signal<Floor[]>([]);
  selectedFloorIds = signal<Set<string>>(new Set<string>());
  loading = signal(false);
  // Either list can be collapsed to give the other one the full panel.
  floorsCollapsed = signal(false);
  placesCollapsed = signal(false);
  planCollapsed = signal(false);

  // The floor whose tables are listed; stays selected while a table is edited.
  selectedFloorId = signal<string | null>(null);
  places = signal<Place[]>([]);
  selectedPlaceIds = signal<Set<string>>(new Set<string>());
  loadingPlaces = signal(false);

  panel = signal<Panel>(null);
  saving = signal(false);

  editingFloorId = signal<string | null>(null);
  floorForm = signal<FloorInput>({ ...EMPTY_FLOOR_FORM });

  editingPlaceId = signal<string | null>(null);
  placeForm = signal<PlaceInput>({ ...EMPTY_PLACE_FORM });

  planSvg = viewChild<ElementRef<SVGSVGElement>>('planSvg');
  importFileInput = viewChild<ElementRef<HTMLInputElement>>('importFileInput');
  // The positioned box the right-click menu is placed inside.
  planWrap = viewChild<ElementRef<HTMLElement>>('planWrap');
  planMenu = signal<PlanMenu | null>(null);
  handleSize = PLAN_HANDLE_SIZE;
  // The live geometry while a table is being dragged; the stored place is only written on drop.
  planPreview = signal<PlanPreview | null>(null);
  private drag: PlanDrag | null = null;

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.svc.list().subscribe({
      next: floors => {
        this.floors.set(floors);
        const knownIds = new Set(floors.map(floor => floor.id_));
        this.selectedFloorIds.update(ids => new Set(Array.from(ids).filter(id => knownIds.has(id))));
        if (this.selectedFloorId() !== null && !knownIds.has(this.selectedFloorId()!)) {
          this.selectedFloorId.set(null);
          this.places.set([]);
          this.selectedPlaceIds.set(new Set<string>());
          this.closePanel();
        }
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.flash(this.t('floors.loadFailed')); }
    });
  }

  exportFloorsAndTables() {
    this.loading.set(true);
    this.svc.list().subscribe({
      next: floors => {
        forkJoin(
          floors.map(floor => this.svc.places(floor.id_).pipe(
            map(places => ({ floor, places }))
          ))
        ).subscribe({
          next: floorEntries => {
            const floorRows = floorEntries.map(({ floor }) => ({
              'Floor id': floor.id_,
              'Floor name': floor.name,
              'Sort order': floor.sortOrder ?? ''
            }));

            const tableRows: Record<string, unknown>[] = floorEntries.flatMap(({ floor, places }) =>
              places.map(place => ({
                'Floor id': floor.id_,
                'Floor name': floor.name,
                'Table id': place.id_,
                'Table name': place.name,
                'X': place.x,
                'Y': place.y,
                'Width': place.width ?? '',
                'Height': place.height ?? '',
                'Font size': place.fontSize ?? '',
                'Font color': place.fontColor ?? ''
              }))
            );

            const workbook = XLSX.utils.book_new();
            const floorsSheet = XLSX.utils.json_to_sheet(floorRows);
            const tablesSheet = XLSX.utils.json_to_sheet(tableRows);
            XLSX.utils.book_append_sheet(workbook, floorsSheet, 'Floors');
            XLSX.utils.book_append_sheet(workbook, tablesSheet, 'Tables');
            XLSX.writeFile(workbook, `floors-and-tables-${new Date().toISOString().slice(0, 10)}.xlsx`);
            this.loading.set(false);
            this.flash(`Exported ${floors.length} floor${floors.length === 1 ? '' : 's'} and all tables to XLSX.`);
          },
          error: () => {
            this.loading.set(false);
            this.flash('Failed to export floors and tables.');
          }
        });
      },
      error: () => {
        this.loading.set(false);
        this.flash(this.t('floors.loadFailed'));
      }
    });
  }

  openImportFloorsAndTables() {
    const input = this.importFileInput()?.nativeElement;
    if (!input) return;
    input.value = '';
    input.click();
  }

  importFloorsAndTables(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    if (!file) return;

    this.loading.set(true);
    file.arrayBuffer()
      .then(buffer => {
        const workbook = XLSX.read(buffer, { type: 'array' });
        const floorRows = this.readFloorRows(workbook);
        const tableRows = this.readTableRows(workbook);
        if (floorRows.length === 0 && tableRows.length === 0) {
          throw new Error('The XLSX file has no importable Floors or Tables rows.');
        }
        return this.importParsedRows$(floorRows, tableRows);
      })
      .then(summary => {
        this.loading.set(false);
        const tableText = summary.tablesImported === 1 ? 'table' : 'tables';
        const floorText = summary.floorsImported === 1 ? 'floor' : 'floors';
        this.flash(`Imported ${summary.floorsImported} ${floorText} and ${summary.tablesImported} ${tableText} from XLSX.`);
        this.load();
      })
      .catch(error => {
        this.loading.set(false);
        const message = error instanceof Error ? error.message : 'Failed to import floors and tables.';
        this.flash(message);
      })
      .finally(() => {
        if (input) input.value = '';
      });
  }

  private readFloorRows(workbook: XLSX.WorkBook): FloorImportRow[] {
    const sheet = workbook.Sheets['Floors'];
    if (!sheet) return [];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    return rows
      .map(row => ({
        sourceFloorId: this.toText(row['Floor id']),
        floorName: this.toText(row['Floor name']),
        sortOrder: this.toNullableWholeNumber(row['Sort order'])
      }))
      .filter(row => row.floorName !== '');
  }

  private readTableRows(workbook: XLSX.WorkBook): TableImportRow[] {
    const sheet = workbook.Sheets['Tables'];
    if (!sheet) return [];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    return rows
      .map(row => ({
        sourceFloorId: this.toText(row['Floor id']),
        sourceFloorName: this.toText(row['Floor name']),
        tableName: this.toText(row['Table name']),
        x: this.toWholeNumberOrDefault(row['X'], 0),
        y: this.toWholeNumberOrDefault(row['Y'], 0),
        width: this.toNullableWholeNumber(row['Width']),
        height: this.toNullableWholeNumber(row['Height']),
        fontSize: this.toNullableWholeNumber(row['Font size']),
        fontColor: this.toNullableText(row['Font color'])
      }))
      .filter(row => row.tableName !== '');
  }

  private importParsedRows$(floorRows: FloorImportRow[], tableRows: TableImportRow[]): Promise<{ floorsImported: number; tablesImported: number }> {
    return new Promise((resolve, reject) => {
      this.svc.list().subscribe({
        next: existingFloors => {
          const floorsByName = new Map(existingFloors.map(floor => [floor.name.toLowerCase(), floor]));
          const sourceFloorIdToTargetId = new Map<string, string>();

          from(floorRows).pipe(
            concatMap(row => {
              const known = floorsByName.get(row.floorName.toLowerCase());
              if (known) {
                sourceFloorIdToTargetId.set(row.sourceFloorId, known.id_);
                return this.svc.update(known.id_, { name: known.name, sortOrder: row.sortOrder }).pipe(
                  map(saved => {
                    floorsByName.set(saved.name.toLowerCase(), saved);
                    sourceFloorIdToTargetId.set(row.sourceFloorId, saved.id_);
                    return saved;
                  })
                );
              }

              return this.svc.create({ name: row.floorName, sortOrder: row.sortOrder }).pipe(
                map(saved => {
                  floorsByName.set(saved.name.toLowerCase(), saved);
                  sourceFloorIdToTargetId.set(row.sourceFloorId, saved.id_);
                  return saved;
                })
              );
            }),
            toArray(),
            concatMap(() => {
              const tableRowsWithTarget = tableRows.map(row => {
                const targetFloorId = sourceFloorIdToTargetId.get(row.sourceFloorId)
                  ?? floorsByName.get(row.sourceFloorName.toLowerCase())?.id_
                  ?? null;
                return { row, targetFloorId };
              }).filter(item => item.targetFloorId !== null) as Array<{ row: TableImportRow; targetFloorId: string }>;

              if (tableRowsWithTarget.length === 0) {
                return of([] as Place[]);
              }

              const targetFloorIds = Array.from(new Set(tableRowsWithTarget.map(item => item.targetFloorId)));
              return forkJoin(targetFloorIds.map(floorId => this.svc.places(floorId).pipe(
                map(places => ({ floorId, places }))
              ))).pipe(
                concatMap(existingPlacesByFloor => {
                  const placeByFloorAndName = new Map<string, Place>();
                  existingPlacesByFloor.forEach(entry => {
                    entry.places.forEach(place => {
                      placeByFloorAndName.set(`${entry.floorId}::${place.name.toLowerCase()}`, place);
                    });
                  });

                  return from(tableRowsWithTarget).pipe(
                    concatMap(({ row, targetFloorId }) => {
                      const key = `${targetFloorId}::${row.tableName.toLowerCase()}`;
                      const existing = placeByFloorAndName.get(key);
                      const input: PlaceInput = {
                        name: row.tableName,
                        floorId: targetFloorId,
                        x: row.x,
                        y: row.y,
                        width: row.width,
                        height: row.height,
                        fontSize: row.fontSize,
                        fontColor: row.fontColor
                      };

                      if (existing) {
                        return this.svc.updatePlace(existing.id_, input).pipe(
                          map(saved => {
                            placeByFloorAndName.set(key, saved);
                            return saved;
                          })
                        );
                      }

                      return this.svc.createPlace(input).pipe(
                        map(saved => {
                          placeByFloorAndName.set(key, saved);
                          return saved;
                        })
                      );
                    }),
                    toArray()
                  );
                })
              );
            })
          ).subscribe({
            next: importedTables => {
              resolve({ floorsImported: floorRows.length, tablesImported: importedTables.length });
            },
            error: err => reject(err)
          });
        },
        error: err => reject(err)
      });
    });
  }

  private toText(value: unknown): string {
    return String(value ?? '').trim();
  }

  private toNullableText(value: unknown): string | null {
    const text = this.toText(value);
    return text === '' ? null : text;
  }

  private toNullableWholeNumber(value: unknown): number | null {
    const text = this.toText(value);
    if (text === '') return null;
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return null;
    return Math.round(parsed);
  }

  private toWholeNumberOrDefault(value: unknown, fallback: number): number {
    const parsed = this.toNullableWholeNumber(value);
    return parsed ?? fallback;
  }

  toggleFloors() {
    this.floorsCollapsed.set(!this.floorsCollapsed());
  }

  togglePlaces() {
    this.placesCollapsed.set(!this.placesCollapsed());
  }

  togglePlan() {
    this.planCollapsed.set(!this.planCollapsed());
  }

  // The plan keeps the POS canvas origin at 0,0 so a table sits where the POS puts it; the
  // viewBox only grows to fit the outermost table - including one being dragged past the edge.
  plan = computed<{ tables: PlanTable[]; viewBox: string; width: number; height: number }>(() => {
    const preview = this.planPreview();
    const tables = this.places().map(place => {
      const live = preview && preview.id === place.id_ ? preview : null;
      return {
        place,
        x: live ? live.x : place.x,
        y: live ? live.y : place.y,
        width: live ? live.width : place.width ?? PLACE_DEFAULT_WIDTH,
        height: live ? live.height : place.height ?? PLACE_DEFAULT_HEIGHT,
        fontSize: place.fontSize ?? PLACE_DEFAULT_FONT_SIZE,
        fontColor: place.fontColor || PLACE_DEFAULT_FONT_COLOR
      };
    });

    const right = tables.reduce((max, t) => Math.max(max, t.x + t.width), 0);
    const bottom = tables.reduce((max, t) => Math.max(max, t.y + t.height), 0);
    const width = right + PLAN_PADDING;
    const height = bottom + PLAN_PADDING;
    return {
      tables,
      viewBox: `0 0 ${width} ${height}`,
      width,
      height
    };
  });

  selectedFloorCount = computed(() => this.selectedFloorIds().size);
  selectedPlaceCount = computed(() => this.selectedPlaceIds().size);
  allFloorsSelected = computed(() => this.floors().length > 0 && this.selectedFloorIds().size === this.floors().length);
  allPlacesSelected = computed(() => this.places().length > 0 && this.selectedPlaceIds().size === this.places().length);

  startMove(table: PlanTable, event: PointerEvent) {
    this.startDrag('move', table, event);
  }

  startResize(table: PlanTable, event: PointerEvent) {
    // The handle sits inside the table group, which would otherwise start a move as well.
    event.stopPropagation();
    this.startDrag('resize', table, event);
  }

  /** Right-clicking a table on the plan opens the menu that can delete it. */
  openPlanMenu(table: PlanTable, event: MouseEvent) {
    // No browser context menu over the plan, and no half-started drag left behind by the
    // press that opened it.
    event.preventDefault();
    event.stopPropagation();
    this.drag = null;
    this.planPreview.set(null);

    const rect = this.planWrap()?.nativeElement.getBoundingClientRect();
    if (!rect) return;
    // Anchored at the pointer, then pulled back so a table at the right or bottom edge does
    // not open a menu that hangs outside the plan.
    this.planMenu.set({
      place: table.place,
      x: Math.max(0, Math.min(event.clientX - rect.left, rect.width - PLAN_MENU_WIDTH)),
      y: Math.max(0, Math.min(event.clientY - rect.top, rect.height - PLAN_MENU_HEIGHT))
    });
  }

  closePlanMenu() {
    this.planMenu.set(null);
  }

  // A left click anywhere - including on another table - dismisses the menu. Right-clicking a
  // second table re-opens it there instead, since no click event follows that button.
  @HostListener('document:click')
  onDocumentClick() {
    this.closePlanMenu();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.closePlanMenu();
  }

  /** The menu's delete entry: the same confirm and error handling as the list's bin button. */
  deleteFromPlanMenu(place: Place, event: Event) {
    this.closePlanMenu();
    this.removePlace(place, event);
  }

  private startDrag(mode: PlanDrag['mode'], table: PlanTable, event: PointerEvent) {
    // Only the primary button drags; the right button opens the menu.
    if (event.button !== 0) return;
    event.preventDefault();
    this.closePlanMenu();
    const point = this.toPlanPoint(event);
    if (!point) return;

    this.drag = {
      mode,
      place: table.place,
      originX: point.x,
      originY: point.y,
      startX: table.x,
      startY: table.y,
      startWidth: table.width,
      startHeight: table.height,
      moved: false
    };
    this.planPreview.set({
      id: table.place.id_,
      x: table.x,
      y: table.y,
      width: table.width,
      height: table.height
    });
    // Capturing keeps the rest of the drag coming to this element even when the pointer
    // leaves it; the events still bubble to the group's move/up handlers.
    (event.target as Element).setPointerCapture(event.pointerId);
  }

  onDragMove(event: PointerEvent) {
    const drag = this.drag;
    if (!drag) return;
    const point = this.toPlanPoint(event);
    if (!point) return;

    const dx = point.x - drag.originX;
    const dy = point.y - drag.originY;
    if (!drag.moved && Math.abs(dx) < PLAN_DRAG_THRESHOLD && Math.abs(dy) < PLAN_DRAG_THRESHOLD) {
      return;
    }
    drag.moved = true;

    // X, Y, WIDTH and HEIGHT are integer columns, so the preview is exactly what gets stored.
    // The POS canvas starts at 0,0, so a table cannot be dragged off the top or left edge.
    this.planPreview.set(drag.mode === 'move'
      ? {
          id: drag.place.id_,
          x: Math.max(0, Math.round(drag.startX + dx)),
          y: Math.max(0, Math.round(drag.startY + dy)),
          width: drag.startWidth,
          height: drag.startHeight
        }
      : {
          id: drag.place.id_,
          x: drag.startX,
          y: drag.startY,
          width: Math.max(PLAN_MIN_SIZE, Math.round(drag.startWidth + dx)),
          height: Math.max(PLAN_MIN_SIZE, Math.round(drag.startHeight + dy))
        });
  }

  endDrag(event: PointerEvent) {
    const drag = this.drag;
    const preview = this.planPreview();
    this.releasePointer(event);
    this.drag = null;
    this.planPreview.set(null);
    if (!drag || !preview) return;

    // A press that never travelled is a click on the table: open it in the editor.
    if (!drag.moved) {
      if (drag.mode === 'move') this.startEditPlace(drag.place);
      return;
    }

    this.savePlaceGeometry(drag.place, drag.mode === 'move'
      ? { x: preview.x, y: preview.y }
      : { width: preview.width, height: preview.height });
  }

  cancelDrag(event: PointerEvent) {
    this.releasePointer(event);
    this.drag = null;
    this.planPreview.set(null);
  }

  private releasePointer(event: PointerEvent) {
    const target = event.target as Element;
    if (target.hasPointerCapture?.(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
  }

  // Silent on success: the table already sits where it was dropped, so a flash would only
  // repeat what the plan shows. Failures still speak up.
  private savePlaceGeometry(place: Place, changes: Partial<PlaceInput>) {
    const input: PlaceInput = {
      name: place.name,
      floorId: place.floorId,
      x: place.x,
      y: place.y,
      width: place.width,
      height: place.height,
      fontSize: place.fontSize,
      fontColor: place.fontColor,
      ...changes
    };

    this.svc.updatePlace(place.id_, input).subscribe({
      next: saved => {
        // Keep an open editor for this table in step with what was just dropped.
        if (this.editingPlaceId() === place.id_) {
          this.placeForm.set({ ...this.placeForm(), ...changes });
        }
        this.applySavedPlace(saved);
      },
      // Nothing local was changed, so a failed drop needs no undo: clearing the preview
      // already left the plan drawing the stored geometry.
      error: (err: HttpErrorResponse) => this.flash(this.serverReason(err, this.t('floors.tableSaveFailed')))
    });
  }

  /**
   * Folds one saved table into the loaded list, keeping the backend's name order. Refetching
   * the floor would blank the list and redraw the whole plan for a single changed table.
   */
  private applySavedPlace(saved: Place) {
    this.places.update(places => {
      const others = places.filter(place => place.id_ !== saved.id_);
      // A table moved to another floor drops out of the list being shown.
      if (saved.floorId !== this.selectedFloorId()) return others;
      return [...others, saved].sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  // Screen pixels to floor-plan units: the SVG scales to the panel, so a raw pixel delta
  // would move and resize by the wrong amount.
  private toPlanPoint(event: PointerEvent): { x: number; y: number } | null {
    const svg = this.planSvg()?.nativeElement;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }

  floorName(id: string | null): string {
    if (!id) return '—';
    return this.floors().find(floor => floor.id_ === id)?.name ?? id;
  }

  placeName(id: string | null): string {
    if (!id) return '';
    return this.places().find(place => place.id_ === id)?.name ?? '';
  }

  selectFloor(floor: Floor) {
    this.selectedFloorId.set(floor.id_);
    this.loadPlaces(floor.id_);
    this.startEditFloor(floor);
  }

  isFloorSelected(id: string): boolean {
    return this.selectedFloorIds().has(id);
  }

  toggleFloorSelection(id: string, event: Event) {
    event.stopPropagation();
    this.selectedFloorIds.update(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  toggleAllFloors(event: Event) {
    event.stopPropagation();
    this.selectedFloorIds.set(
      this.allFloorsSelected()
        ? new Set<string>()
        : new Set(this.floors().map(floor => floor.id_))
    );
  }

  isPlaceSelected(id: string): boolean {
    return this.selectedPlaceIds().has(id);
  }

  togglePlaceSelection(id: string, event: Event) {
    event.stopPropagation();
    this.selectedPlaceIds.update(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  toggleAllPlaces(event: Event) {
    event.stopPropagation();
    this.selectedPlaceIds.set(
      this.allPlacesSelected()
        ? new Set<string>()
        : new Set(this.places().map(place => place.id_))
    );
  }

  private loadPlaces(floorId: string) {
    this.loadingPlaces.set(true);
    this.places.set([]);
    this.selectedPlaceIds.set(new Set<string>());
    this.svc.places(floorId).subscribe({
      next: places => { this.places.set(places); this.loadingPlaces.set(false); },
      error: () => { this.loadingPlaces.set(false); this.flash(this.t('floors.tablesLoadFailed')); }
    });
  }

  closePanel() {
    this.panel.set(null);
    this.editingFloorId.set(null);
    this.editingPlaceId.set(null);
  }

  // --- floor -------------------------------------------------------------------------------

  updateFloorForm<K extends keyof FloorInput>(key: K, value: FloorInput[K]) {
    this.floorForm.set({ ...this.floorForm(), [key]: value });
  }

  // A blank sort-order field means "unset", stored as NULL - 0 would move the floor to the
  // front of the list.
  onSortOrderChange(value: NumberInput) {
    this.updateFloorForm('sortOrder', toNullableInt(value));
  }

  startCreateFloor() {
    this.panel.set('floor');
    this.editingFloorId.set(null);
    this.floorForm.set({ ...EMPTY_FLOOR_FORM });
  }

  startEditFloor(floor: Floor) {
    this.panel.set('floor');
    this.editingFloorId.set(floor.id_);
    this.floorForm.set({ name: floor.name, sortOrder: floor.sortOrder });
  }

  saveFloor() {
    const value = this.floorForm();
    if (!value.name.trim()) { this.flash(this.t('floors.nameRequired')); return; }

    const id = this.editingFloorId();
    this.saving.set(true);
    const request = id === null ? this.svc.create(value) : this.svc.update(id, value);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.flash(this.t(id === null ? 'floors.created' : 'floors.updated'));
        this.closePanel();
        this.load();
      },
      error: () => { this.saving.set(false); this.flash(this.t('floors.saveFailed')); }
    });
  }

  removeFloor(floor: Floor, event: Event) {
    event.stopPropagation();
    const loadedPlaces = this.selectedFloorId() === floor.id_ ? this.places() : null;
    if (loadedPlaces !== null) {
      this.confirmAndDeleteFloorWithTables(floor, loadedPlaces);
      return;
    }

    this.svc.places(floor.id_).subscribe({
      next: places => this.confirmAndDeleteFloorWithTables(floor, places),
      error: () => this.flash(this.t('floors.tablesLoadFailed'))
    });
  }

  private confirmAndDeleteFloorWithTables(floor: Floor, places: Place[]) {
    const confirmed = places.length > 0
      ? confirm(this.t('floors.confirmDeleteWithTables', { name: floor.name, count: places.length }))
      : confirm(this.t('floors.confirmDelete', { name: floor.name }));
    if (!confirmed) return;

    const finishFloorDelete = () => {
      this.svc.delete(floor.id_).subscribe({
        next: () => {
          this.selectedFloorIds.update(ids => {
            const next = new Set(ids);
            next.delete(floor.id_);
            return next;
          });
          if (this.selectedFloorId() === floor.id_) {
            this.selectedFloorId.set(null);
            this.places.set([]);
            this.selectedPlaceIds.set(new Set<string>());
            this.closePanel();
          }
          this.flash(this.t('floors.deleted', { name: floor.name }));
          this.load();
        },
        error: (err: HttpErrorResponse) => this.flash(this.serverReason(
          err, this.t('floors.deleteFailed', { name: floor.name })
        ))
      });
    };

    if (places.length === 0) {
      finishFloorDelete();
      return;
    }

    forkJoin(places.map(place => this.svc.deletePlace(place.id_))).subscribe({
      next: () => finishFloorDelete(),
      error: (err: HttpErrorResponse) => this.flash(this.serverReason(
        err, this.t('floors.deleteTablesFailed', { name: floor.name })
      ))
    });
  }

  removeSelectedFloors() {
    const floorIds = Array.from(this.selectedFloorIds());
    if (floorIds.length < 2) return;
    const selectedFloors = this.floors().filter(floor => floorIds.includes(floor.id_));
    if (selectedFloors.length < 2) return;

    forkJoin(selectedFloors.map(floor => this.svc.places(floor.id_).pipe(map(places => ({ floor, places }))))).subscribe({
      next: floorEntries => {
        const tableCount = floorEntries.reduce((count, entry) => count + entry.places.length, 0);
        const confirmed = tableCount > 0
          ? confirm(this.t('floors.confirmDeleteSelectedWithTables', { count: floorEntries.length, tables: tableCount }))
          : confirm(this.t('floors.confirmDeleteSelected', { count: floorEntries.length }));
        if (!confirmed) return;

        from(floorEntries).pipe(
          concatMap(entry => this.deleteFloorWithTables$(entry.floor, entry.places)),
          toArray()
        ).subscribe({
          next: () => {
            const removedFloorIds = new Set(floorEntries.map(entry => entry.floor.id_));
            this.selectedFloorIds.set(new Set<string>());
            if (this.selectedFloorId() !== null && removedFloorIds.has(this.selectedFloorId()!)) {
              this.selectedFloorId.set(null);
              this.places.set([]);
              this.selectedPlaceIds.set(new Set<string>());
              this.closePanel();
            }
            this.flash(this.t('floors.deletedSelected', { count: floorEntries.length }));
            this.load();
          },
          error: () => this.flash(this.t('floors.deleteSelectedFailed'))
        });
      },
      error: () => this.flash(this.t('floors.tablesLoadFailed'))
    });
  }

  private deleteFloorWithTables$(floor: Floor, places: Place[]): Observable<void> {
    const deleteTables$ = places.length > 0
      ? forkJoin(places.map(place => this.svc.deletePlace(place.id_))).pipe(map(() => void 0))
      : of(void 0);

    return deleteTables$.pipe(
      concatMap(() => this.svc.delete(floor.id_)),
      map(() => void 0)
    );
  }

  // --- tables ------------------------------------------------------------------------------

  updatePlaceForm<K extends keyof PlaceInput>(key: K, value: PlaceInput[K]) {
    this.placeForm.set({ ...this.placeForm(), [key]: value });
  }

  // Blank width/height/font size mean "POS default", so they must stay null rather than 0.
  onPlaceNumberChange(key: 'width' | 'height' | 'fontSize', value: NumberInput) {
    this.updatePlaceForm(key, toNullableInt(value));
  }

  // X and Y are NOT NULL, so a cleared field falls back to 0 instead of unsetting.
  onPlaceCoordinateChange(key: 'x' | 'y', value: NumberInput) {
    this.updatePlaceForm(key, toNullableInt(value) ?? 0);
  }

  startCreatePlace() {
    const floorId = this.selectedFloorId();
    if (!floorId) return;
    this.panel.set('place');
    this.editingPlaceId.set(null);
    this.placeForm.set({ ...EMPTY_PLACE_FORM, floorId });
  }

  startEditPlace(place: Place, event?: Event) {
    event?.stopPropagation();
    this.panel.set('place');
    this.editingPlaceId.set(place.id_);
    this.placeForm.set({
      name: place.name,
      floorId: place.floorId,
      x: place.x,
      y: place.y,
      width: place.width,
      height: place.height,
      fontSize: place.fontSize,
      fontColor: place.fontColor
    });
  }

  savePlace() {
    const value = this.placeForm();
    if (!value.name.trim()) { this.flash(this.t('floors.tableNameRequired')); return; }

    const id = this.editingPlaceId();
    this.saving.set(true);
    const request = id === null ? this.svc.createPlace(value) : this.svc.updatePlace(id, value);

    request.subscribe({
      next: saved => {
        this.saving.set(false);
        this.applySavedPlace(saved);
        // Stay on the table that was just saved - a new one switches the panel from create to
        // edit mode - so further edits do not need it picked again.
        this.startEditPlace(saved);
      },
      // 409 is the unique table name; the body names the clash.
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.flash(this.serverReason(err, this.t('floors.tableSaveFailed')));
      }
    });
  }

  removePlace(place: Place, event: Event) {
    event.stopPropagation();
    if (!confirm(this.t('floors.confirmDeleteTable', { name: place.name }))) return;
    this.svc.deletePlace(place.id_).subscribe({
      next: () => {
        this.selectedPlaceIds.update(ids => {
          const next = new Set(ids);
          next.delete(place.id_);
          return next;
        });
        if (this.editingPlaceId() === place.id_) this.closePanel();
        this.places.update(places => places.filter(other => other.id_ !== place.id_));
      },
      // 409 means an open ticket is parked on the table.
      error: (err: HttpErrorResponse) => this.flash(this.serverReason(
        err, this.t('floors.tableDeleteFailed', { name: place.name })
      ))
    });
  }

  removeSelectedPlaces() {
    const placeIds = Array.from(this.selectedPlaceIds());
    if (placeIds.length < 2) return;
    const selectedPlaces = this.places().filter(place => placeIds.includes(place.id_));
    if (selectedPlaces.length < 2) return;
    if (!confirm(this.t('floors.confirmDeleteSelectedTables', { count: selectedPlaces.length }))) return;

    from(selectedPlaces).pipe(
      concatMap(place => this.svc.deletePlace(place.id_)),
      toArray()
    ).subscribe({
      next: () => {
        const removedIds = new Set(selectedPlaces.map(place => place.id_));
        this.places.update(places => places.filter(place => !removedIds.has(place.id_)));
        if (this.editingPlaceId() !== null && removedIds.has(this.editingPlaceId()!)) this.closePanel();
        this.selectedPlaceIds.set(new Set<string>());
        this.flash(this.t('floors.deletedSelectedTables', { count: selectedPlaces.length }));
      },
      error: () => this.flash(this.t('floors.deleteSelectedTablesFailed'))
    });
  }

  // The 4xx bodies are plain-text explanations from the API; they say more than a generic
  // failure message would.
  private serverReason(err: HttpErrorResponse, fallback: string): string {
    const useBody = (err.status === 409 || err.status === 400) && typeof err.error === 'string' && err.error !== '';
    return useBody ? err.error : fallback;
  }

  private flash(msg: string) {
    this.actionMsg.set(msg);
    setTimeout(() => this.actionMsg.set(''), 4000);
  }
}
