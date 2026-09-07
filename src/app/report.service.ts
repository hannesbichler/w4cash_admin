import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ReportRef } from './report.model';

const API = '/api';

@Injectable({ providedIn: 'root' })
export class ReportService {
  private http = inject(HttpClient);

  list(): Observable<ReportRef[]> {
    return this.http.get<ReportRef[]>(`${API}/reports`);
  }

  upload(file: File): Observable<ReportRef> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.http.post<ReportRef>(`${API}/reports`, formData);
  }

  delete(name: string): Observable<void> {
    return this.http.delete<void>(`${API}/reports/${encodeURIComponent(name)}`);
  }

  run(name: string, parameters: Record<string, string>): Observable<Blob> {
    return this.http.post(`${API}/reports/${encodeURIComponent(name)}/run`, parameters, { responseType: 'blob' });
  }
}
