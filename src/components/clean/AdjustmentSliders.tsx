/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Sun, Contrast, ShieldAlert } from 'lucide-react';

interface AdjustmentSlidersProps {
  brightness: number;
  contrast: number;
  sharpness: number;
  onBrightnessChange: (val: number) => void;
  onContrastChange: (val: number) => void;
  onSharpnessChange: (val: number) => void;
}

export default function AdjustmentSliders({
  brightness,
  contrast,
  sharpness,
  onBrightnessChange,
  onContrastChange,
  onSharpnessChange,
}: AdjustmentSlidersProps) {
  return (
    <div className="flex flex-col gap-4 bg-[#1C1C1E] border border-[#2C2C2E] p-4 rounded-2xl w-full">
      <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
        Ajustes Finos Manuales
      </span>

      {/* Slider de Brillo */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-xs text-gray-300 font-medium">
          <span className="flex items-center gap-1.5">
            <Sun size={14} className="text-amber-400" />
            Brillo
          </span>
          <span className="text-gray-500 text-[11px]">{brightness}%</span>
        </div>
        <input
          id="brightness-slider"
          type="range"
          min="50"
          max="150"
          value={brightness}
          onChange={(e) => onBrightnessChange(Number(e.target.value))}
          className="w-full accent-[#2979FF] h-1.5 bg-[#2C2C2E] rounded-lg appearance-none cursor-pointer"
        />
      </div>

      {/* Slider de Contraste */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-xs text-gray-300 font-medium">
          <span className="flex items-center gap-1.5">
            <Contrast size={14} className="text-[#2979FF]" />
            Contraste
          </span>
          <span className="text-gray-500 text-[11px]">{contrast}%</span>
        </div>
        <input
          id="contrast-slider"
          type="range"
          min="50"
          max="150"
          value={contrast}
          onChange={(e) => onContrastChange(Number(e.target.value))}
          className="w-full accent-[#2979FF] h-1.5 bg-[#2C2C2E] rounded-lg appearance-none cursor-pointer"
        />
      </div>

      {/* Slider de Nitidez */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-xs text-gray-300 font-medium">
          <span className="flex items-center gap-1.5">
            <ShieldAlert size={14} className="text-emerald-400" />
            Nitidez (Enfoque)
          </span>
          <span className="text-gray-500 text-[11px]">{sharpness}%</span>
        </div>
        <input
          id="sharpness-slider"
          type="range"
          min="0"
          max="100"
          value={sharpness}
          onChange={(e) => onSharpnessChange(Number(e.target.value))}
          className="w-full accent-[#2979FF] h-1.5 bg-[#2C2C2E] rounded-lg appearance-none cursor-pointer"
        />
      </div>
    </div>
  );
}
