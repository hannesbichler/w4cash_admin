import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Floor, FloorInput, Place, PlaceInput } from './floor.model';

const API = '/api';

function firstEmbeddedCollection<T>(response: { _embedded?: Record<string, T[]> }): T[] {
  const values = response._embedded ? Object.values(response._embedded) : [];
  return values[0] ?? [];
}

@Injectable({ providedIn: 'root' })
export class FloorService {
  private http = inject(HttpClient);

  list(): Observable<Floor[]> {
    return this.http.get<{ _embedded?: Record<string, Floor[]> }>(`${API}/floors`).pipe(
      map(firstEmbeddedCollection)
    );
  }

  create(floor: FloorInput): Observable<Floor> {
    return this.http.post<Floor>(`${API}/floors`, floor);
  }

  update(id: string, floor: FloorInput): Observable<Floor> {
    return this.http.put<Floor>(`${API}/floors/${encodeURIComponent(id)}`, floor);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${API}/floors/${encodeURIComponent(id)}`);
  }

  /** Tables on one floor. */
  places(floorId: string): Observable<Place[]> {
    return this.http.get<{ _embedded?: Record<string, Place[]> }>(`${API}/places/${encodeURIComponent(floorId)}`).pipe(
      map(firstEmbeddedCollection)
    );
  }

  createPlace(place: PlaceInput): Observable<Place> {
    return this.http.post<Place>(`${API}/places`, place);
  }

  updatePlace(id: string, place: PlaceInput): Observable<Place> {
    return this.http.put<Place>(`${API}/places/${encodeURIComponent(id)}`, place);
  }

  deletePlace(id: string): Observable<void> {
    return this.http.delete<void>(`${API}/places/${encodeURIComponent(id)}`);
  }
}
