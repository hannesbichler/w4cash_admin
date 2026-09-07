export interface Floor {
  id_: string;
  name: string;
  /** FLOORS.SORTORDER - the position the floor is shown in; null when never set. */
  sortOrder: number | null;
}

export type FloorInput = Omit<Floor, 'id_'>;

/** A table on a floor - one PLACES row. */
export interface Place {
  id_: string;
  name: string;
  floorId: string;
  x: number;
  y: number;
  /** Unset means the POS draws the table at its default size, which is not the same as 0. */
  width: number | null;
  height: number | null;
  fontSize: number | null;
  fontColor: string | null;
}

export type PlaceInput = Omit<Place, 'id_'>;
