export interface Product {
  id_: string;
  reference: string | null;
  code: string | null;
  name: string;
  priceBuy: number;
  pricesell: number;
  taxCatId: string | null;
  categoryId: string | null;
  unit: string | null;
  attributeSetId: string | null;
  // Catalog membership in the POS (a PRODUCTS_CAT row server-side), shown here as "active".
  active: boolean;
}

export type ProductInput = Omit<Product, 'id_'>;

export type { Category } from './category.model';

export type { AttributeSet } from './attribute.model';
