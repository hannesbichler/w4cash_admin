import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

const API = environment.apiBaseUrl;

export interface RemoteDbProperties {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class DatabaseSyncService {
  private http = inject(HttpClient);

  testConnection(properties: RemoteDbProperties): Observable<string> {
    return this.http.post(`${API}/database-sync/test-connection`, properties, { responseType: 'text' });
  }

  synchronizeRemoteToLocal(properties: RemoteDbProperties): Observable<string> {
    return this.http.post(`${API}/database-sync/remote-to-local`, properties, { responseType: 'text' });
  }
}
