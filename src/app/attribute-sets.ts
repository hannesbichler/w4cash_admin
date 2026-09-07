import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AttributeService } from './attribute.service';
import { AttributeSet, AttributeSetDetail, Attribute, AttributeValue } from './attribute.model';
import { I18nService } from './i18n.service';

@Component({
  selector: 'app-attribute-sets',
  imports: [CommonModule, FormsModule],
  templateUrl: './attribute-sets.html',
  styleUrl: './attribute-sets.css'
})
export class AttributeSets implements OnInit {
  private svc = inject(AttributeService);
  protected t = inject(I18nService).t;

  actionMsg = signal('');

  sets = signal<AttributeSet[]>([]);
  attributes = signal<Attribute[]>([]);
  selectedSetId = signal<string | null>(null);
  selectedSet = signal<AttributeSetDetail | null>(null);

  loadingSets = signal(false);
  loadingDetail = signal(false);

  newSetName = signal('');
  renameValue = signal('');
  attributeToAdd = signal('');
  newAttributeName = signal('');

  selectedAttributeId = signal<string | null>(null);
  attributeValues = signal<AttributeValue[]>([]);
  loadingValues = signal(false);
  newValueText = signal('');

  availableToAdd(): Attribute[] {
    const set = this.selectedSet();
    if (!set) return this.attributes();
    const usedIds = new Set(set.attributes.map(a => a.attributeId));
    return this.attributes().filter(a => !usedIds.has(a.id));
  }

  ngOnInit() {
    this.loadSets();
    this.loadAttributes();
  }

  loadSets() {
    this.loadingSets.set(true);
    this.svc.listSets().subscribe({
      next: sets => { this.sets.set(sets); this.loadingSets.set(false); },
      error: () => { this.loadingSets.set(false); this.flash(this.t('attributeSets.loadFailed')); }
    });
  }

  loadAttributes() {
    this.svc.listAttributes().subscribe({ next: attrs => this.attributes.set(attrs), error: () => {} });
  }

  selectSet(id: string) {
    this.selectedSetId.set(id);
    this.loadingDetail.set(true);
    this.svc.getSet(id).subscribe({
      next: detail => {
        this.selectedSet.set(detail);
        this.renameValue.set(detail.name);
        this.attributeToAdd.set('');
        this.loadingDetail.set(false);
      },
      error: () => { this.loadingDetail.set(false); this.flash(this.t('attributeSets.loadOneFailed')); }
    });
  }

  closeDetail() {
    this.selectedSetId.set(null);
    this.selectedSet.set(null);
  }

  createSet() {
    const name = this.newSetName().trim();
    if (!name) return;
    this.svc.createSet(name).subscribe({
      next: () => {
        this.newSetName.set('');
        this.flash(this.t('attributeSets.created', { name }));
        this.loadSets();
      },
      error: () => this.flash(this.t('attributeSets.createFailed'))
    });
  }

  saveRename() {
    const id = this.selectedSetId();
    const name = this.renameValue().trim();
    if (!id || !name) return;
    this.svc.renameSet(id, name).subscribe({
      next: detail => {
        this.selectedSet.set(detail);
        this.flash(this.t('attributeSets.renamed'));
        this.loadSets();
      },
      error: () => this.flash(this.t('attributeSets.renameFailed'))
    });
  }

  deleteSet(set: AttributeSet, event: Event) {
    event.stopPropagation();
    if (!confirm(this.t('attributeSets.confirmDelete', { name: set.name }))) return;
    this.svc.deleteSet(set.id).subscribe({
      next: () => {
        this.sets.update(sets => sets.filter(s => s.id !== set.id));
        if (this.selectedSetId() === set.id) this.closeDetail();
        this.flash(this.t('attributeSets.deleted', { name: set.name }));
      },
      error: () => this.flash(this.t('attributeSets.deleteFailed', { name: set.name }))
    });
  }

  addAttributeToSet() {
    const setId = this.selectedSetId();
    const attributeId = this.attributeToAdd();
    if (!setId || !attributeId) return;
    this.svc.addAttributeToSet(setId, attributeId).subscribe({
      next: detail => { this.selectedSet.set(detail); this.attributeToAdd.set(''); },
      error: () => this.flash(this.t('attributeSets.addFailed'))
    });
  }

  removeAttributeFromSet(attributeId: string) {
    const setId = this.selectedSetId();
    if (!setId) return;
    this.svc.removeAttributeFromSet(setId, attributeId).subscribe({
      next: detail => this.selectedSet.set(detail),
      error: () => this.flash(this.t('attributeSets.removeFailed'))
    });
  }

  moveAttribute(index: number, direction: -1 | 1) {
    const setId = this.selectedSetId();
    const set = this.selectedSet();
    if (!setId || !set) return;
    const order = set.attributes.map(a => a.attributeId);
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= order.length) return;
    [order[index], order[swapWith]] = [order[swapWith], order[index]];
    this.svc.reorderAttributes(setId, order).subscribe({
      next: detail => this.selectedSet.set(detail),
      error: () => this.flash(this.t('attributeSets.reorderFailed'))
    });
  }

  createAttribute() {
    const name = this.newAttributeName().trim();
    if (!name) return;
    this.svc.createAttribute(name).subscribe({
      next: () => {
        this.newAttributeName.set('');
        this.flash(this.t('attributeSets.attributeCreated', { name }));
        this.loadAttributes();
      },
      error: () => this.flash(this.t('attributeSets.attributeCreateFailed'))
    });
  }

  renameAttribute(attribute: Attribute) {
    const name = prompt(this.t('attributeSets.renameAttribute'), attribute.name)?.trim();
    if (!name || name === attribute.name) return;
    this.svc.updateAttribute(attribute.id, name).subscribe({
      next: () => { this.flash(this.t('attributeSets.attributeRenamed', { name })); this.loadAttributes(); },
      error: () => this.flash(this.t('attributeSets.attributeRenameFailed'))
    });
  }

  deleteAttribute(attribute: Attribute) {
    if (!confirm(this.t('attributeSets.confirmDeleteAttribute', { name: attribute.name }))) return;
    this.svc.deleteAttribute(attribute.id).subscribe({
      next: () => {
        this.attributes.update(attrs => attrs.filter(a => a.id !== attribute.id));
        this.flash(this.t('attributeSets.attributeDeleted', { name: attribute.name }));
      },
      error: () => this.flash(this.t('attributeSets.attributeDeleteFailed', { name: attribute.name }))
    });
  }

  selectAttributeForValues(attribute: Attribute) {
    this.selectedAttributeId.set(attribute.id);
    this.refreshValues(attribute.id);
  }

  private refreshValues(attributeId: string) {
    this.loadingValues.set(true);
    this.svc.listValues(attributeId).subscribe({
      next: values => { this.attributeValues.set(values); this.loadingValues.set(false); },
      error: () => { this.loadingValues.set(false); this.flash(this.t('attributeSets.valuesLoadFailed')); }
    });
  }

  closeValues() {
    this.selectedAttributeId.set(null);
    this.attributeValues.set([]);
  }

  addAttributeValue() {
    const attributeId = this.selectedAttributeId();
    const value = this.newValueText().trim();
    if (!attributeId || !value) return;
    this.svc.createValue(attributeId, value).subscribe({
      next: () => { this.newValueText.set(''); this.refreshValues(attributeId); },
      error: () => this.flash(this.t('attributeSets.valueAddFailed'))
    });
  }

  renameAttributeValue(value: AttributeValue) {
    const attributeId = this.selectedAttributeId();
    if (!attributeId) return;
    const newText = prompt(this.t('attributeSets.renameValue'), value.value)?.trim();
    if (!newText || newText === value.value) return;
    this.svc.updateValue(attributeId, value.id, newText).subscribe({
      next: () => this.refreshValues(attributeId),
      error: () => this.flash(this.t('attributeSets.valueRenameFailed'))
    });
  }

  removeAttributeValue(value: AttributeValue) {
    const attributeId = this.selectedAttributeId();
    if (!attributeId) return;
    if (!confirm(this.t('attributeSets.confirmDeleteValue', { value: value.value }))) return;
    this.svc.deleteValue(attributeId, value.id).subscribe({
      next: () => this.attributeValues.update(values => values.filter(v => v.id !== value.id)),
      error: () => this.flash(this.t('attributeSets.valueDeleteFailed'))
    });
  }

  moveAttributeValue(index: number, direction: -1 | 1) {
    const attributeId = this.selectedAttributeId();
    if (!attributeId) return;
    const order = this.attributeValues().map(v => v.id);
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= order.length) return;
    [order[index], order[swapWith]] = [order[swapWith], order[index]];
    this.svc.reorderValues(attributeId, order).subscribe({
      next: values => this.attributeValues.set(values),
      error: () => this.flash(this.t('attributeSets.valuesReorderFailed'))
    });
  }

  private flash(msg: string) {
    this.actionMsg.set(msg);
    setTimeout(() => this.actionMsg.set(''), 3000);
  }
}
