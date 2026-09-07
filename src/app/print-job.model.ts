export interface PrintJob {
  id: number;
  tableId: string;
  tableName: string;
  printerIndex: number;
  printerName: string;
  lineCount: number;
  printedAt: string;
  success: boolean;
  error: string | null;
  content: string | null;
  personId: string | null;
  personName: string | null;
}
