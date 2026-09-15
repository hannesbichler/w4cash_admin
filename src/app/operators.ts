import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin, of, catchError, from, concatMap, toArray, firstValueFrom } from 'rxjs';
import * as XLSX from 'xlsx';
import { PersonService } from './person.service';
import { Person, PersonInput, Role, RoleInput } from './person.model';
import { I18nService } from './i18n.service';

const EMPTY_ROLE_FORM: RoleInput = { name: '' };

// A new Bediener starts with no role picked; the editor requires one before it will save,
// since a person the POS cannot place in a role can sign in but do nothing.
const EMPTY_PERSON_FORM: PersonInput = { name: '', role: '', card: null };

/** Which entity the detail panel is editing. */
type Panel = 'role' | 'person' | null;

/** One row of the import sheet, before its role is resolved against the live roles. */
interface PersonImportRow {
  sourceId: string;
  name: string;
  roleName: string;
  sourceRoleId: string;
  /** Undefined when the sheet has no Card column, so an existing card is left alone. */
  card: string | null | undefined;
}

@Component({
  selector: 'app-operators',
  imports: [CommonModule, FormsModule],
  templateUrl: './operators.html',
  styleUrl: './operators.css'
})
export class Operators implements OnInit {
  private svc = inject(PersonService);
  protected t = inject(I18nService).t;

  actionMsg = signal('');

  roles = signal<Role[]>([]);
  persons = signal<Person[]>([]);
  selectedPersonIds = signal<Set<string>>(new Set<string>());
  loading = signal(false);
  // The roles list can be folded away once it is set up, since the Bediener list is the one
  // that gets edited day to day.
  rolesCollapsed = signal(false);
  personsCollapsed = signal(false);

  // Clicking a role also narrows the Bediener list to that role; clicking it again clears it.
  roleFilter = signal<string | null>(null);

  panel = signal<Panel>(null);
  saving = signal(false);

  editingRoleId = signal<string | null>(null);
  roleForm = signal<RoleInput>({ ...EMPTY_ROLE_FORM });

  editingPersonId = signal<string | null>(null);
  personForm = signal<PersonInput>({ ...EMPTY_PERSON_FORM });

  ngOnInit() {
    this.load();
  }

  /**
   * Both lists arrive together, because the Bediener table prints role names and a half-loaded
   * screen would show raw ids until the second response landed. Each request absorbs its own
   * failure so one dead endpoint still leaves the other list usable - a Bediener whose role
   * cannot be resolved falls back to showing the stored id.
   */
  load() {
    this.loading.set(true);
    forkJoin({
      roles: this.svc.roles().pipe(catchError(() => of(null))),
      persons: this.svc.persons().pipe(catchError(() => of(null)))
    }).subscribe(({ roles, persons }) => {
      this.roles.set(roles ?? []);
      this.persons.set(persons ?? []);
      this.loading.set(false);

      if (roles === null && persons === null) this.flash(this.t('operators.loadFailed'));
      else if (roles === null) this.flash(this.t('operators.rolesLoadFailed'));
      else if (persons === null) this.flash(this.t('operators.personsLoadFailed'));
    });
  }

  toggleRoles() {
    this.rolesCollapsed.set(!this.rolesCollapsed());
  }

  togglePersons() {
    this.personsCollapsed.set(!this.personsCollapsed());
  }

  roleName(id: string | null): string {
    if (!id) return '—';
    return this.roles().find(role => role.id_ === id)?.name ?? id;
  }

  /** How many Bediener hold a role - what makes deleting it safe or not. */
  personCount(roleId: string): number {
    return this.persons().filter(person => person.role === roleId).length;
  }

  visiblePersons = computed(() => {
    const roleId = this.roleFilter();
    const persons = roleId === null ? this.persons() : this.persons().filter(p => p.role === roleId);
    return [...persons].sort((a, b) => a.name.localeCompare(b.name));
  });

  selectedVisiblePersonCount = computed(() => {
    const selected = this.selectedPersonIds();
    return this.visiblePersons().reduce((count, person) => count + (selected.has(person.id_) ? 1 : 0), 0);
  });

  allVisiblePersonsSelected = computed(() => {
    const visible = this.visiblePersons();
    if (visible.length === 0) return false;
    const selected = this.selectedPersonIds();
    return visible.every(person => selected.has(person.id_));
  });

  // --- roles -------------------------------------------------------------------------------

  selectRole(role: Role) {
    // A second click on the same role clears the filter rather than reselecting it.
    this.roleFilter.set(this.roleFilter() === role.id_ ? null : role.id_);
    this.selectedPersonIds.set(new Set<string>());
    this.startEditRole(role);
  }

  isPersonSelected(id: string): boolean {
    return this.selectedPersonIds().has(id);
  }

  togglePersonSelection(id: string, event: Event) {
    event.stopPropagation();
    this.selectedPersonIds.update(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  toggleAllVisiblePersons(event: Event) {
    event.stopPropagation();
    this.selectedPersonIds.update(current => {
      const next = new Set(current);
      const visibleIds = this.visiblePersons().map(person => person.id_);
      if (this.allVisiblePersonsSelected()) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  updateRoleForm(name: string) {
    this.roleForm.set({ name });
  }

  startCreateRole() {
    this.panel.set('role');
    this.editingRoleId.set(null);
    this.roleForm.set({ ...EMPTY_ROLE_FORM });
  }

  startEditRole(role: Role) {
    this.panel.set('role');
    this.editingRoleId.set(role.id_);
    this.roleForm.set({ name: role.name });
  }

  saveRole() {
    const value = this.roleForm();
    if (!value.name.trim()) { this.flash(this.t('operators.roleNameRequired')); return; }

    const id = this.editingRoleId();
    this.saving.set(true);
    const request = id === null ? this.svc.createRole(value) : this.svc.updateRole(id, value);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.flash(this.t(id === null ? 'operators.roleCreated' : 'operators.roleUpdated'));
        this.closePanel();
        this.load();
      },
      error: () => { this.saving.set(false); this.flash(this.t('operators.roleSaveFailed')); }
    });
  }

  removeRole(role: Role, event: Event) {
    event.stopPropagation();
    // Say up front how many Bediener are on the role, so the answer is an informed one.
    const held = this.personCount(role.id_);
    const question = held > 0
      ? this.t('operators.confirmDeleteRoleInUse', { name: role.name, count: held })
      : this.t('operators.confirmDeleteRole', { name: role.name });
    if (!confirm(question)) return;

    this.svc.deleteRole(role.id_).subscribe({
      next: () => {
        if (this.roleFilter() === role.id_) this.roleFilter.set(null);
        if (this.editingRoleId() === role.id_) this.closePanel();
        this.flash(this.t('operators.roleDeleted', { name: role.name }));
        this.load();
      },
      // 409 means Bediener still hold the role; the body says how many.
      error: (err: HttpErrorResponse) => this.flash(this.serverReason(
        err, this.t('operators.roleDeleteFailed', { name: role.name })
      ))
    });
  }

  // --- Bediener ----------------------------------------------------------------------------

  updatePersonForm<K extends keyof PersonInput>(key: K, value: PersonInput[K]) {
    this.personForm.set({ ...this.personForm(), [key]: value });
  }

  // A blank card field means "no card", stored as NULL rather than an empty string, so the
  // POS does not try to match a badge against it.
  onCardChange(value: string) {
    this.updatePersonForm('card', value.trim() === '' ? null : value);
  }

  /** Whether the POS has a sign-in PIN on file; the admin can see this but not set it. */
  hasPin(person: Person): boolean {
    return !!person.apppassword;
  }

  startCreatePerson() {
    this.panel.set('person');
    this.editingPersonId.set(null);
    // Start on the role being filtered by, if any - that is the list being worked on.
    this.personForm.set({ ...EMPTY_PERSON_FORM, role: this.roleFilter() ?? '' });
  }

  startEditPerson(person: Person, event?: Event) {
    event?.stopPropagation();
    this.panel.set('person');
    this.editingPersonId.set(person.id_);
    this.personForm.set({ name: person.name, role: person.role, card: person.card });
  }

  savePerson() {
    const value = this.personForm();
    if (!value.name.trim()) { this.flash(this.t('operators.nameRequired')); return; }
    if (!value.role) { this.flash(this.t('operators.roleRequired')); return; }

    const id = this.editingPersonId();
    this.saving.set(true);
    const request = id === null ? this.svc.createPerson(value) : this.svc.updatePerson(id, value);

    request.subscribe({
      next: saved => {
        this.saving.set(false);
        this.applySavedPerson(saved);
        this.flash(this.t(id === null ? 'operators.created' : 'operators.updated'));
        // Stay on the Bediener just saved - a new one switches the panel from create to edit.
        this.startEditPerson(saved);
      },
      // 409 is the unique name; the body names the clash.
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.flash(this.serverReason(err, this.t('operators.saveFailed')));
      }
    });
  }

  /** Folds one saved Bediener into the loaded list rather than refetching both lists. */
  private applySavedPerson(saved: Person) {
    this.persons.update(persons => {
      const others = persons.filter(person => person.id_ !== saved.id_);
      return [...others, saved];
    });
  }

  removePerson(person: Person, event: Event) {
    event.stopPropagation();
    if (!confirm(this.t('operators.confirmDelete', { name: person.name }))) return;
    this.svc.deletePerson(person.id_).subscribe({
      next: () => {
        if (this.editingPersonId() === person.id_) this.closePanel();
        this.selectedPersonIds.update(ids => {
          const next = new Set(ids);
          next.delete(person.id_);
          return next;
        });
        this.persons.update(persons => persons.filter(other => other.id_ !== person.id_));
        this.flash(this.t('operators.deleted', { name: person.name }));
      },
      // 409 means tickets or print jobs still name this Bediener.
      error: (err: HttpErrorResponse) => this.flash(this.serverReason(
        err, this.t('operators.deleteFailed', { name: person.name })
      ))
    });
  }

  removeSelectedPersons() {
    const selected = this.visiblePersons().filter(person => this.selectedPersonIds().has(person.id_));
    if (selected.length < 2) return;
    if (!confirm(this.t('operators.confirmDeleteSelected', { count: selected.length }))) return;

    from(selected).pipe(
      concatMap(person => this.svc.deletePerson(person.id_)),
      toArray()
    ).subscribe({
      next: () => {
        const removedIds = new Set(selected.map(person => person.id_));
        if (this.editingPersonId() !== null && removedIds.has(this.editingPersonId()!)) this.closePanel();
        this.persons.update(persons => persons.filter(person => !removedIds.has(person.id_)));
        this.selectedPersonIds.update(ids => {
          const next = new Set(ids);
          for (const id of removedIds) next.delete(id);
          return next;
        });
        this.flash(this.t('operators.deletedSelected', { count: selected.length }));
      },
      error: () => this.flash(this.t('operators.deleteSelectedFailed'))
    });
  }

  // --- XLSX export / import ----------------------------------------------------------------

  // Roles go out by name, since that is what reads back across databases; the ids ride along
  // so a round-trip into the same database matches rows exactly even after a rename.
  exportPersons() {
    const persons = [...this.persons()].sort((a, b) => a.name.localeCompare(b.name));
    if (persons.length === 0) {
      this.flash(this.t('operators.exportEmpty'));
      return;
    }

    const rows = persons.map(person => ({
      Name: person.name,
      Role: this.roles().find(role => role.id_ === person.role)?.name ?? '',
      Card: person.card ?? '',
      Id: person.id_,
      'Role id': person.role
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Operators');
    XLSX.writeFile(workbook, `operators-${new Date().toISOString().slice(0, 10)}.xlsx`);
    this.flash(this.t('operators.exported', { count: persons.length }));
  }

  importPersons(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    if (!file) return;

    this.loading.set(true);
    file.arrayBuffer()
      .then(buffer => {
        const rows = this.readPersonRows(XLSX.read(buffer, { type: 'array' }));
        if (rows.length === 0) throw new Error(this.t('operators.importNone'));
        return this.importParsedPersons(rows);
      })
      .then(summary => {
        let message = this.t('operators.imported', { created: summary.created, updated: summary.updated });
        if (summary.rolesCreated > 0) message += ' ' + this.t('operators.importRolesCreated', { count: summary.rolesCreated });
        if (summary.failed > 0) message += ' ' + this.t('operators.importSkipped', { count: summary.failed });
        this.flash(message);
        this.load();
      })
      .catch(error => {
        this.loading.set(false);
        this.flash(error instanceof Error ? error.message : this.t('operators.importFailed'));
      })
      .finally(() => {
        if (input) input.value = '';
      });
  }

  // Reads the sheet the export writes, but any first sheet will do and a row only needs a
  // Name; ids are optional, so a hand-written file can address roles by name alone.
  private readPersonRows(workbook: XLSX.WorkBook): PersonImportRow[] {
    const sheet = workbook.Sheets['Operators'] ?? workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      .map(row => {
        const card = 'Card' in row ? this.toText(row['Card']) : undefined;
        return {
          sourceId: this.toText(row['Id']),
          name: this.toText(row['Name']),
          roleName: this.toText(row['Role']),
          sourceRoleId: this.toText(row['Role id']),
          card: card === undefined ? undefined : (card === '' ? null : card)
        };
      })
      .filter(row => row.name !== '');
  }

  private async importParsedPersons(
    rows: PersonImportRow[]
  ): Promise<{ created: number; updated: number; failed: number; rolesCreated: number }> {
    // Fresh lists rather than the signals, so the import matches what is actually stored.
    const [roles, persons] = await Promise.all([
      firstValueFrom(this.svc.roles()),
      firstValueFrom(this.svc.persons())
    ]);
    const roleIds = new Set(roles.map(role => role.id_));
    const roleByName = new Map(roles.map(role => [role.name.toLowerCase(), role.id_]));
    const byId = new Map(persons.map(person => [person.id_, person]));
    // PEOPLE.NAME is unique, so a name is a safe fallback match when the id is foreign.
    const byName = new Map(persons.map(person => [person.name.toLowerCase(), person]));

    let created = 0;
    let updated = 0;
    let failed = 0;
    let rolesCreated = 0;

    for (const row of rows) {
      try {
        // The role name wins over the id, which only means something in the database the file
        // came from; an id is used only when it also exists here.
        let roleId = row.roleName ? roleByName.get(row.roleName.toLowerCase()) : undefined;
        if (!roleId && row.sourceRoleId && roleIds.has(row.sourceRoleId)) roleId = row.sourceRoleId;
        if (!roleId && row.roleName) {
          // A role this database does not know yet is created, so a file from another till
          // imports in one go instead of failing row by row.
          const role = await firstValueFrom(this.svc.createRole({ name: row.roleName }));
          roleId = role.id_;
          roleIds.add(roleId);
          roleByName.set(row.roleName.toLowerCase(), roleId);
          rolesCreated++;
        }

        const target = (row.sourceId ? byId.get(row.sourceId) : undefined)
          ?? byName.get(row.name.toLowerCase());
        roleId ??= target?.role;
        // The POS needs a role to place the Bediener in; a row that cannot name one is skipped.
        if (!roleId) { failed++; continue; }

        const value: PersonInput = {
          name: row.name,
          role: roleId,
          card: row.card === undefined ? (target?.card ?? null) : row.card
        };
        const saved = target
          ? await firstValueFrom(this.svc.updatePerson(target.id_, value))
          : await firstValueFrom(this.svc.createPerson(value));
        if (saved?.id_) {
          if (target) byName.delete(target.name.toLowerCase());
          byId.set(saved.id_, saved);
          byName.set(saved.name.toLowerCase(), saved);
        }
        if (target) updated++; else created++;
      } catch {
        failed++;
      }
    }

    return { created, updated, failed, rolesCreated };
  }

  private toText(value: unknown): string {
    return String(value ?? '').trim();
  }

  closePanel() {
    this.panel.set(null);
    this.editingRoleId.set(null);
    this.editingPersonId.set(null);
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
