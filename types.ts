
export interface ReceiptItem {
  id: string;
  name: string;
  price: number;
  assignedTo: string[]; // Array of Person IDs
  shares?: Record<string, number>; // Person ID -> Number of shares (default 1)
}

export interface Person {
  id: string;
  name: string;
  color: string;
  avatarUrl?: string;
}

export interface BillState {
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  tipAmount: number;
  tipPercentage: number;
  tipType: 'percent' | 'amount';
  people: Person[];
  tipFromReceipt?: boolean;
  currency: string;
  coverAssignments: Record<string, string>; // Person ID -> Payer ID (or 'SPLIT_ALL')
}

export interface ParseResult {
  items: { name: string; price: number }[];
  tax: number;
  tip?: number;
  currency: string;
}

export type BillStatus = 'draft' | 'finalized';

export interface BillRecord {
  id: string;
  date: string; // ISO string
  status: BillStatus;
  total: number;
  state: BillState;
}