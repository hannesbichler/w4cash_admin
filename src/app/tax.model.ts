export interface TaxCategory {
  id: string;
  name: string;
}

export interface TaxRate {
  id: string;
  name: string;
  rate: number;
  validFrom: string;
}

export interface TaxCategoryDetail {
  id: string;
  name: string;
  rates: TaxRate[];
}
