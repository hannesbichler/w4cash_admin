import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TaxCategory, TaxCategoryDetail, TaxRate } from './tax.model';
import { environment } from '../environments/environment';

const API = environment.apiBaseUrl;

@Injectable({ providedIn: 'root' })
export class TaxService {
  private http = inject(HttpClient);

  listCategories(): Observable<TaxCategory[]> {
    return this.http.get<TaxCategory[]>(`${API}/tax-categories`);
  }

  getCategory(id: string): Observable<TaxCategoryDetail> {
    return this.http.get<TaxCategoryDetail>(`${API}/tax-categories/${encodeURIComponent(id)}`);
  }

  createCategory(name: string): Observable<TaxCategoryDetail> {
    return this.http.post<TaxCategoryDetail>(`${API}/tax-categories`, { name });
  }

  renameCategory(id: string, name: string): Observable<TaxCategory> {
    return this.http.put<TaxCategory>(`${API}/tax-categories/${encodeURIComponent(id)}`, { name });
  }

  deleteCategory(id: string): Observable<void> {
    return this.http.delete<void>(`${API}/tax-categories/${encodeURIComponent(id)}`);
  }

  createRate(categoryId: string, name: string, rate: number, validFrom: string): Observable<TaxRate> {
    return this.http.post<TaxRate>(
      `${API}/tax-categories/${encodeURIComponent(categoryId)}/rates`, { name, rate, validFrom }
    );
  }

  updateRate(categoryId: string, taxId: string, name: string, rate: number, validFrom: string): Observable<TaxRate> {
    return this.http.put<TaxRate>(
      `${API}/tax-categories/${encodeURIComponent(categoryId)}/rates/${encodeURIComponent(taxId)}`,
      { name, rate, validFrom }
    );
  }

  deleteRate(categoryId: string, taxId: string): Observable<void> {
    return this.http.delete<void>(
      `${API}/tax-categories/${encodeURIComponent(categoryId)}/rates/${encodeURIComponent(taxId)}`
    );
  }
}
