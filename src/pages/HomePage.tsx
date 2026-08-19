/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Camera, Sparkles, HelpCircle, FileText, Wrench, Zap } from 'lucide-react';
import { DocumentItem } from '../types';
import { getDocuments, deleteDocument, duplicateDocument, renameDocument } from '../services/documentStore';
import { generatePDF } from '../services/pdfGenerator';
import SearchBar from '../components/home/SearchBar';
import DocumentCard from '../components/home/DocumentCard';
import EmptyState from '../components/home/EmptyState';
import ToolsTab from '../components/home/ToolsTab';

interface HomePageProps {
  onStartNewScan: () => void;
  onStartQuickScan: () => void;
  onEditDocument: (doc: DocumentItem) => void;
}

export default function HomePage({ onStartNewScan, onStartQuickScan, onEditDocument }: HomePageProps) {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [activeTab, setActiveTab] = useState<'documents' | 'tools'>('documents');

  // Cargar documentos al montar
  useEffect(() => {
    setDocuments(getDocuments());
  }, []);

  const refreshList = () => {
    setDocuments(getDocuments());
  };

  const handleDelete = (id: string) => {
    deleteDocument(id);
    refreshList();
  };

  const handleDuplicate = (id: string) => {
    duplicateDocument(id);
    refreshList();
  };

  const handleRename = (id: string, newName: string) => {
    renameDocument(id, newName);
    refreshList();
  };

  const handleExportPDF = async (doc: DocumentItem) => {
    try {
      await generatePDF(doc.name, doc.pages);
    } catch (e) {
      alert('Error al generar PDF: ' + e);
    }
  };

  // Filtrar documentos según búsqueda
  const filteredDocs = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-[#09364D] text-white overflow-hidden relative">
      {/* Header */}
      <header className="p-5 bg-[#1C1C1E] border-b border-[#2C2C2E] flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#2979FF] flex items-center justify-center text-white shadow-md shadow-[#2979FF]/20">
            {activeTab === 'documents' ? (
              <Camera size={18} strokeWidth={2.5} />
            ) : (
              <Wrench size={18} strokeWidth={2.5} />
            )}
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white leading-tight">
              {activeTab === 'documents' ? 'Escáner Pro' : 'Herramientas'}
            </h1>
            <p className="text-[10px] text-gray-500 font-medium">Procesamiento Local Offline</p>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <button
            id="help-btn"
            onClick={() => setShowHelp(!showHelp)}
            className="p-2 text-gray-400 hover:text-white rounded-xl hover:bg-[#2C2C2E] transition-colors"
            title="Ayuda"
          >
            <HelpCircle size={18} />
          </button>
        </div>
      </header>

      {/* Panel de ayuda desplegable */}
      {showHelp && (
        <div className="bg-[#1C1C1E] border-b border-[#2C2C2E] p-4 text-xs text-gray-300 z-10 shrink-0 animate-fade-in flex flex-col gap-2">
          <h4 className="font-bold text-white text-sm">💡 ¿Cómo funciona Escáner Pro?</h4>
          <p>
            1. Presiona el botón flotante de <strong>Cámara</strong> para capturar fotos de documentos.
          </p>
          <p>
            2. Aplica filtros avanzados de limpieza como <strong>B y N Nítido</strong> (binarización adaptativa para quitar sombras) o <strong>Color Pro</strong>.
          </p>
          <p>
            3. Recorta manualmente, ajusta el brillo, añade anotaciones de texto, rota y reordena tus páginas.
          </p>
          <p>
            4. Exporta tu trabajo final como un <strong>PDF multipágina</strong> o imágenes JPG/PNG de alta definición 100% en tu navegador.
          </p>
        </div>
      )}

      {/* Contenido Principal */}
      <main className="flex-1 overflow-y-auto p-5 pb-24">
        {activeTab === 'documents' ? (
          <>
            {/* Barra de búsqueda */}
            {documents.length > 0 && (
              <div className="mb-6">
                <SearchBar value={searchQuery} onChange={setSearchQuery} />
              </div>
            )}

            {/* Listado o Empty State */}
            {filteredDocs.length === 0 ? (
              searchQuery ? (
                <div className="text-center py-16 text-gray-400">
                  <p className="text-sm">No se encontraron documentos con "{searchQuery}"</p>
                </div>
              ) : (
                <EmptyState onScanClick={onStartNewScan} />
              )
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4 px-1 shrink-0">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Documentos Recientes ({filteredDocs.length})
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  {filteredDocs.map((doc) => (
                    <DocumentCard
                      key={doc.id}
                      document={doc}
                      onSelect={onEditDocument}
                      onDelete={handleDelete}
                      onRename={handleRename}
                      onDuplicate={handleDuplicate}
                      onExport={handleExportPDF}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <ToolsTab onStartNewScan={onStartNewScan} />
        )}
      </main>

      {/* Barra de Navegación Inferior */}
      <div className="absolute bottom-0 left-0 right-0 h-[68px] bg-[#1C1C1E] border-t border-[#2C2C2E] px-8 flex items-center justify-around z-20 shadow-lg">
        <button
          onClick={() => setActiveTab('documents')}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === 'documents' ? 'text-[#2979FF]' : 'text-gray-400 hover:text-white'
          }`}
        >
          <FileText size={20} className="transition-transform duration-300" />
          <span className="text-[10px] font-semibold tracking-wide">Documentos</span>
        </button>

        <button
          onClick={() => setActiveTab('tools')}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === 'tools' ? 'text-[#2979FF]' : 'text-gray-400 hover:text-white'
          }`}
        >
          <Wrench size={20} className="transition-transform duration-300" />
          <span className="text-[10px] font-semibold tracking-wide">Herramientas</span>
        </button>
      </div>

      {/* Botón Flotante de Acción (FAB) - Solo visible en pestaña de Documentos */}
      {activeTab === 'documents' && (
        <div className="absolute bottom-20 right-4 flex flex-col items-end gap-2.5 z-20">
          {/* Botón secundario: Escaneo Rápido */}
          <button
            id="fab-quickscan-btn"
            onClick={onStartQuickScan}
            className="flex items-center gap-2 pl-3 pr-4 h-10 bg-[#1C1C1E] hover:bg-[#2C2C2E] border border-[#3C3C3E] text-white rounded-full shadow-lg shadow-black/30 hover:scale-105 active:scale-95 transition-all"
            title="Escaneo Rápido con detección automática"
          >
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#7C5CFC] to-[#5B8DEF] flex items-center justify-center">
              <Zap size={11} className="text-white" />
            </div>
            <span className="text-xs font-bold text-gray-200">Escaneo Rápido</span>
          </button>

          {/* FAB principal: Escanear nuevo */}
          <button
            id="fab-scan-btn"
            onClick={onStartNewScan}
            className="w-14 h-14 bg-[#2979FF] hover:bg-[#2979FF]/90 text-white rounded-full flex items-center justify-center shadow-xl shadow-[#2979FF]/30 hover:scale-105 active:scale-95 transition-all"
            title="Escanear nuevo documento"
          >
            <Camera size={24} />
          </button>
        </div>
      )}
    </div>
  );
}
