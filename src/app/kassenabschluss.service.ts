import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Kassenabschluss } from './kassenabschluss.model';
import { environment } from '../environments/environment';

const API = environment.apiBaseUrl;

@Injectable({ providedIn: 'root' })
export class KassenabschlussService {
  private http = inject(HttpClient);

  preview(tabletId: string): Observable<Kassenabschluss> {
    return this.http.get<Kassenabschluss>(`${API}/kassenabschluss/${encodeURIComponent(tabletId)}`);
  }

  close(tabletId: string): Observable<Kassenabschluss> {
    return this.http.post<Kassenabschluss>(`${API}/kassenabschluss/${encodeURIComponent(tabletId)}`, null);
  }
}
