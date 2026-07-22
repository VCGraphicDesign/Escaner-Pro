/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Eye, Zap, Sparkles, Droplet, Moon } from 'lucide-react';

interface FilterCarouselProps {
  selectedFilter: 'original' | 'auto' | 'bw' | 'grayscale' | 'enhanced' | 'restore';
  onChange: (filter: 'original' | 'auto' | 'bw' | 'grayscale' | 'enhanced' | 'restore') => void;
}

interface FilterItem {
  id: 'original' | 'auto' | 'bw' | 'grayscale' | 'enhanced' | 'restore';
  name: string;
  description: string;
  icon: React.ReactNode;
}

export default function FilterCarousel({ selectedFilter, onChange }: FilterCarouselProps) {
  const filters: FilterItem[] = [
    {
      id: 'restore',
      name: 'Sin Arrugas ni Hoyos',
      description: 'Limpia pliegues y perforaciones',
      icon: <Sparkles size={18} />,
    },
    {
      id: 'original',
      name: 'Original',
      description: 'Sin filtros',
      icon: <Eye size={18} />,
    },
    {
      id: 'auto',
      name: 'Auto-Mejora',
      description: 'Corrección inteligente',
      icon: <Sparkles size={18} />,
    },
    {
      id: 'bw',
      name: 'B y N Nítido',
      description: 'Binarizado adaptativo',
      icon: <Moon size={18} />,
    },
    {
      id: 'grayscale',
      name: 'Gris Papel',
      description: 'Escala de grises',
      icon: <Zap size={18} />,
    },
    {
      id: 'enhanced',
      name: 'Color Pro',
      description: 'Mejora vibrante',
      icon: <Droplet size={18} />,
    },
  ];

  return (
    <div className="flex flex-col gap-2.5 w-full">
      <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-1">
        Filtros de Procesamiento
      </span>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
        {filters.map((filter) => {
          const isActive = selectedFilter === filter.id;
          return (
            <button
              id={`filter-btn-${filter.id}`}
              key={filter.id}
              onClick={() => onChange(filter.id)}
              className={`flex flex-col items-start p-3 rounded-2xl min-w-[125px] flex-shrink-0 border transition-all text-left ${
                isActive
                  ? 'bg-[#2979FF]/10 border-[#2979FF] text-[#2979FF]'
                  : 'bg-[#1C1C1E] border-[#2C2C2E] text-gray-300 hover:border-gray-700'
              }`}
            >
              <div className={`p-2 rounded-xl mb-2.5 ${isActive ? 'bg-[#2979FF] text-white' : 'bg-[#2C2C2E] text-gray-400'}`}>
                {filter.icon}
              </div>
              <span className="text-xs font-bold leading-none mb-1">{filter.name}</span>
              <span className="text-[9px] text-gray-500 leading-tight line-clamp-1">{filter.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
