export interface Category {
  id_: string;
  name: string;
  parentId: string | null;
  printer: number;
  /** Present on GET /categories, which returns roots with their subtree attached. */
  children?: Category[];
}

export type CategoryInput = Omit<Category, 'id_' | 'children'>;

/** A category plus its depth in the tree, for indented lists and pickers. */
export interface FlatCategory {
  category: Category;
  depth: number;
}
