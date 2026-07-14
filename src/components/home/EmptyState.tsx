/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { FileScan, Camera } from 'lucide-react';

interface EmptyStateProps {
  onScanClick: () => void;
}

export default function EmptyState({ onScanClick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-[#2979FF]/10 blur-xl rounded-full w-24 h-24 -translate-x-2 -translate-y-2"></div>
        <div className="relative flex items-center justify-center w-20 h-20 bg-[#1C1C1E] border border-[#2C2C2E] rounded-3xl text-[#2979FF]">
          <FileScan size={42} strokeWidth={1.5} />
        </div>
      </div>
      
      <h3 className="text-xl font-semibold text-white mb-2 tracking-tight">
        Sin documentos escaneados
      </h3>
      <p className="text-gray-400 text-sm max-w-sm mb-8 leading-relaxed">
        Presiona el botón de cámara para escanear tu primera receta, apunte, o boleta en calidad profesional.
      </p>

      <button
        id="empty-state-scan-btn"
        onClick={onScanClick}
        className="flex items-center gap-2 px-6 py-3 bg-[#2979FF] hover:bg-[#2979FF]/90 text-white font-medium rounded-full shadow-lg shadow-[#2979FF]/20 transition-all active:scale-95"
      >
        <Camera size={18} />
        Escanear ahora
      </button>
    </div>
  );
}
