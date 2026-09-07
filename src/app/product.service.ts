import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Product, ProductInput, Category, AttributeSet } from './product.model';
import { CategoryService, flattenCategories } from './category.service';
import { AttributeService } from './attribute.service';
import { TaxService } from './tax.service';
import { TaxCategory } from './tax.model';

const API = '/api';

function firstEmbeddedCollection<T>(response: { _embedded?: Record<string, T[]> }): T[] {
  const values = response._embedded ? Object.values(response._embedded) : [];
  return values[0] ?? [];
}

@Injectable({ providedIn: 'root' })
export class ProductService {
  private http = inject(HttpClient);
  private attributeSvc = inject(AttributeService);
  private taxSvc = inject(TaxService);
  private categorySvc = inject(CategoryService);

  list(categoryId?: string): Observable<Product[]> {
    const params: Record<string, string> = {};
    if (categoryId) params['categoryId'] = categoryId;
    return this.http.get<{ _embedded?: Record<string, Product[]> }>(`${API}/products`, { params }).pipe(
      map(firstEmbeddedCollection)
    );
  }

  get(id: string): Observable<Product> {
    return this.http.get<Product>(`${API}/products/${encodeURIComponent(id)}`);
  }

  create(product: ProductInput): Observable<Product> {
    return this.http.post<Product>(`${API}/products`, product);
  }

  update(id: string, product: ProductInput): Observable<Product> {
    return this.http.put<Product>(`${API}/products/${encodeURIComponent(id)}`, product);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${API}/products/${encodeURIComponent(id)}`);
  }

  // Flattened: the endpoint nests subcategories under their parent, and a product can sit in
  // any of them.
  categories(): Observable<Category[]> {
    return this.categorySvc.list().pipe(
      map(roots => flattenCategories(roots).map(entry => entry.category))
    );
  }

  attributeSets(): Observable<AttributeSet[]> {
    return this.attributeSvc.listSets();
  }

  taxCategories(): Observable<TaxCategory[]> {
    return this.taxSvc.listCategories();
  }
}
