import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AttributeSet, AttributeSetDetail, Attribute, AttributeValue } from './attribute.model';

const API = '/api';

@Injectable({ providedIn: 'root' })
export class AttributeService {
  private http = inject(HttpClient);

  listSets(): Observable<AttributeSet[]> {
    return this.http.get<AttributeSet[]>(`${API}/attribute-sets`);
  }

  getSet(id: string): Observable<AttributeSetDetail> {
    return this.http.get<AttributeSetDetail>(`${API}/attribute-sets/${encodeURIComponent(id)}`);
  }

  createSet(name: string): Observable<AttributeSetDetail> {
    return this.http.post<AttributeSetDetail>(`${API}/attribute-sets`, { name });
  }

  renameSet(id: string, name: string): Observable<AttributeSetDetail> {
    return this.http.put<AttributeSetDetail>(`${API}/attribute-sets/${encodeURIComponent(id)}`, { name });
  }

  deleteSet(id: string): Observable<void> {
    return this.http.delete<void>(`${API}/attribute-sets/${encodeURIComponent(id)}`);
  }

  addAttributeToSet(setId: string, attributeId: string): Observable<AttributeSetDetail> {
    return this.http.post<AttributeSetDetail>(
      `${API}/attribute-sets/${encodeURIComponent(setId)}/attributes/${encodeURIComponent(attributeId)}`, null
    );
  }

  removeAttributeFromSet(setId: string, attributeId: string): Observable<AttributeSetDetail> {
    return this.http.delete<AttributeSetDetail>(
      `${API}/attribute-sets/${encodeURIComponent(setId)}/attributes/${encodeURIComponent(attributeId)}`
    );
  }

  reorderAttributes(setId: string, attributeIdsInOrder: string[]): Observable<AttributeSetDetail> {
    return this.http.put<AttributeSetDetail>(
      `${API}/attribute-sets/${encodeURIComponent(setId)}/attribute-order`, attributeIdsInOrder
    );
  }

  listAttributes(): Observable<Attribute[]> {
    return this.http.get<Attribute[]>(`${API}/attributes`);
  }

  createAttribute(name: string): Observable<Attribute> {
    return this.http.post<Attribute>(`${API}/attributes`, { name });
  }

  updateAttribute(id: string, name: string): Observable<Attribute> {
    return this.http.put<Attribute>(`${API}/attributes/${encodeURIComponent(id)}`, { name });
  }

  deleteAttribute(id: string): Observable<void> {
    return this.http.delete<void>(`${API}/attributes/${encodeURIComponent(id)}`);
  }

  listValues(attributeId: string): Observable<AttributeValue[]> {
    return this.http.get<AttributeValue[]>(`${API}/attributes/${encodeURIComponent(attributeId)}/values`);
  }

  createValue(attributeId: string, value: string): Observable<AttributeValue> {
    return this.http.post<AttributeValue>(`${API}/attributes/${encodeURIComponent(attributeId)}/values`, { value });
  }

  updateValue(attributeId: string, valueId: string, value: string): Observable<AttributeValue> {
    return this.http.put<AttributeValue>(
      `${API}/attributes/${encodeURIComponent(attributeId)}/values/${encodeURIComponent(valueId)}`, { value }
    );
  }

  deleteValue(attributeId: string, valueId: string): Observable<void> {
    return this.http.delete<void>(
      `${API}/attributes/${encodeURIComponent(attributeId)}/values/${encodeURIComponent(valueId)}`
    );
  }

  reorderValues(attributeId: string, valueIdsInOrder: string[]): Observable<AttributeValue[]> {
    return this.http.put<AttributeValue[]>(
      `${API}/attributes/${encodeURIComponent(attributeId)}/values-order`, valueIdsInOrder
    );
  }
}
