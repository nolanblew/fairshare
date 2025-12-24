
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ReceiptItem, Person, BillState, BillRecord, BillStatus } from './types';
import { parseReceiptImage } from './services/geminiService';
import { Camera, Upload, Plus, ArrowLeft, Check, Trash2, Edit2, DollarSign, User, ChevronRight, ChevronDown, ChevronUp, History, Clock, Receipt, Minus, Link, Gift } from './components/Icons';
import { Avatar } from './components/Avatar';
import { LoadingOverlay } from './components/LoadingOverlay';

// --- Constants ---
const COLORS = [
  '#6366f1', // Indigo
  '#ec4899', // Pink
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#ef4444', // Red
  '#14b8a6', // Teal
];

const DEFAULT_PEOPLE: Person[] = [
  { id: 'p1', name: 'Me', color: COLORS[0] },
];

const INITIAL_BILL_STATE: BillState = {
  items: [],
  subtotal: 0,
  tax: 0,
  tipAmount: 0,
  tipPercentage: 15,
  tipType: 'percent',
  people: DEFAULT_PEOPLE,
  tipFromReceipt: false,
  currency: '$',
  coverAssignments: {},
};

// --- Helper Functions ---
const hexToRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
};

const calculateTotals = (state: BillState) => {
  const { subtotal, tax, tipAmount, tipPercentage, tipType } = state;
  const finalTip = tipType === 'percent' ? subtotal * (tipPercentage / 100) : tipAmount;
  const grandTotal = subtotal + tax + finalTip;
  return { finalTip, grandTotal };
};

const getPersonTotals = (personId: string, billState: BillState) => {
  const { items, subtotal, tax, tipAmount, tipPercentage, tipType } = billState;
  
  let myItemTotal = 0;
  items.forEach(item => {
    if (item.assignedTo.includes(personId)) {
      // Calculate shares
      const totalShares = item.assignedTo.reduce((sum, id) => sum + (item.shares?.[id] ?? 1), 0);
      const myShares = item.shares?.[personId] ?? 1;
      
      if (totalShares > 0) {
        myItemTotal += (myShares / totalShares) * item.price;
      }
    }
  });

  const ratio = subtotal > 0 ? myItemTotal / subtotal : 0;
  const myTax = tax * ratio;
  const finalTip = tipType === 'percent' ? subtotal * (tipPercentage / 100) : tipAmount;
  const myTip = finalTip * ratio;

  return {
    subtotal: myItemTotal,
    tax: myTax,
    tip: myTip,
    total: myItemTotal + myTax + myTip
  };
};

// Returns a map of PersonID -> Final Amount Due after applying cover rules
const calculateFinalSplits = (billState: BillState) => {
    const rawTotals = billState.people.reduce((acc, person) => {
        acc[person.id] = getPersonTotals(person.id, billState).total;
        return acc;
    }, {} as Record<string, number>);

    const finalTotals = { ...rawTotals };
    const notes: Record<string, string[]> = {}; // Notes for why amount changed
    
    // Process Cover Assignments
    Object.entries(billState.coverAssignments).forEach(([coveredId, payerId]) => {
        const amountToCover = rawTotals[coveredId];
        if (amountToCover <= 0) return; // Nothing to cover

        if (payerId === 'SPLIT_ALL') {
            // Split among everyone else (excluding the covered person)
            const otherPeople = billState.people.filter(p => p.id !== coveredId);
            if (otherPeople.length > 0) {
                const splitAmount = amountToCover / otherPeople.length;
                
                // Remove from covered person
                finalTotals[coveredId] = 0;
                if (!notes[coveredId]) notes[coveredId] = [];
                notes[coveredId].push('Covered by group');

                // Add to others
                otherPeople.forEach(p => {
                    finalTotals[p.id] += splitAmount;
                    if (!notes[p.id]) notes[p.id] = [];
                    const coveredName = billState.people.find(p=>p.id===coveredId)?.name || 'Someone';
                    notes[p.id].push(`Covering ${coveredName} (split)`);
                });
            }
        } else {
            // Direct coverage
            const payer = billState.people.find(p => p.id === payerId);
            if (payer) {
                // Remove from covered person
                finalTotals[coveredId] = 0;
                if (!notes[coveredId]) notes[coveredId] = [];
                notes[coveredId].push(`Covered by ${payer.name}`);

                // Add to payer
                finalTotals[payerId] += amountToCover;
                if (!notes[payerId]) notes[payerId] = [];
                const coveredName = billState.people.find(p=>p.id===coveredId)?.name || 'Someone';
                notes[payerId].push(`Covering ${coveredName}`);
            }
        }
    });

    return { rawTotals, finalTotals, notes };
};


// --- Sub-Components ---

const PersonSummaryCard: React.FC<{
  person: Person;
  billState: BillState;
  rawTotal: number;
  finalTotal: number;
  notes?: string[];
  currency?: string;
}> = ({ person, billState, rawTotal, finalTotal, notes, currency = '$' }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const items = billState.items.filter(i => i.assignedTo.includes(person.id));
  const totals = getPersonTotals(person.id, billState);

  // Status checks
  const isCovered = finalTotal === 0 && rawTotal > 0;
  const isCoveringOthers = finalTotal > rawTotal;
  const isBirthday = billState.coverAssignments[person.id] === 'SPLIT_ALL';

  if (rawTotal === 0 && finalTotal === 0 && items.length === 0) return null;

  return (
    <div className={`
        bg-white dark:bg-slate-900 rounded-2xl shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] border overflow-hidden transition-all duration-300 hover:shadow-md
        ${isCovered ? 'border-slate-100 dark:border-slate-800 opacity-70' : 'border-slate-200 dark:border-slate-800'}
    `}>
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors select-none"
      >
        <div className="relative">
            <Avatar name={person.name} color={person.color} size="sm" showLabel={false} />
            {isBirthday && (
                <div className="absolute -top-1 -right-1 bg-white dark:bg-slate-800 rounded-full p-0.5 shadow-sm">
                    <div className="bg-pink-500 rounded-full p-1">
                        <Gift size={8} className="text-white" />
                    </div>
                </div>
            )}
             {billState.coverAssignments[person.id] && billState.coverAssignments[person.id] !== 'SPLIT_ALL' && (
                <div className="absolute -top-1 -right-1 bg-white dark:bg-slate-800 rounded-full p-0.5 shadow-sm">
                    <div className="bg-emerald-500 rounded-full p-1">
                        <Link size={8} className="text-white" />
                    </div>
                </div>
            )}
        </div>

        <div className="flex flex-col">
            <span className={`font-bold tracking-tight text-lg ${isCovered ? 'text-slate-500 line-through decoration-2 decoration-slate-300' : 'text-slate-800 dark:text-slate-100'}`}>
                {person.name}
            </span>
            {isCovered && notes && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    {notes[0]}
                </span>
            )}
            {isCoveringOthers && (
                 <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                    Includes others <Link size={10}/>
                 </span>
            )}
        </div>
        
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
             <span className={`font-black text-xl tracking-tight ${isCovered ? 'text-slate-300 dark:text-slate-600' : 'text-slate-900 dark:text-white'}`}>
                {currency}{finalTotal.toFixed(2)}
             </span>
          </div>
          <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
             <ChevronDown size={20} className="text-slate-400" />
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="px-5 pb-5 animate-fadeIn">
          {/* Cover Notes Logic */}
          {notes && notes.length > 0 && (
             <div className="mb-4 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                 {notes.map((note, idx) => (
                     <div key={idx} className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                         {note.includes('Covered by') ? <Check size={12} className="text-emerald-500"/> : <Plus size={12} className="text-slate-400"/>}
                         {note}
                     </div>
                 ))}
                 {isCoveringOthers && (
                     <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between text-xs font-medium">
                         <span className="text-slate-500">My Items</span>
                         <span>{currency}{rawTotal.toFixed(2)}</span>
                     </div>
                 )}
             </div>
          )}

          <div className="pt-2 space-y-2 text-xs font-medium text-slate-500 dark:text-slate-400 mb-5">
             <div className="flex justify-between">
                  <span>Subtotal ({items.length} items)</span>
                  <span className="text-slate-700 dark:text-slate-300">{currency}{totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                  <span>Tax</span>
                  <span className="text-slate-700 dark:text-slate-300">{currency}{totals.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                  <span>Tip</span>
                  <span className="text-slate-700 dark:text-slate-300">{currency}{totals.tip.toFixed(2)}</span>
              </div>
          </div>

          <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-3">Itemized Breakdown</p>
              <div className="space-y-3">
                {items.length === 0 ? <p className="text-xs text-slate-400 italic">No items assigned</p> : items.map(item => {
                    const totalShares = item.assignedTo.reduce((sum, id) => sum + (item.shares?.[id] ?? 1), 0);
                    const myShares = item.shares?.[person.id] ?? 1;
                    const myShareCost = (myShares / totalShares) * item.price;
                    const isUnevenSplit = totalShares !== item.assignedTo.length;
                    
                    return (
                      <div key={item.id} className="flex justify-between items-start text-sm">
                          <span className="text-slate-700 dark:text-slate-300 font-medium leading-tight max-w-[70%]">{item.name}</span>
                          <div className="flex flex-col items-end">
                              <span className="text-slate-900 dark:text-white font-bold tracking-tight">{currency}{myShareCost.toFixed(2)}</span>
                              {(item.assignedTo.length > 1) && (
                                <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full mt-0.5">
                                  {isUnevenSplit 
                                    ? `${myShares} share${myShares > 1 ? 's' : ''} (${Math.round((myShares/totalShares)*100)}%)`
                                    : `Split 1/${item.assignedTo.length}`
                                  }
                                </span>
                              )}
                          </div>
                      </div>
                    );
                })}
              </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Reusable Summary Content Component
const BillSummaryContent: React.FC<{
  billState: BillState;
  isFinalized: boolean;
  onUpdateBillState?: (newState: BillState) => void;
  readOnly?: boolean;
}> = ({ billState, isFinalized, onUpdateBillState, readOnly = false }) => {
  const { finalTip, grandTotal } = calculateTotals(billState);
  const { currency } = billState;
  const { rawTotals, finalTotals, notes } = useMemo(() => calculateFinalSplits(billState), [billState]);

  return (
    <div className="lg:grid lg:grid-cols-12 lg:gap-8 items-start max-w-7xl mx-auto w-full">
      {/* Left Col: Totals Card */}
      <div className="lg:col-span-5 lg:sticky lg:top-6">
        <div className="bg-slate-900 dark:bg-slate-800 text-white rounded-3xl p-6 shadow-xl shadow-slate-200 dark:shadow-slate-900/50 mb-6 lg:mb-0">
          <div className="flex justify-between items-end mb-6">
            <div>
              <p className="text-slate-400 font-medium mb-1">Total Bill</p>
              <h2 className="text-5xl font-black tracking-tighter">{currency}{grandTotal.toFixed(2)}</h2>
            </div>
            {isFinalized && (
              <div className="bg-green-500/20 text-green-300 border border-green-500/30 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-1">
                <Check size={12} strokeWidth={4} /> Finalized
              </div>
            )}
          </div>

          <div className="space-y-4">
            {/* Tax Row */}
            <div className="flex items-center justify-between bg-white/5 p-3 rounded-xl">
              <label className="text-slate-300 font-bold text-sm">Tax</label>
              {readOnly || isFinalized ? (
                <span className="font-bold text-white">{currency}{billState.tax.toFixed(2)}</span>
              ) : (
                <div className="flex items-center bg-white/10 rounded-lg px-3 py-1 border border-white/10 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400 transition-all">
                  <span className="text-slate-400 text-sm mr-1">{currency}</span>
                  <input
                    type="number"
                    value={billState.tax}
                    onChange={(e) => onUpdateBillState?.({ ...billState, tax: parseFloat(e.target.value) || 0 })}
                    className="bg-transparent text-right text-white font-bold w-20 focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* Tip Row */}
            <div className="space-y-3 bg-white/5 p-3 rounded-xl">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <label className="text-slate-300 font-bold text-sm">Tip</label>
                  {billState.tipFromReceipt && (
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded text-xs font-medium">From Receipt</span>
                  )}
                </div>
                <span className="font-bold text-white">{currency}{finalTip.toFixed(2)}</span>
              </div>

              {!readOnly && !isFinalized && onUpdateBillState && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-white/10 p-1 rounded-lg flex">
                      <button
                        onClick={() => onUpdateBillState({ ...billState, tipType: 'percent' })}
                        className={`flex-1 py-1 rounded-md text-xs font-bold transition-all ${billState.tipType === 'percent' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-white'}`}
                      >
                        %
                      </button>
                      <button
                        onClick={() => onUpdateBillState({ ...billState, tipType: 'amount' })}
                        className={`flex-1 py-1 rounded-md text-xs font-bold transition-all ${billState.tipType === 'amount' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-white'}`}
                      >
                        {currency}
                      </button>
                    </div>

                    {billState.tipType === 'percent' ? (
                      <div className="flex items-center bg-white/10 rounded-lg px-3 py-1.5 border border-white/10 w-24">
                        <input
                          type="number"
                          value={billState.tipPercentage}
                          onChange={(e) => onUpdateBillState({ ...billState, tipPercentage: parseFloat(e.target.value) || 0 })}
                          className="bg-transparent text-right text-white font-bold w-full focus:outline-none"
                        />
                        <span className="text-slate-400 text-sm ml-1">%</span>
                      </div>
                    ) : (
                      <div className="flex items-center bg-white/10 rounded-lg px-3 py-1.5 border border-white/10 w-24">
                        <span className="text-slate-400 text-sm mr-1">{currency}</span>
                        <input
                          type="number"
                          value={billState.tipAmount}
                          onChange={(e) => onUpdateBillState({ ...billState, tipAmount: parseFloat(e.target.value) || 0 })}
                          className="bg-transparent text-right text-white font-bold w-full focus:outline-none"
                        />
                      </div>
                    )}
                  </div>

                  {billState.tipType === 'percent' && (
                    <input
                      type="range"
                      min="0"
                      max="30"
                      step="1"
                      value={billState.tipPercentage}
                      onChange={(e) => onUpdateBillState({ ...billState, tipPercentage: parseInt(e.target.value) })}
                      className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                    />
                  )}
                  <div className="flex justify-between text-[10px] text-slate-500 font-bold px-1">
                    <span>0%</span>
                    <span>15%</span>
                    <span>30%</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right Col: People List */}
      <div className="lg:col-span-7">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 ml-1">Per Person Breakdown</h3>
        <div className="space-y-4">
          {billState.people.map(person => (
            <PersonSummaryCard
              key={person.id}
              person={person}
              billState={billState}
              rawTotal={rawTotals[person.id] || 0}
              finalTotal={finalTotals[person.id] || 0}
              notes={notes[person.id]}
              currency={currency}
            />
          ))}
        </div>
      </div>
    </div>
  );
};


// --- Main App Component ---
export default function App() {
  // --- State ---
  const [view, setView] = useState<'upload' | 'split' | 'summary' | 'history'>('upload');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Current Bill Data
  const [currentBillId, setCurrentBillId] = useState<string | null>(null);
  const [billStatus, setBillStatus] = useState<BillStatus>('draft');
  const [billState, setBillState] = useState<BillState>(INITIAL_BILL_STATE);

  const [activePersonId, setActivePersonId] = useState<string>(DEFAULT_PEOPLE[0].id);
  const [editingItem, setEditingItem] = useState<ReceiptItem | null>(null);
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  
  // Cover / Group Settings
  const [isCoverModalOpen, setIsCoverModalOpen] = useState(false);

  // History Persistence
  const [history, setHistory] = useState<BillRecord[]>([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<BillRecord | null>(null);
  
  // File Input Refs
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // --- Persistence Effects ---
  useEffect(() => {
    const savedHistory = localStorage.getItem('fs_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, []);

  // Save history whenever it changes
  useEffect(() => {
    if (history.length > 0) {
        localStorage.setItem('fs_history', JSON.stringify(history));
    }
  }, [history]);

  // Initialize selectedHistoryItem when history loads or changes if in desktop view logic
  useEffect(() => {
      if (view === 'history' && history.length > 0 && !selectedHistoryItem) {
          setSelectedHistoryItem(history[0]);
      }
  }, [history, view, selectedHistoryItem]);

  // Save current bill to history as Draft when state changes (debounced or on significant actions)
  const saveBill = (status: BillStatus) => {
    if (billState.items.length === 0) return;

    const { grandTotal } = calculateTotals(billState);
    const id = currentBillId || `bill-${Date.now()}`;
    const record: BillRecord = {
      id,
      date: new Date().toISOString(),
      status,
      total: grandTotal,
      state: billState
    };

    if (!currentBillId) setCurrentBillId(id);
    setBillStatus(status);

    setHistory(prev => {
        const existingIndex = prev.findIndex(r => r.id === id);
        let newHistory;
        if (existingIndex >= 0) {
            newHistory = [...prev];
            newHistory[existingIndex] = record;
        } else {
            // Add to top, keep max 5
            newHistory = [record, ...prev].slice(0, 5);
        }
        return newHistory;
    });
  };

  const loadBillRecord = (record: BillRecord) => {
      setBillState(record.state);
      setCurrentBillId(record.id);
      setBillStatus(record.status);
      setActivePersonId(record.state.people[0].id);
      setView(record.status === 'finalized' ? 'summary' : 'split');
  };

  // --- Handlers ---

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        
        try {
          const parsedData = await parseReceiptImage(base64data);
          
          const newItems: ReceiptItem[] = parsedData.items.map((item, index) => ({
            id: `item-${index}-${Date.now()}`,
            name: item.name,
            price: item.price,
            assignedTo: [],
            shares: {},
          }));

          const subtotal = newItems.reduce((acc, item) => acc + item.price, 0);

          const newState = {
            items: newItems,
            subtotal: subtotal,
            tax: parsedData.tax,
            tipAmount: parsedData.tip || 0,
            tipType: (parsedData.tip ? 'amount' : 'percent') as 'amount' | 'percent',
            tipFromReceipt: !!parsedData.tip,
            tipPercentage: parsedData.tip ? 0 : 15,
            people: DEFAULT_PEOPLE,
            currency: parsedData.currency || '$',
            coverAssignments: {}
          };

          setBillState(newState);
          setCurrentBillId(null); // New bill
          setBillStatus('draft');
          setView('split');

        } catch (err) {
          setError("Failed to process receipt. Please try again or enter items manually.");
          console.error(err);
        } finally {
          setIsLoading(false);
        }
      };
    } catch (err) {
       setIsLoading(false);
       setError("Error reading file");
    }
  };

  const handleAddItem = () => {
    const newItem: ReceiptItem = {
      id: `manual-${Date.now()}`,
      name: 'New Item',
      price: 0,
      assignedTo: [],
      shares: {},
    };
    setBillState(prev => ({ ...prev, items: [...prev.items, newItem] }));
    setEditingItem(newItem);
  };

  const handleSaveEdit = (item: ReceiptItem) => {
    setBillState(prev => {
        const newState = {
            ...prev,
            items: prev.items.map(i => i.id === item.id ? item : i),
            subtotal: prev.items.map(i => i.id === item.id ? item : i).reduce((sum, i) => sum + i.price, 0)
        };
        return newState;
    });
    setEditingItem(null);
  };

  const handleDeleteItem = (id: string) => {
     setBillState(prev => {
       const newItems = prev.items.filter(i => i.id !== id);
       return {
         ...prev,
         items: newItems,
         subtotal: newItems.reduce((sum, i) => sum + i.price, 0)
       };
     });
     setEditingItem(null);
  };

  const toggleAssignment = (itemId: string) => {
    if (billStatus === 'finalized') return;

    setBillState(prev => {
      const items = prev.items.map(item => {
        if (item.id !== itemId) return item;
        
        const isAssigned = item.assignedTo.includes(activePersonId);
        let newAssignedTo;
        const newShares = { ...(item.shares || {}) };
        
        if (isAssigned) {
          newAssignedTo = item.assignedTo.filter(id => id !== activePersonId);
          delete newShares[activePersonId];
        } else {
          newAssignedTo = [...item.assignedTo, activePersonId];
          newShares[activePersonId] = 1; // Default to 1 share
        }
        
        return { ...item, assignedTo: newAssignedTo, shares: newShares };
      });
      return { ...prev, items };
    });
  };

  const updateItemShare = (item: ReceiptItem, personId: string, delta: number) => {
      const currentShares = item.shares?.[personId] ?? 1;
      const newShares = Math.max(1, currentShares + delta);
      
      setEditingItem({
          ...item,
          shares: {
              ...(item.shares || {}),
              [personId]: newShares
          }
      });
  };

  const addPerson = () => {
    if (!newPersonName.trim()) {
      setIsAddingPerson(false);
      return;
    }
    const newPerson: Person = {
      id: `p-${Date.now()}`,
      name: newPersonName,
      color: COLORS[billState.people.length % COLORS.length],
    };
    setBillState(prev => ({ ...prev, people: [...prev.people, newPerson] }));
    setActivePersonId(newPerson.id);
    setNewPersonName('');
    setIsAddingPerson(false);
  };

  const updateCoverAssignment = (personId: string, payerId: string) => {
      setBillState(prev => {
          const newAssigns = { ...prev.coverAssignments };
          if (personId === payerId) {
              delete newAssigns[personId];
          } else {
              newAssigns[personId] = payerId;
          }
          return { ...prev, coverAssignments: newAssigns };
      });
  };

  // Save Draft when navigating away from Split or Summary (unless finalized)
  const handleBackToHome = () => {
    if (billStatus === 'draft' && billState.items.length > 0) {
        saveBill('draft');
    }
    setView('upload');
    // Reset state for next time
    setBillState(INITIAL_BILL_STATE);
    setCurrentBillId(null);
    setBillStatus('draft');
  };

  const handleFinalize = () => {
      saveBill('finalized');
  };

  // --- Views ---

  if (isLoading) return <LoadingOverlay message="Analyzing Receipt..." />;

  // 1. Upload (Home) Screen
  if (view === 'upload') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col relative overflow-hidden transition-colors duration-300">
        <div className="absolute top-4 right-4 z-20">
             <button 
                onClick={() => setView('history')}
                className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md p-3 rounded-full shadow-sm text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700 transition-all active:scale-95"
             >
                <History size={24} />
             </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center z-10">
            <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-3xl shadow-2xl shadow-indigo-200 dark:shadow-indigo-900/40 flex items-center justify-center mb-10 transform -rotate-6 hover:rotate-0 transition-transform duration-500">
                <DollarSign className="text-white" size={48} />
            </div>
            <h1 className="text-5xl font-black text-slate-900 dark:text-white mb-4 tracking-tighter">FairShare</h1>
            <p className="text-slate-500 dark:text-slate-400 text-lg font-medium max-w-xs mb-12 leading-relaxed">
              Snap a receipt, assign items to friends, and split the bill in seconds.
            </p>

            <div className="space-y-4 w-full max-w-xs">
                <button 
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-bold text-lg shadow-lg shadow-indigo-200 dark:shadow-none flex items-center justify-center gap-3 transition-all active:scale-95 active:shadow-none"
                >
                  <Camera size={24} strokeWidth={2.5} />
                  Scan Receipt
                </button>
                <input 
                  type="file" 
                  ref={cameraInputRef} 
                  accept="image/*" 
                  capture="environment"
                  className="hidden" 
                  onChange={handleFileUpload}
                />

                <button 
                  onClick={() => uploadInputRef.current?.click()}
                  className="w-full bg-white dark:bg-slate-900 hover:bg-indigo-5 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400 py-4 rounded-2xl font-bold text-lg shadow-sm border-2 border-indigo-100 dark:border-slate-800 flex items-center justify-center gap-3 transition-all active:scale-95"
                >
                  <Upload size={24} strokeWidth={2.5} />
                  Upload Image
                </button>
                <input 
                  type="file" 
                  ref={uploadInputRef} 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleFileUpload}
                />
                
                <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200 dark:border-slate-800"></div>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-slate-50 dark:bg-slate-950 px-2 text-slate-400 font-bold tracking-widest">Or</span>
                    </div>
                </div>

                <button 
                  onClick={() => {
                      setBillState({
                        ...INITIAL_BILL_STATE,
                        items: [
                           {id: '1', name: 'Double Cheeseburger', price: 15.50, assignedTo: [], shares: {}},
                           {id: '2', name: 'Truffle Fries', price: 8.50, assignedTo: [], shares: {}},
                           {id: '3', name: 'Cola', price: 3.50, assignedTo: [], shares: {}},
                        ],
                        subtotal: 27.50,
                        tax: 2.50,
                        currency: '$'
                      });
                      setCurrentBillId(null);
                      setBillStatus('draft');
                      setView('split');
                  }}
                  className="w-full bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 py-3 rounded-xl font-bold shadow-sm border border-slate-200 dark:border-slate-800 flex items-center justify-center gap-2 transition-all active:scale-95 text-sm"
                >
                   <Edit2 size={18} strokeWidth={2.5} />
                   Manual Entry / Demo
                </button>
            </div>
            {error && <p className="mt-8 text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 px-6 py-3 rounded-xl text-sm font-medium animate-fadeIn shadow-sm">{error}</p>}
        </div>
        
        {/* Background decoration */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-purple-300 dark:bg-purple-900 rounded-full blur-3xl opacity-20 animate-pulse"></div>
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-300 dark:bg-indigo-900 rounded-full blur-3xl opacity-20 animate-pulse" style={{animationDelay: '2s'}}></div>
      </div>
    );
  }

  // 4. History Screen (Responsive Split View)
  if (view === 'history') {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans flex flex-col lg:flex-row transition-colors duration-300 overflow-hidden">
            {/* Left Pane: History List */}
            <div className={`
               flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 h-full transition-all duration-300
               w-full lg:w-1/3 xl:w-1/4
            `}>
              <header className="px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.5)] z-10 flex items-center gap-3 shrink-0 border-b border-slate-100 dark:border-slate-800">
                  <button onClick={() => setView('upload')} className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors active:scale-90">
                      <ArrowLeft size={22} className="text-slate-700 dark:text-slate-200" strokeWidth={2.5} />
                  </button>
                  <h2 className="font-extrabold text-slate-800 dark:text-slate-100 text-lg tracking-tight">Recent Bills</h2>
              </header>
              
              <div className="p-4 space-y-3 flex-1 overflow-y-auto">
                  {history.length === 0 ? (
                      <div className="text-center mt-20 opacity-50">
                          <Clock className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
                          <p className="text-slate-500 dark:text-slate-400 font-medium">No history yet</p>
                      </div>
                  ) : (
                      history.map(record => {
                        const isSelected = selectedHistoryItem?.id === record.id;
                        return (
                          <div 
                              key={record.id}
                              onClick={() => {
                                // On mobile, load immediately. On desktop, select for preview.
                                if (window.innerWidth >= 1024) {
                                  setSelectedHistoryItem(record);
                                } else {
                                  loadBillRecord(record);
                                }
                              }}
                              className={`
                                p-5 rounded-2xl shadow-sm border active:scale-[0.98] transition-all cursor-pointer flex justify-between items-center
                                ${isSelected 
                                    ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 ring-1 ring-indigo-200 dark:ring-indigo-800' 
                                    : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:shadow-md'
                                }
                              `}
                          >
                              <div>
                                  <div className="flex items-center gap-2 mb-1">
                                      <span className="font-bold text-slate-800 dark:text-white text-lg">{record.state.currency}{record.total.toFixed(2)}</span>
                                      {record.status === 'finalized' ? (
                                          <span className="text-[10px] font-bold uppercase tracking-wider bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                                              <Check size={10} strokeWidth={4} /> Paid
                                          </span>
                                      ) : (
                                          <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                                              <Clock size={10} strokeWidth={3} /> Draft
                                          </span>
                                      )}
                                  </div>
                                  <p className="text-xs text-slate-400 font-medium">{formatDate(record.date)} • {record.state.items.length} items</p>
                              </div>
                              <ChevronRight className="text-slate-300 dark:text-slate-600 lg:hidden" />
                          </div>
                        );
                      })
                  )}
              </div>
            </div>

            {/* Right Pane: Preview (Desktop Only) */}
            <div className="hidden lg:flex flex-1 bg-slate-50 dark:bg-slate-950 flex-col relative h-full overflow-hidden">
               {selectedHistoryItem ? (
                 <div className="flex-1 flex flex-col h-full">
                    <header className="bg-white dark:bg-slate-900 px-8 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shadow-sm z-10">
                       <div className="flex items-center gap-4">
                          <h2 className="font-black text-2xl text-slate-900 dark:text-white tracking-tight">
                             {selectedHistoryItem.status === 'finalized' ? 'Finalized Bill' : 'Draft Preview'}
                          </h2>
                          <span className="text-slate-400 text-sm font-medium px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full">
                             {formatDate(selectedHistoryItem.date)}
                          </span>
                       </div>
                       
                       <button 
                          onClick={() => loadBillRecord(selectedHistoryItem)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-200 dark:shadow-none transition-all active:scale-95 flex items-center gap-2"
                       >
                          {selectedHistoryItem.status === 'finalized' ? (
                             <>Open Receipt <ChevronRight size={18}/></>
                          ) : (
                             <>Resume Editing <Edit2 size={18}/></>
                          )}
                       </button>
                    </header>
                    
                    <div className="flex-1 overflow-y-auto p-8">
                       <BillSummaryContent 
                          billState={selectedHistoryItem.state} 
                          isFinalized={selectedHistoryItem.status === 'finalized'} 
                          readOnly={true}
                       />
                    </div>
                 </div>
               ) : (
                 <div className="flex-1 flex flex-col items-center justify-center text-slate-300 dark:text-slate-700">
                    <Receipt size={64} strokeWidth={1} className="mb-4 opacity-50"/>
                    <p className="text-lg font-medium">Select a bill to preview details</p>
                 </div>
               )}
            </div>
        </div>
      );
  }

  // 2. Split Screen
  if (view === 'split') {
    return (
      <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-950 font-sans transition-colors duration-300">
        {/* Header */}
        <header className="bg-white dark:bg-slate-900 px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.5)] z-10 flex justify-between items-center shrink-0 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
                <button onClick={handleBackToHome} className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors active:scale-90">
                    <ArrowLeft size={22} className="text-slate-700 dark:text-slate-200" strokeWidth={2.5} />
                </button>
                <div>
                  <h2 className="font-extrabold text-slate-800 dark:text-slate-100 text-lg tracking-tight">Bill Items</h2>
                  <p className="text-xs font-medium text-slate-400 tracking-wide">{billState.items.length} items • <span className="text-slate-600 dark:text-slate-300">{billState.currency}{billState.subtotal.toFixed(2)}</span></p>
                </div>
            </div>
            {billStatus !== 'finalized' && (
                <button 
                    onClick={handleAddItem} 
                    className="px-4 py-2 text-indigo-600 dark:text-indigo-400 font-bold text-sm bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded-full transition-colors flex items-center gap-1.5 active:scale-95"
                >
                    <Plus size={18} strokeWidth={3} /> Add
                </button>
            )}
        </header>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-4 pb-40 no-scrollbar space-y-3">
            {billState.items.map(item => {
                const assignedCount = item.assignedTo.length;
                const isAssignedToActive = item.assignedTo.includes(activePersonId);
                const activePerson = billState.people.find(p => p.id === activePersonId);
                const activePersonColor = activePerson?.color || COLORS[0];

                return (
                    <div 
                        key={item.id}
                        onClick={() => {
                            if(billStatus !== 'finalized') toggleAssignment(item.id);
                        }}
                        className={`
                            relative rounded-2xl p-4 shadow-sm border-2 transition-all duration-200 cursor-pointer flex items-center justify-between group active:scale-[0.98] select-none
                            ${isAssignedToActive ? 'border-current' : 'border-transparent bg-white dark:bg-slate-900'}
                        `}
                        style={{ 
                            borderColor: isAssignedToActive ? activePersonColor : 'transparent',
                            backgroundColor: isAssignedToActive ? hexToRgba(activePersonColor, 0.1) : undefined
                        }}
                    >
                        <div className="flex-1 pr-2">
                            <div className="flex items-baseline justify-between mb-1.5">
                                <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-base leading-tight">{item.name}</h3>
                                <span className="font-bold text-slate-900 dark:text-white text-lg tracking-tight ml-3">{billState.currency}{item.price.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center gap-2 min-h-[24px]">
                                {assignedCount > 0 ? (
                                    <div className="flex -space-x-2 items-center">
                                        {item.assignedTo.map(personId => {
                                            const person = billState.people.find(p => p.id === personId);
                                            if (!person) return null;
                                            return (
                                                <div 
                                                    key={personId} 
                                                    className="w-6 h-6 rounded-full border border-white dark:border-slate-800 shadow-sm flex items-center justify-center text-[8px] font-bold text-white animate-pop-in"
                                                    style={{backgroundColor: person.color}}
                                                >
                                                    {person.name.substring(0,2).toUpperCase()}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1.5 text-slate-300 dark:text-slate-600 text-xs font-medium italic">
                                        <Plus size={12} /> Tap to assign
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        {billStatus !== 'finalized' && (
                           <button 
                            onClick={(e) => { e.stopPropagation(); setEditingItem(item); }}
                            className="p-2 text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400 transition-colors"
                           >
                               <Edit2 size={16} />
                           </button>
                        )}
                    </div>
                );
            })}
        </div>

        {/* Bottom Person Selector */}
        <div className="bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 pb-safe pt-2 z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
          {/* Person Scroll */}
          <div className="flex overflow-x-auto px-6 pt-4 pb-8 gap-6 no-scrollbar items-start snap-x">
            {billState.people.map(person => (
              <div key={person.id} className="snap-center">
                <Avatar 
                    name={person.name} 
                    color={person.color} 
                    selected={activePersonId === person.id}
                    onClick={() => setActivePersonId(person.id)}
                />
              </div>
            ))}
            
            {/* Link/Group Button (Added here) */}
             {billStatus !== 'finalized' && billState.people.length > 1 && (
                <div 
                    className="snap-center w-[72px] shrink-0 flex flex-col items-center justify-start group cursor-pointer" 
                    onClick={() => setIsCoverModalOpen(true)}
                >
                    <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-2 border-emerald-200 dark:border-emerald-800 flex items-center justify-center shadow-sm hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-all active:scale-95">
                        <Link size={24} strokeWidth={2.5} />
                    </div>
                    <span className="mt-4 text-xs font-bold text-emerald-600 dark:text-emerald-400 text-center w-full">Group</span>
                </div>
            )}

            {/* Add Button */}
            {billStatus !== 'finalized' && (
                <div 
                    className="snap-center w-[72px] shrink-0 flex flex-col items-center justify-start group cursor-pointer" 
                    onClick={() => setIsAddingPerson(true)}
                >
                    <div className="w-14 h-14 rounded-full bg-slate-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border-2 border-dashed border-indigo-300 dark:border-indigo-700 flex items-center justify-center shadow-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:border-indigo-500 dark:hover:border-indigo-500 transition-all active:scale-95">
                        <Plus size={24} strokeWidth={2.5} />
                    </div>
                    <span className="mt-4 text-xs font-bold text-indigo-600 dark:text-indigo-400 text-center w-full">Add New</span>
                </div>
            )}
          </div>
            
          {/* Floating Action Button Area */}
          <div className="px-6 pb-6 -mt-2">
            <button 
              onClick={() => {
                  saveBill(billStatus);
                  setView('summary');
              }}
              className="w-full bg-slate-900 dark:bg-slate-800 text-white py-4 rounded-2xl font-bold text-lg shadow-lg shadow-slate-200 dark:shadow-slate-900/50 flex items-center justify-center gap-2 hover:bg-slate-800 dark:hover:bg-slate-700 transition-all active:scale-[0.98]"
            >
              Review & Calculate Totals <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* Cover Settings Modal */}
        {isCoverModalOpen && (
             <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm px-4">
                 <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-pop-in border border-slate-100 dark:border-slate-800 max-h-[80vh] overflow-y-auto">
                     <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Link size={24} className="text-emerald-500"/> Group & Cover
                        </h3>
                        <button onClick={() => setIsCoverModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                             <Check size={24} />
                        </button>
                     </div>
                     
                     <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 font-medium">
                         Who is paying for whom? Set up couples, parents paying for kids, or split a birthday person's bill.
                     </p>

                     <div className="space-y-4">
                         {billState.people.map(person => {
                             const currentPayerId = billState.coverAssignments[person.id] || person.id;
                             
                             return (
                                 <div key={person.id} className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl">
                                     <div className="flex items-center gap-3 mb-3">
                                         <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{backgroundColor: person.color}}>
                                            {person.name.substring(0,2).toUpperCase()}
                                         </div>
                                         <span className="font-bold text-slate-900 dark:text-white">{person.name}'s bill paid by:</span>
                                     </div>
                                     
                                     <select
                                         value={currentPayerId}
                                         onChange={(e) => updateCoverAssignment(person.id, e.target.value)}
                                         className="w-full p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                                     >
                                         <option value={person.id}>Themselves</option>
                                         <option value="SPLIT_ALL">Everyone Else (Split/Gift)</option>
                                         {billState.people.filter(p => p.id !== person.id).map(payer => (
                                             <option key={payer.id} value={payer.id}>{payer.name}</option>
                                         ))}
                                     </select>
                                 </div>
                             );
                         })}
                     </div>
                     
                     <button 
                        onClick={() => setIsCoverModalOpen(false)}
                        className="w-full mt-6 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-colors"
                     >
                         Done
                     </button>
                 </div>
             </div>
        )}

        {/* Add Person Modal */}
        {isAddingPerson && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm px-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-xs shadow-2xl animate-pop-in border border-slate-100 dark:border-slate-800">
               <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Who's eating?</h3>
               <input 
                 autoFocus
                 type="text" 
                 value={newPersonName}
                 onChange={(e) => setNewPersonName(e.target.value)}
                 placeholder="Enter name (e.g. Sarah)"
                 className="w-full text-lg px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl mb-6 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white transition-all placeholder:text-slate-400"
                 onKeyDown={(e) => e.key === 'Enter' && addPerson()}
               />
               <div className="flex gap-3">
                 <button onClick={() => setIsAddingPerson(false)} className="flex-1 py-3 rounded-xl font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancel</button>
                 <button onClick={addPerson} className="flex-1 py-3 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none transition-all">Add Person</button>
               </div>
            </div>
          </div>
        )}

        {/* Edit Item Modal */}
        {editingItem && (
             <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm px-4">
             <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-pop-in border border-slate-100 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">Edit Item</h3>
                    <button onClick={() => handleDeleteItem(editingItem.id)} className="text-red-500 p-2 bg-red-50 dark:bg-red-900/20 rounded-full hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">
                        <Trash2 size={18} />
                    </button>
                </div>
                
                <div className="space-y-4">
                    {/* Name & Price Inputs */}
                    <div className="flex gap-4">
                      <div className="flex-1">
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Name</label>
                          <input 
                              type="text" 
                              value={editingItem.name}
                              onChange={(e) => setEditingItem({...editingItem, name: e.target.value})}
                              className="w-full px-3 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl mt-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white font-bold"
                          />
                      </div>
                      <div className="w-1/3">
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Price</label>
                          <div className="relative mt-1">
                             <span className="absolute left-3 top-3 text-slate-400 font-bold">{billState.currency}</span>
                             <input 
                                type="number" 
                                value={editingItem.price}
                                onChange={(e) => setEditingItem({...editingItem, price: parseFloat(e.target.value) || 0})}
                                className="w-full pl-7 pr-3 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white font-bold text-right"
                            />
                          </div>
                      </div>
                    </div>

                    {/* Split Details Section */}
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 mt-4">
                        <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                            <User size={14} /> Split Details
                        </h4>
                        
                        {editingItem.assignedTo.length === 0 ? (
                            <p className="text-center text-slate-400 text-sm italic py-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                                No one assigned to this item yet.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {editingItem.assignedTo.map(personId => {
                                    const person = billState.people.find(p => p.id === personId);
                                    if (!person) return null;
                                    
                                    const totalShares = editingItem.assignedTo.reduce((sum, id) => sum + (editingItem.shares?.[id] ?? 1), 0);
                                    const myShares = editingItem.shares?.[personId] ?? 1;
                                    const percentage = Math.round((myShares / totalShares) * 100);
                                    const cost = (myShares / totalShares) * editingItem.price;

                                    return (
                                        <div key={personId} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 p-3 rounded-xl">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{backgroundColor: person.color}}>
                                                    {person.name.substring(0,2).toUpperCase()}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-slate-900 dark:text-white leading-none">{person.name}</span>
                                                    <span className="text-[10px] text-slate-500 font-medium mt-1">{billState.currency}{cost.toFixed(2)} ({percentage}%)</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                                                <button 
                                                    onClick={() => updateItemShare(editingItem, personId, -1)}
                                                    className="p-2 text-slate-400 hover:text-indigo-500 transition-colors disabled:opacity-30"
                                                    disabled={myShares <= 1}
                                                >
                                                    <Minus size={14} strokeWidth={3} />
                                                </button>
                                                <span className="w-6 text-center text-xs font-bold text-slate-800 dark:text-white select-none">{myShares}</span>
                                                <button 
                                                    onClick={() => updateItemShare(editingItem, personId, 1)}
                                                    className="p-2 text-slate-400 hover:text-indigo-500 transition-colors"
                                                >
                                                    <Plus size={14} strokeWidth={3} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex gap-3 mt-8">
                  <button onClick={() => setEditingItem(null)} className="flex-1 py-3 rounded-xl font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancel</button>
                  <button onClick={() => handleSaveEdit(editingItem)} className="flex-1 py-3 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none transition-all">Save Changes</button>
                </div>
             </div>
           </div>
        )}
      </div>
    );
  }

  // 3. Summary Screen (Responsive)
  if (view === 'summary') {
    const isFinalized = billStatus === 'finalized';

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans flex flex-col transition-colors duration-300">
         <header className="bg-white dark:bg-slate-900 px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.5)] z-10 flex items-center gap-3 shrink-0 sticky top-0 border-b border-slate-100 dark:border-slate-800">
            <button onClick={() => setView('split')} className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors active:scale-90">
                <ArrowLeft size={22} className="text-slate-700 dark:text-slate-200" strokeWidth={2.5} />
            </button>
            <h2 className="font-extrabold text-slate-800 dark:text-slate-100 text-lg tracking-tight">Bill Summary</h2>
        </header>

        <div className="flex-1 p-4 pb-32 overflow-y-auto">
            <BillSummaryContent 
              billState={billState} 
              isFinalized={isFinalized} 
              onUpdateBillState={setBillState} 
            />
        </div>

        {/* Footer Action */}
        {!isFinalized && (
            <div className="bg-white dark:bg-slate-900 p-4 border-t border-slate-100 dark:border-slate-800 pb-safe sticky bottom-0 z-20">
                <div className="max-w-7xl mx-auto w-full">
                  <button 
                      onClick={handleFinalize}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-bold text-lg shadow-lg shadow-indigo-200 dark:shadow-none transition-all active:scale-[0.98]"
                  >
                      Finalize Bill
                  </button>
                </div>
            </div>
        )}
        {isFinalized && (
             <div className="bg-white dark:bg-slate-900 p-4 border-t border-slate-100 dark:border-slate-800 pb-safe sticky bottom-0 z-20">
                <div className="max-w-7xl mx-auto w-full">
                  <button 
                      onClick={handleBackToHome}
                      className="w-full bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white border-2 border-slate-100 dark:border-slate-700 py-4 rounded-2xl font-bold text-lg transition-all active:scale-[0.98]"
                  >
                      Start New Bill
                  </button>
                </div>
            </div>
        )}
      </div>
    );
  }

  return null;
}
