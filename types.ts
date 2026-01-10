export interface SheetConfig {
  url: string;
  name: string;
}

export interface Transaction {
  id: string;
  date: string; // ISO string YYYY-MM-DD
  displayDate: string; // Original Thai format DD/MM/YYYY
  category: string;
  amount: number;
  description: string;
  sheetSourceIndex?: number; // To track which sheet input this came from
  sourceName?: string; // Optional user-defined name for the sheet source
}

export interface MonthlySummary {
  month: string;
  total: number;
}

export interface CategorySummary {
  name: string;
  value: number;
}

export enum ViewMode {
  DASHBOARD = 'DASHBOARD',
  TRANSACTIONS = 'TRANSACTIONS',
  IMPORT = 'IMPORT'
}