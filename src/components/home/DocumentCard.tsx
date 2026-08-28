/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, Calendar, FileText, Trash2, Edit2, Copy, Download, AlertTriangle } from 'lucide-react';
import { DocumentItem } from '../../types';

interface DocumentCardProps {
  key?: any;
  document: DocumentItem;
  onSelect: (doc: DocumentItem) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (doc: DocumentItem) => void | Promise<void>;
}

export default function DocumentCard({
  document: doc,
  onSelect,
  onRename,
  onDuplicate,
  onDelete,
  onExport,
}: DocumentCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState(doc.name);
  const menuRef = useRef<HTMLDivElement>(null);

  // Cerrar menú si se hace clic afuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showMenu) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const handleSaveRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed) {
      onRename(doc.id, trimmed);
    }
    setShowRenameModal(false);
  };

  const formattedDate = new Date(doc.createdAt).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const pageCount = doc.pages.length;
  const thumbnail = pageCount > 0 ? doc.pages[0].processedImage : '';

  return (
    <div className="relative group bg-[#1C1C1E] border border-[#2C2C2E] hover:border-[#2979FF]/40 rounded-2xl overflow-hidden transition-all duration-300 shadow-md flex flex-col h-full">
      {/* Miniatura / Contenedor de Imagen */}
      <div
        id={`select-doc-${doc.id}`}
        onClick={() => onSelect(doc)}
        className="aspect-[3/4] w-full bg-[#151517] relative cursor-pointer overflow-hidden flex items-center justify-center p-2 group"
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={doc.name}
            className="h-full w-full object-contain rounded-lg shadow-sm group-hover:scale-[1.02] transition-transform duration-300"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-gray-600">
            <FileText size={48} strokeWidth={1} />
            <span className="text-xs mt-2">Sin páginas</span>
          </div>
        )}
        
        {/* Overlay sutil en hover */}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="bg-black/60 backdrop-blur-md text-white text-xs px-3 py-1.5 rounded-full font-medium">
            Abrir Editor
          </span>
        </div>

        {/* Contador de páginas */}
        <div className="absolute bottom-3 left-3 bg-[#0F0F0F]/80 backdrop-blur-md text-white text-[11px] font-medium px-2 py-1 rounded-md flex items-center gap-1 border border-white/5">
          <FileText size={12} className="text-[#2979FF]" />
          {pageCount} {pageCount === 1 ? 'pág' : 'págs'}
        </div>
      </div>

      {/* Información */}
      <div className="p-4 flex flex-col justify-between flex-grow">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0 flex-grow cursor-pointer" onClick={() => onSelect(doc)}>
            <h4 className="text-sm font-medium text-white truncate hover:text-[#2979FF] transition-colors" title={doc.name}>
              {doc.name}
            </h4>
            <div className="flex items-center gap-1.5 text-gray-500 text-[11px] mt-1.5">
              <Calendar size={12} />
              <span>{formattedDate}</span>
            </div>
          </div>

          {/* Menú de Tres Puntos */}
          <div className="relative" ref={menuRef}>
            <button
              id={`doc-menu-btn-${doc.id}`}
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-[#2C2C2E] transition-colors"
            >
              <MoreVertical size={16} />
            </button>

            {/* Dropdown del Menú */}
            {showMenu && (
              <div className="absolute right-0 bottom-full mb-1 w-44 bg-[#2C2C2E] border border-[#3C3C3E] rounded-xl shadow-xl py-1.5 z-30 animate-fade-in">
                <button
                  id={`action-rename-${doc.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    setRenameValue(doc.name);
                    setShowRenameModal(true);
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs text-gray-200 hover:bg-[#1C1C1E] hover:text-white flex items-center gap-2 cursor-pointer"
                >
                  <Edit2 size={13} className="text-gray-400" />
                  Renombrar
                </button>
                
                <button
                  id={`action-duplicate-${doc.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onDuplicate(doc.id);
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs text-gray-200 hover:bg-[#1C1C1E] hover:text-white flex items-center gap-2"
                >
                  <Copy size={13} className="text-gray-400" />
                  Duplicar
                </button>

                <button
                  id={`action-export-${doc.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onExport(doc);
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs text-gray-200 hover:bg-[#1C1C1E] hover:text-white flex items-center gap-2"
                >
                  <Download size={13} className="text-[#2979FF]" />
                  Descargar PDF
                </button>

                <div className="h-[1px] bg-white/5 my-1"></div>

                <button
                  id={`action-delete-${doc.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    setShowDeleteConfirm(true);
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 size={13} />
                  Eliminar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Confirmación de Eliminación */}
      {showDeleteConfirm && (
        <div
          id={`delete-modal-${doc.id}`}
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
        >
          <div
            className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-5 max-w-xs w-full shadow-2xl flex flex-col gap-4 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-11 h-11 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto">
              <Trash2 size={20} />
            </div>

            <div>
              <h3 className="text-sm font-bold text-white mb-1.5">¿Eliminar documento?</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                ¿Estás seguro de que quieres eliminar <span className="text-white font-medium">"{doc.name}"</span>? Esta acción no se puede deshacer.
              </p>
            </div>

            <div className="flex gap-2.5 mt-1">
              <button
                id={`btn-cancel-delete-${doc.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(false);
                }}
                className="flex-1 px-3 py-2 bg-[#2C2C2E] hover:bg-[#3C3C3E] text-gray-300 hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                id={`btn-confirm-delete-${doc.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(false);
                  onDelete(doc.id);
                }}
                className="flex-1 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-semibold shadow-lg shadow-red-500/20 transition-all active:scale-95 cursor-pointer"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Renombrar Documento */}
      {showRenameModal && (
        <div
          id={`rename-modal-${doc.id}`}
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
        >
          <div
            className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-5 max-w-xs w-full shadow-2xl flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-sm font-bold text-white mb-1">Renombrar documento</h3>
              <p className="text-xs text-gray-400">Ingresa el nuevo nombre para este documento:</p>
            </div>

            <input
              id={`input-rename-${doc.id}`}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveRename();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setShowRenameModal(false);
                }
              }}
              autoFocus
              className="w-full bg-[#2C2C2E] border border-[#3C3C3E] focus:border-[#2979FF] focus:outline-none rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 transition-colors"
              placeholder="Nombre del documento"
            />

            <div className="flex gap-2.5">
              <button
                id={`btn-cancel-rename-${doc.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowRenameModal(false);
                }}
                className="flex-1 px-3 py-2 bg-[#2C2C2E] hover:bg-[#3C3C3E] text-gray-300 hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                id={`btn-confirm-rename-${doc.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSaveRename();
                }}
                disabled={!renameValue.trim()}
                className="flex-1 px-3 py-2 bg-[#2979FF] hover:bg-[#1E6BE6] disabled:opacity-40 disabled:hover:bg-[#2979FF] text-white rounded-xl text-xs font-semibold shadow-lg shadow-[#2979FF]/20 transition-all active:scale-95 cursor-pointer"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
