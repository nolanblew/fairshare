import React from 'react';

interface AvatarProps {
  name: string;
  color: string;
  selected?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export const Avatar: React.FC<AvatarProps> = ({ name, color, selected, onClick, size = 'md', showLabel = true }) => {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-14 h-14 text-lg', // Standard touch target size
    lg: 'w-16 h-16 text-xl',
  };

  // Explicit width container to prevent overlap in flex rows
  const containerWidth = size === 'md' ? 'w-[72px]' : 'w-auto';

  return (
    <div 
      onClick={onClick}
      className={`
        flex flex-col items-center justify-start cursor-pointer group select-none shrink-0
        ${containerWidth}
        ${onClick ? 'active:opacity-80' : ''}
      `}
    >
      <div className="relative flex justify-center items-center h-16 w-full">
          <div 
            className={`
              ${sizeClasses[size]} rounded-full flex items-center justify-center shadow-sm transition-all duration-300 cubic-bezier(0.34, 1.56, 0.64, 1)
              ${selected ? 'scale-110 ring-4 ring-offset-2 dark:ring-offset-slate-900 z-10 shadow-md' : 'scale-100 group-hover:scale-105'}
              text-white font-black tracking-tight
            `}
            style={{ backgroundColor: color, '--tw-ring-color': color } as React.CSSProperties}
          >
            {name.substring(0, 2).toUpperCase()}
          </div>

          {selected && (
            <div className="absolute -top-1 -right-1 w-6 h-6 bg-slate-900 dark:bg-slate-100 rounded-full border-[2px] border-white dark:border-slate-800 flex items-center justify-center animate-pop-in z-20 shadow-sm">
               <svg className="stroke-white dark:stroke-slate-900" width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                 <polyline points="20 6 9 17 4 12"></polyline>
               </svg>
            </div>
          )}
      </div>
      
      {showLabel && (
        <span className={`
            mt-2 text-center truncate w-full px-1 transition-all duration-200
            ${size === 'sm' ? 'text-[10px]' : 'text-xs'}
            ${selected ? 'font-extrabold text-slate-900 dark:text-white translate-y-0.5' : 'font-semibold text-slate-500 dark:text-slate-400'}
        `}>
          {name}
        </span>
      )}
    </div>
  );
};