export interface PaymentLine {
  payment: string;
  description: string;
  total: number;
}

export interface TaxBreakdown {
  category: string;
  taxAmount: number;
  baseAmount: number;
}

export interface Kassenabschluss {
  tabletId: string;
  money: string;
  host: string;
  hostSequence: string;
  dateStart: string;
  dateEnd: string | null;
  ticketCount: number;
  cashTotal: number;
  cardTotal: number;
  paperTotal: number;
  cashInOutTotal: number;
  freeTotal: number;
  paymentLines: PaymentLine[];
  salesCount: number;
  salesBase: number;
  salesTax: number;
  salesGrossTotal: number;
  taxBreakdown: TaxBreakdown[];
}
