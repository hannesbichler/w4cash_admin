import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Person, PersonInput, Role, RoleInput } from './person.model';
import { environment } from '../environments/environment';

const API = environment.apiBaseUrl;

function firstEmbeddedCollection<T>(response: { _embedded?: Record<string, T[]> }): T[] {
  const values = response._embedded ? Object.values(response._embedded) : [];
  return values[0] ?? [];
}

@Injectable({ providedIn: 'root' })
export class PersonService {
  private http = inject(HttpClient);

  // --- roles -------------------------------------------------------------------------------

  roles(): Observable<Role[]> {
    return this.http.get<{ _embedded?: Record<string, Role[]> }>(`${API}/roles`).pipe(
      map(firstEmbeddedCollection)
    );
  }

  createRole(role: RoleInput): Observable<Role> {
    return this.http.post<Role>(`${API}/roles`, role);
  }

  updateRole(id: string, role: RoleInput): Observable<Role> {
    return this.http.put<Role>(`${API}/roles/${encodeURIComponent(id)}`, role);
  }

  deleteRole(id: string): Observable<void> {
    return this.http.delete<void>(`${API}/roles/${encodeURIComponent(id)}`);
  }

  // --- Bediener ----------------------------------------------------------------------------

  persons(): Observable<Person[]> {
    return this.http.get<{ _embedded?: Record<string, Person[]> }>(`${API}/persons`).pipe(
      map(firstEmbeddedCollection)
    );
  }

  createPerson(person: PersonInput): Observable<Person> {
    return this.http.post<Person>(`${API}/persons`, person);
  }

  updatePerson(id: string, person: PersonInput): Observable<Person> {
    return this.http.put<Person>(`${API}/persons/${encodeURIComponent(id)}`, person);
  }

  deletePerson(id: string): Observable<void> {
    return this.http.delete<void>(`${API}/persons/${encodeURIComponent(id)}`);
  }
}
