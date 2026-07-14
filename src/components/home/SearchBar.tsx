/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (val: string) => void;
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="relative w-full">
      <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-400">
        <Search size={18} />
      </div>
      <input
        id="document-search-input"
        type="text"
        placeholder="Buscar documentos..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-11 pr-10 py-3 bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#2979FF]/60 transition-colors"
      />
      {value && (
        <button
          id="clear-search-btn"
          onClick={() => onChange('')}
          className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-white"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
