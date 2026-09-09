import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { PrintJob } from './print-job.model';
import { environment } from '../environments/environment';

const API = environment.apiBaseUrl;

@Injectable({ providedIn: 'root' })
export class PrintJobService {
  private http = inject(HttpClient);

  list(tableId: string | undefined, personName: string | undefined, status: 'all' | 'ok' | 'fail', page: number, size: number): Observable<PrintJob[]> {
    const params: Record<string, string> = { page: String(page), size: String(size) };
    if (tableId) params['tableId'] = tableId;
    if (personName) params['personName'] = personName;
    if (status !== 'all') params['success'] = status;
    return this.http.get<PrintJob[]>(`${API}/print-jobs`, { params });
  }

  persons(): Observable<string[]> {
    return this.http.get<{ _embedded: { personList: { name: string }[] } }>(`${API}/persons`).pipe(
      map(r => (r._embedded?.personList ?? []).map(p => p.name).sort())
    );
  }

  reprint(id: number): Observable<string> {
    return this.http.post(`${API}/print-jobs/${id}/reprint`, null, { responseType: 'text' });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/print-jobs/${id}`);
  }
}
