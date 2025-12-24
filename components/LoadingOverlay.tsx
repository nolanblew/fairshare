import React from 'react';
import { Receipt } from './Icons';

interface LoadingOverlayProps {
  message: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message }) => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/90 dark:bg-black/90 backdrop-blur-sm">
      <div className="relative">
        <div className="w-20 h-20 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin"></div>
        <div className="absolute inset-0 flex items-center justify-center">
            <Receipt className="text-indigo-500 animate-pulse" size={32} />
        </div>
      </div>
      <p className="mt-6 text-white text-lg font-medium animate-pulse">{message}</p>
    </div>
  );
};