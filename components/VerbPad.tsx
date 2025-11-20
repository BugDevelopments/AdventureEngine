import React from 'react';
import { Verb } from '../types';

interface VerbPadProps {
  onVerbSelect: (verb: Verb) => void;
  selectedVerb: Verb | null;
}

const verbs = Object.values(Verb);

export const VerbPad: React.FC<VerbPadProps> = ({ onVerbSelect, selectedVerb }) => {
  return (
    <div className="grid grid-cols-3 gap-2 p-2 bg-gray-900 border-r-4 border-gray-700 h-full">
      {verbs.map((verb) => (
        <button
          key={verb}
          onClick={() => onVerbSelect(verb)}
          className={`text-left font-bold text-lg uppercase px-2 py-1 transition-colors duration-100
            ${selectedVerb === verb 
              ? 'text-yellow-400 bg-blue-900' 
              : 'text-green-500 hover:text-green-300'
            }
          `}
        >
          {verb}
        </button>
      ))}
    </div>
  );
};
