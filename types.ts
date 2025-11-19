export interface ReceiptItem {
  id: string;
  name: string;
  price: number;
  assignedTo: string[]; // Array of Person IDs
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
}

export interface ParseResult {
  items: { name: string; price: number }[];
  tax: number;
  tip?: number;
}