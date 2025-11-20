import React from 'react';

interface InventoryProps {
  items: string[];
  onItemSelect: (item: string) => void;
  selectedItem: string | null;
}

export const Inventory: React.FC<InventoryProps> = ({ items, onItemSelect, selectedItem }) => {
  return (
    <div className="bg-gray-900 p-2 h-full overflow-y-auto scrollbar-thin">
      <h3 className="text-gray-500 text-sm mb-2 text-center uppercase tracking-widest border-b border-gray-700 pb-1">Inventory</h3>
      <div className="flex flex-wrap gap-4 justify-center">
        {items.length === 0 && (
          <div className="text-gray-600 italic text-xs mt-4">Empty pockets</div>
        )}
        {items.map((item, idx) => (
          <button
            key={`${item}-${idx}`}
            onClick={() => onItemSelect(item)}
            className={`text-sm uppercase font-bold px-2 py-1
              ${selectedItem === item 
                ? 'text-yellow-400' 
                : 'text-purple-400 hover:text-purple-200'
              }
            `}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
};