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
    md: 'w-12 h-12 text-sm',
    lg: 'w-16 h-16 text-base',
  };

  return (
    <div 
      onClick={onClick}
      className={`
        flex flex-col items-center justify-center cursor-pointer group select-none
        ${onClick ? 'active:opacity-80' : ''}
        ${size === 'md' ? 'min-w-[72px]' : ''} /* Ensure fixed width for stability in lists */
      `}
    >
      <div className="relative flex justify-center">
          {/* The circle wrapper handles the scaling so it doesn't affect layout flow of the text below */}
          <div 
            className={`
              ${sizeClasses[size]} rounded-full flex items-center justify-center shadow-sm transition-all duration-300 cubic-bezier(0.34, 1.56, 0.64, 1)
              ${selected ? 'scale-125 ring-4 ring-offset-2 z-10 shadow-md' : 'scale-100 group-hover:scale-105'}
              text-white font-black tracking-tight
            `}
            style={{ backgroundColor: color, '--tw-ring-color': color } as React.CSSProperties}
          >
            {name.substring(0, 2).toUpperCase()}
          </div>

          {selected && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-slate-900 rounded-full border-[2px] border-white flex items-center justify-center animate-pop-in z-20 shadow-sm">
               <span className="text-[10px] text-white font-bold">✓</span>
            </div>
          )}
      </div>
      
      {showLabel && (
        <span className={`
            mt-3 text-center truncate max-w-[80px] transition-all duration-200
            ${size === 'sm' ? 'text-[10px]' : 'text-xs'}
            ${selected ? 'font-bold text-slate-900 translate-y-0' : 'font-medium text-slate-500'}
        `}>
          {name}
        </span>
      )}
    </div>
  );
};