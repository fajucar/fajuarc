import React from 'react';

interface TabProps {
  id: string;
  label: string;
  isActive: boolean;
  onClick: (id: string) => void;
}

export const Tab: React.FC<TabProps> = ({ label, isActive, onClick, id }) => (
  <button
    onClick={() => onClick(id)}
    className={`
      relative px-6 py-3 text-sm font-medium transition-all duration-300 outline-none select-none rounded-lg mr-2
      ${isActive 
        ? 'text-cyan-700 bg-cyan-50' 
        : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'}
    `}
  >
    {label}
    {isActive && (
      <div className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full" />
    )}
  </button>
);

interface TabsContainerProps {
  children: React.ReactNode;
}

export const TabsContainer: React.FC<TabsContainerProps> = ({ children }) => (
  <div className="flex items-center p-1 bg-slate-200/50 backdrop-blur-sm rounded-xl w-fit mb-8 mx-auto md:mx-0">
    {children}
  </div>
);





