import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PrinterSlotConfig } from './printer.model';
import { environment } from '../environments/environment';

const API = environment.apiBaseUrl;

@Injectable({ providedIn: 'root' })
export class PrinterService {
  private http = inject(HttpClient);

  installed(): Observable<string[]> {
    return this.http.get<string[]>(`${API}/printers/installed`);
  }

  config(): Observable<PrinterSlotConfig[]> {
    return this.http.get<PrinterSlotConfig[]>(`${API}/printers/config`);
  }

  configure(slot: string, printerName: string): Observable<PrinterSlotConfig> {
    return this.http.put<PrinterSlotConfig>(`${API}/printers/config/${encodeURIComponent(slot)}`, { slot, printerName });
  }
}
