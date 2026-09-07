import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Category, CategoryInput, FlatCategory } from './category.model';

const API = '/api';

/** The backend nests subcategories under their parent; most views want one flat list. */
export function flattenCategories(roots: Category[], depth = 0): FlatCategory[] {
  const flat: FlatCategory[] = [];
  for (const category of roots) {
    flat.push({ category, depth });
    flat.push(...flattenCategories(category.children ?? [], depth + 1));
  }
  return flat;
}

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private http = inject(HttpClient);

  /** Top-level categories, each with its `children` subtree. */
  list(): Observable<Category[]> {
    return this.http.get<{ _embedded?: Record<string, Category[]> }>(`${API}/categories`).pipe(
      map(response => {
        const values = response._embedded ? Object.values(response._embedded) : [];
        return values[0] ?? [];
      })
    );
  }

  listFlat(): Observable<FlatCategory[]> {
    return this.list().pipe(map(roots => flattenCategories(roots)));
  }

  create(category: CategoryInput): Observable<Category> {
    return this.http.post<Category>(`${API}/categories`, category);
  }

  update(id: string, category: CategoryInput): Observable<Category> {
    return this.http.put<Category>(`${API}/categories/${encodeURIComponent(id)}`, category);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${API}/categories/${encodeURIComponent(id)}`);
  }
}
