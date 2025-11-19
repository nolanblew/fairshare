import React, { useState, useRef, useEffect } from 'react';
import { ReceiptItem, Person, BillState } from './types';
import { parseReceiptImage } from './services/geminiService';
import { Camera, Upload, Plus, ArrowLeft, Check, Trash2, Edit2, DollarSign, User, ChevronRight, ChevronDown, ChevronUp } from './components/Icons';
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

// --- Helper Functions ---
const hexToRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// --- Helper Component for Summary ---
const PersonSummaryCard: React.FC<{
  person: Person;
  billState: BillState;
  totals: { subtotal: number; tax: number; tip: number; total: number };
}> = ({ person, billState, totals }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const items = billState.items.filter(i => i.assignedTo.includes(person.id));

  if (totals.total === 0) return null;

  return (
    <div className="bg-white rounded-2xl shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] border border-slate-100 overflow-hidden transition-all duration-300 hover:shadow-md">
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50/50 transition-colors select-none"
      >
        <Avatar name={person.name} color={person.color} size="sm" showLabel={false} />
        <span className="font-bold text-slate-800 tracking-tight text-lg">{person.name}</span>
        
        <div className="ml-auto flex items-center gap-3">
          <span className="font-black text-xl text-slate-900 tracking-tight">${totals.total.toFixed(2)}</span>
          <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
             <ChevronDown size={20} className="text-slate-400" />
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="px-5 pb-5 animate-fadeIn">
          <div className="pt-4 border-t border-slate-100/80 space-y-2 text-xs font-medium text-slate-500 mb-5">
             <div className="flex justify-between">
                  <span>Subtotal ({items.length} items)</span>
                  <span className="text-slate-700">${totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                  <span>Tax</span>
                  <span className="text-slate-700">${totals.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                  <span>Tip</span>
                  <span className="text-slate-700">${totals.tip.toFixed(2)}</span>
              </div>
          </div>

          <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-3">Itemized Breakdown</p>
              <div className="space-y-3">
                {items.map(item => {
                    const splitCount = item.assignedTo.length;
                    const myShare = item.price / splitCount;
                    return (
                      <div key={item.id} className="flex justify-between items-start text-sm">
                          <span className="text-slate-700 font-medium leading-tight max-w-[70%]">{item.name}</span>
                          <div className="flex flex-col items-end">
                              <span className="text-slate-900 font-bold tracking-tight">${myShare.toFixed(2)}</span>
                              {splitCount > 1 && (
                                <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full mt-0.5">
                                  Split 1/{splitCount}
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

// --- Main App Component ---
export default function App() {
  // --- State ---
  const [step, setStep] = useState<'upload' | 'split' | 'summary'>('upload');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [billState, setBillState] = useState<BillState>({
    items: [],
    subtotal: 0,
    tax: 0,
    tipAmount: 0,
    tipPercentage: 15,
    tipType: 'percent',
    people: DEFAULT_PEOPLE,
    tipFromReceipt: false,
  });

  const [activePersonId, setActivePersonId] = useState<string>(DEFAULT_PEOPLE[0].id);
  const [editingItem, setEditingItem] = useState<ReceiptItem | null>(null);
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  
  // File Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          }));

          const subtotal = newItems.reduce((acc, item) => acc + item.price, 0);

          setBillState(prev => ({
            ...prev,
            items: newItems,
            subtotal: subtotal,
            tax: parsedData.tax,
            tipAmount: parsedData.tip || 0,
            tipType: parsedData.tip ? 'amount' : 'percent',
            tipFromReceipt: !!parsedData.tip,
            tipPercentage: parsedData.tip ? 0 : 15
          }));
          
          setStep('split');
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
    };
    setBillState(prev => ({ ...prev, items: [...prev.items, newItem] }));
    setEditingItem(newItem);
  };

  const handleSaveEdit = (item: ReceiptItem) => {
    setBillState(prev => ({
      ...prev,
      items: prev.items.map(i => i.id === item.id ? item : i),
      subtotal: prev.items.map(i => i.id === item.id ? item : i).reduce((sum, i) => sum + i.price, 0)
    }));
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
    setBillState(prev => {
      const items = prev.items.map(item => {
        if (item.id !== itemId) return item;
        
        const isAssigned = item.assignedTo.includes(activePersonId);
        let newAssignedTo;
        
        if (isAssigned) {
          newAssignedTo = item.assignedTo.filter(id => id !== activePersonId);
        } else {
          newAssignedTo = [...item.assignedTo, activePersonId];
        }
        
        return { ...item, assignedTo: newAssignedTo };
      });
      return { ...prev, items };
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

  // --- Helpers for Calculations ---
  const calculateTotals = () => {
    const { subtotal, tax, tipAmount, tipPercentage, tipType } = billState;
    
    const finalTip = tipType === 'percent' ? subtotal * (tipPercentage / 100) : tipAmount;
    const grandTotal = subtotal + tax + finalTip;

    return { finalTip, grandTotal };
  };

  const getPersonTotals = (personId: string) => {
    const { items, subtotal, tax, tipAmount, tipPercentage, tipType } = billState;
    
    // Calculate share of items
    let myItemTotal = 0;
    items.forEach(item => {
      if (item.assignedTo.includes(personId)) {
        myItemTotal += item.price / item.assignedTo.length;
      }
    });

    // Pro-rated tax and tip
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

  // --- Views ---

  if (isLoading) return <LoadingOverlay message="Analyzing Receipt..." />;

  // 1. Upload Screen
  if (step === 'upload') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col relative overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center z-10">
            <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-3xl shadow-2xl shadow-indigo-200 flex items-center justify-center mb-10 transform -rotate-6 hover:rotate-0 transition-transform duration-500">
                <DollarSign className="text-white" size={48} />
            </div>
            <h1 className="text-5xl font-black text-slate-900 mb-4 tracking-tighter">FairShare</h1>
            <p className="text-slate-500 text-lg font-medium max-w-xs mb-12 leading-relaxed">
              Snap a receipt, assign items to friends, and split the bill in seconds.
            </p>

            <div className="space-y-4 w-full max-w-xs">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-bold text-lg shadow-lg shadow-indigo-200 flex items-center justify-center gap-3 transition-all active:scale-95 active:shadow-none"
                >
                  <Camera size={24} strokeWidth={2.5} />
                  Scan Receipt
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  accept="image/*" 
                  capture="environment"
                  className="hidden" 
                  onChange={handleFileUpload}
                />
                
                <button 
                  onClick={() => {
                      // Demo Mode Setup
                      setBillState(prev => ({
                        ...prev,
                        items: [
                           {id: '1', name: 'Double Cheeseburger', price: 15.50, assignedTo: []},
                           {id: '2', name: 'Truffle Fries', price: 8.50, assignedTo: []},
                           {id: '3', name: 'Cola', price: 3.50, assignedTo: []},
                           {id: '4', name: 'Margherita Pizza', price: 22.00, assignedTo: []},
                           {id: '5', name: 'Caesar Salad', price: 12.00, assignedTo: []},
                        ],
                        subtotal: 61.50,
                        tax: 5.25,
                        tipAmount: 0,
                        tipFromReceipt: false
                      }));
                      setStep('split');
                  }}
                  className="w-full bg-white hover:bg-slate-50 text-slate-600 py-4 rounded-2xl font-bold shadow-sm border border-slate-200 flex items-center justify-center gap-3 transition-all active:scale-95"
                >
                   <Edit2 size={20} strokeWidth={2.5} />
                   Manual Entry / Demo
                </button>
            </div>
            {error && <p className="mt-8 text-red-500 bg-red-50 border border-red-100 px-6 py-3 rounded-xl text-sm font-medium animate-fadeIn shadow-sm">{error}</p>}
        </div>
        
        {/* Background decoration */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-purple-300 rounded-full blur-3xl opacity-20 animate-pulse"></div>
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-300 rounded-full blur-3xl opacity-20 animate-pulse" style={{animationDelay: '2s'}}></div>
      </div>
    );
  }

  // 2. Split Screen
  if (step === 'split') {
    return (
      <div className="h-screen flex flex-col bg-slate-50 font-sans">
        {/* Header */}
        <header className="bg-white px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] z-10 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2">
                <button onClick={() => setStep('upload')} className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition-colors active:scale-90">
                    <ArrowLeft size={22} className="text-slate-700" strokeWidth={2.5} />
                </button>
                <div>
                  <h2 className="font-extrabold text-slate-800 text-lg tracking-tight">Bill Items</h2>
                  <p className="text-xs font-medium text-slate-400 tracking-wide">{billState.items.length} items • <span className="text-slate-600">${billState.subtotal.toFixed(2)}</span></p>
                </div>
            </div>
            <button 
                onClick={handleAddItem} 
                className="px-4 py-2 text-indigo-600 font-bold text-sm bg-indigo-50 hover:bg-indigo-100 rounded-full transition-colors flex items-center gap-1.5 active:scale-95"
            >
                <Plus size={18} strokeWidth={3} /> Add
            </button>
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
                        onClick={() => toggleAssignment(item.id)}
                        className={`
                            relative rounded-2xl p-4 shadow-sm border-2 transition-all duration-200 cursor-pointer flex items-center justify-between group active:scale-[0.98] select-none
                            ${isAssignedToActive ? 'border-current' : 'border-transparent bg-white'}
                        `}
                        style={{ 
                            borderColor: isAssignedToActive ? activePersonColor : 'transparent',
                            backgroundColor: isAssignedToActive ? hexToRgba(activePersonColor, 0.05) : 'white'
                        }}
                    >
                        <div className="flex-1 pr-2">
                            <div className="flex items-baseline justify-between mb-1.5">
                                <h3 className="font-semibold text-slate-800 text-base leading-tight">{item.name}</h3>
                                <span className="font-bold text-slate-900 text-lg tracking-tight ml-3">${item.price.toFixed(2)}</span>
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
                                                    className="w-6 h-6 rounded-full border-2 border-white text-[10px] flex items-center justify-center text-white font-black animate-pop-in shadow-sm z-10" 
                                                    style={{backgroundColor: person.color}}
                                                >
                                                    {person.name[0]}
                                                </div>
                                            );
                                        })}
                                        {assignedCount > 0 && (
                                            <span className="ml-3 text-xs font-medium text-slate-400 transition-opacity duration-300 bg-slate-50 px-1.5 py-0.5 rounded-md">
                                                ${ (item.price / assignedCount).toFixed(2) } each
                                            </span>
                                        )}
                                    </div>
                                ) : (
                                    <span className="text-xs font-medium text-slate-300 italic flex items-center gap-1">
                                        <Plus size={12} /> Tap to assign
                                    </span>
                                )}
                            </div>
                        </div>
                        <button 
                           onClick={(e) => {
                               e.stopPropagation();
                               setEditingItem(item);
                           }}
                           className="ml-2 p-2 text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-full transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                            <Edit2 size={18} />
                        </button>
                        
                        {/* Checkmark flash for active assignment */}
                        {isAssignedToActive && (
                            <div className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full animate-pop-in shadow-sm border border-white" style={{backgroundColor: activePersonColor}}></div>
                        )}
                    </div>
                );
            })}
             <div className="h-12"></div> {/* Spacer */}
        </div>

        {/* People Selector (Sticky Bottom) */}
        <div className="bg-white/90 backdrop-blur-xl border-t border-slate-200 shadow-[0_-8px_30px_rgba(0,0,0,0.04)] z-20 shrink-0 pb-safe">
           {/* Increased top/bottom padding to allow scaling without clipping */}
           <div className="flex items-start px-6 overflow-x-auto no-scrollbar gap-2 mb-2 pt-6 pb-4">
               {billState.people.map(person => (
                   <Avatar 
                        key={person.id} 
                        name={person.name} 
                        color={person.color} 
                        selected={activePersonId === person.id}
                        onClick={() => setActivePersonId(person.id)}
                   />
               ))}
               
               {/* Add Person Button */}
               <div className="flex flex-col items-center justify-start min-w-[72px]">
                   {isAddingPerson ? (
                       <div className="flex flex-col items-center animate-fadeIn w-full pt-1">
                           <input 
                             autoFocus
                             className="w-full h-9 text-sm border-2 border-indigo-100 rounded-lg px-2 text-center focus:outline-none focus:border-indigo-500 font-semibold text-slate-700 bg-white shadow-sm"
                             placeholder="Name"
                             value={newPersonName}
                             onChange={e => setNewPersonName(e.target.value)}
                             onKeyDown={e => e.key === 'Enter' && addPerson()}
                             onBlur={addPerson}
                           />
                       </div>
                   ) : (
                       <button 
                        onClick={() => setIsAddingPerson(true)}
                        className="w-12 h-12 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-600 hover:bg-indigo-50 transition-all group"
                       >
                           <Plus size={24} className="group-hover:scale-110 transition-transform" />
                       </button>
                   )}
                   {!isAddingPerson && <span className="mt-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Add</span>}
               </div>
           </div>

           <div className="px-6 pb-6">
                <button 
                    onClick={() => setStep('summary')}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-lg py-4 rounded-2xl shadow-xl shadow-slate-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                    Review & Totals
                    <ChevronRight size={22} strokeWidth={3} />
                </button>
           </div>
        </div>

        {/* Edit Item Modal */}
        {editingItem && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fadeIn">
                <div className="bg-white rounded-3xl w-full max-w-xs p-8 shadow-2xl transform transition-all">
                    <h3 className="text-xl font-black text-slate-900 mb-6 tracking-tight">Edit Item</h3>
                    <div className="space-y-5">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Item Name</label>
                            <input 
                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 font-semibold text-slate-800 focus:bg-white focus:border-indigo-500 outline-none transition-colors"
                                value={editingItem.name}
                                onChange={e => setEditingItem({...editingItem, name: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Price</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                                <input 
                                    type="number"
                                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 pl-8 font-bold text-slate-900 focus:bg-white focus:border-indigo-500 outline-none transition-colors"
                                    value={editingItem.price}
                                    onChange={e => setEditingItem({...editingItem, price: parseFloat(e.target.value) || 0})}
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 pt-4">
                            <button 
                                onClick={() => handleDeleteItem(editingItem.id)}
                                className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 py-3 rounded-xl font-bold transition-colors"
                            >
                                Delete
                            </button>
                            <button 
                                onClick={() => handleSaveEdit(editingItem)}
                                className="flex-1 bg-indigo-600 text-white hover:bg-indigo-700 py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 transition-colors"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
      </div>
    );
  }

  // 3. Summary Screen
  if (step === 'summary') {
    const { finalTip, grandTotal } = calculateTotals();

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
         <header className="bg-white px-4 py-4 shadow-sm z-10 flex items-center gap-3 sticky top-0 shrink-0">
            <button onClick={() => setStep('split')} className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition-colors active:scale-90">
                <ArrowLeft size={22} className="text-slate-700" strokeWidth={2.5} />
            </button>
            <h2 className="font-extrabold text-slate-800 text-xl tracking-tight">Total Breakdown</h2>
         </header>

         <div className="p-5 space-y-6 max-w-md mx-auto w-full animate-fadeIn pb-safe">
             {/* Global Adjustment Card */}
             <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-5">
                <div className="flex justify-between items-center text-sm font-medium text-slate-600">
                    <span>Subtotal</span>
                    <span className="text-slate-800 font-bold text-base">${billState.subtotal.toFixed(2)}</span>
                </div>
                
                {/* Tax Input */}
                <div className="flex justify-between items-center">
                    <label className="text-sm font-medium text-slate-600">Tax</label>
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all w-28">
                        <span className="text-slate-400 text-sm font-bold">$</span>
                        <input 
                            type="number" 
                            className="bg-transparent w-full text-right font-bold text-slate-800 outline-none"
                            value={billState.tax}
                            onChange={e => setBillState(prev => ({...prev, tax: parseFloat(e.target.value) || 0}))}
                        />
                    </div>
                </div>

                {/* Tip Section */}
                <div>
                    <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2">
                          <label className="text-sm font-medium text-slate-600">Tip</label>
                          {billState.tipFromReceipt && (
                            <span className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold uppercase tracking-wide">
                              From Receipt
                            </span>
                          )}
                        </div>
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                            <button 
                                onClick={() => setBillState(p => ({...p, tipType: 'percent', tipFromReceipt: false}))}
                                className={`px-3 py-1 text-xs rounded-md font-bold transition-all ${billState.tipType === 'percent' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
                            >
                                %
                            </button>
                            <button 
                                onClick={() => setBillState(p => ({...p, tipType: 'amount'}))}
                                className={`px-3 py-1 text-xs rounded-md font-bold transition-all ${billState.tipType === 'amount' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
                            >
                                $
                            </button>
                        </div>
                    </div>
                    
                    {billState.tipType === 'percent' ? (
                         <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                             <div className="flex justify-between text-indigo-600 font-black text-lg items-center">
                                 <span>{billState.tipPercentage}%</span>
                                 <span className="text-base font-bold">${(billState.subtotal * (billState.tipPercentage/100)).toFixed(2)}</span>
                             </div>
                             <input 
                                type="range" 
                                min="0" max="50" step="1"
                                value={billState.tipPercentage}
                                onChange={e => setBillState(p => ({...p, tipPercentage: parseInt(e.target.value)}))}
                                className="w-full h-2 bg-indigo-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                             />
                             <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                                 <span>0%</span>
                                 <span>15%</span>
                                 <span>20%</span>
                                 <span>30%</span>
                                 <span>50%</span>
                             </div>
                         </div>
                    ) : (
                        <div className="flex items-center justify-end gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
                            <span className="text-slate-400 text-sm font-bold">$</span>
                            <input 
                                type="number" 
                                className="bg-transparent w-full text-right font-bold text-slate-800 outline-none"
                                value={billState.tipAmount}
                                onChange={e => setBillState(p => ({...p, tipAmount: parseFloat(e.target.value) || 0}))}
                            />
                        </div>
                    )}
                </div>

                <div className="border-t-2 border-dashed border-slate-100 pt-5 flex justify-between items-end">
                    <span className="font-bold text-slate-800 text-lg">Total</span>
                    <span className="font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600 text-4xl tracking-tighter">
                        ${grandTotal.toFixed(2)}
                    </span>
                </div>
             </div>

             <h3 className="font-bold text-slate-400 uppercase tracking-widest text-xs ml-2 mb-2">Individual Shares</h3>

             {/* People Cards */}
             <div className="space-y-4 pb-10">
                {billState.people.map(person => (
                  <PersonSummaryCard 
                    key={person.id}
                    person={person}
                    billState={billState}
                    totals={getPersonTotals(person.id)}
                  />
                ))}
             </div>
         </div>
      </div>
    );
  }

  return null;
}