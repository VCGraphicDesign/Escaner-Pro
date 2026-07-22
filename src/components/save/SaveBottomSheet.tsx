/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Download, CheckCircle } from 'lucide-react';

interface SaveBottomSheetProps {
  defaultName: string;
  onClose: () => void;
  onSave: (name: string, format: 'pdf') => void;
}

export default function SaveBottomSheet({ defaultName, onClose, onSave }: SaveBottomSheetProps) {
  const [fileName, setFileName] = useState(defaultName);
  const [isSaved, setIsSaved] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileName.trim()) return;

    onSave(fileName.trim(), 'pdf');
    setIsSaved(true);
    setTimeout(() => {
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end justify-center z-50 animate-fade-in">
      {/* Click outside backdrop to close */}
      <div className="absolute inset-0 cursor-default" onClick={onClose}></div>

      {/* Sheet Content */}
      <div className="relative bg-[#1C1C1E] border-t border-[#2C2C2E] w-full max-w-md rounded-t-3xl p-6 shadow-2xl z-10 animate-slide-up">
        {/* Drag handle decoration */}
        <div className="w-12 h-1.5 bg-gray-700 rounded-full mx-auto mb-5"></div>

        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white tracking-tight">Guardar Documento</h3>
          <button
            id="close-save-sheet-btn"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-[#2C2C2E] rounded-full transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {isSaved ? (
          <div className="flex flex-col items-center justify-center py-8 text-center animate-bounce-in">
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mb-4">
              <CheckCircle size={36} />
            </div>
            <h4 className="text-base font-bold text-white mb-1">¡Guardado Exitosamente!</h4>
            <p className="text-xs text-gray-400 max-w-xs">
              Tu archivo se ha generado y descargado localmente de forma segura.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {/* Input de Nombre */}
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                Nombre del archivo
              </label>
              <input
                id="save-filename-input"
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="Nombre del documento"
                required
                className="w-full px-4 py-3 bg-[#2C2C2E] border border-[#3C3C3E] rounded-xl text-white text-sm focus:outline-none focus:border-[#2979FF]"
              />
            </div>

            {/* Guardar/Descargar */}
            <button
              id="submit-save-btn"
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#2979FF] hover:bg-[#2979FF]/90 text-white font-bold rounded-xl shadow-lg shadow-[#2979FF]/20 transition-all active:scale-[0.98] mt-2"
            >
              <Download size={18} />
              Exportar y Descargar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
