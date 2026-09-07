/** A role in ROLES - the set of rights a Bediener is granted by being assigned to it. */
export interface Role {
  id_: string;
  name: string;
}

export type RoleInput = Omit<Role, 'id_'>;

/** One PEOPLE row: a Bediener who signs in at the POS. */
export interface Person {
  id_: string;
  name: string;
  /** ROLES.ID of the role this Bediener holds. */
  role: string;
  /** The card they badge in with; null when they sign in another way. */
  card: string | null;
  /**
   * PEOPLE.APPPASSWORD, a "sha1:…" digest the POS writes. The admin never sets or reads a PIN,
   * so this is only ever shown as set / not set.
   */
  apppassword: string | null;
  image: string | null;
}

/** APPPASSWORD and IMAGE stay with whatever the POS put there, so neither is editable here. */
export type PersonInput = Pick<Person, 'name' | 'role' | 'card'>;
