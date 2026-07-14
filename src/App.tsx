/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { DocumentItem, ScannedPage } from './types';
import HomePage from './pages/HomePage';
import CameraView from './components/scan/CameraView';
import CleanPage from './pages/CleanPage';
import EditPage from './pages/EditPage';
import { saveDocument } from './services/documentStore';

type ViewState = 'home' | 'scan' | 'clean' | 'edit';

export default function App() {
  const [view, setView] = useState<ViewState>('home');
  const [selectedDocument, setSelectedDocument] = useState<DocumentItem | null>(null);
  const [capturedPages, setCapturedPages] = useState<ScannedPage[]>([]);

  // 1. Iniciar un nuevo escaneo desde Home
  const handleStartNewScan = () => {
    setSelectedDocument(null);
    setCapturedPages([]);
    setView('scan');
  };

  // 2. Al capturar páginas en la cámara, pasar a limpieza
  const handlePagesCaptured = (pages: ScannedPage[]) => {
    setCapturedPages(pages);
    setView('clean');
  };

  // 3. Al terminar de procesar y filtrar en CleanPage
  const handleFinishCleaning = (cleanedPages: ScannedPage[]) => {
    if (selectedDocument) {
      // Caso 1: Estábamos editando un documento existente y re-procesamos las páginas
      const updatedDoc: DocumentItem = {
        ...selectedDocument,
        pages: cleanedPages,
      };
      saveDocument(updatedDoc);
      setSelectedDocument(updatedDoc);
      setView('edit');
    } else {
      // Caso 2: Es un documento completamente nuevo
      const documentCount = localStorage.getItem('escaner_pro_documents_count') || '1';
      const count = parseInt(documentCount, 10);
      localStorage.setItem('escaner_pro_documents_count', (count + 1).toString());

      const newDoc: DocumentItem = {
        id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: `Escaneo Documento ${count}`,
        createdAt: new Date().toISOString(),
        pages: cleanedPages,
      };

      saveDocument(newDoc);
      setSelectedDocument(newDoc);
      setView('edit');
    }
  };

  // 4. Seleccionar un documento existente para editar desde Home
  const handleEditDocument = (doc: DocumentItem) => {
    setSelectedDocument(doc);
    setView('edit');
  };

  // 5. Ir desde el Editor de vuelta a la Limpieza para re-ajustar
  const handleNavigateToCleanFromEdit = (pagesToClean: ScannedPage[]) => {
    setCapturedPages(pagesToClean);
    setView('clean');
  };

  return (
    <div className="w-full h-screen bg-[#0F0F0F] text-white flex justify-center items-center">
      {/* Contenedor tipo pantalla de teléfono inteligente para una sensación móvil premium */}
      <div className="w-full h-full max-w-md bg-[#0F0F0F] flex flex-col relative border border-[#1C1C1E] shadow-2xl overflow-hidden">
        
        {view === 'home' && (
          <HomePage
            onStartNewScan={handleStartNewScan}
            onEditDocument={handleEditDocument}
          />
        )}

        {view === 'scan' && (
          <CameraView
            onBack={() => setView('home')}
            onPagesCaptured={handlePagesCaptured}
          />
        )}

        {view === 'clean' && (
          <CleanPage
            capturedPages={capturedPages}
            onBack={() => setView(selectedDocument ? 'edit' : 'scan')}
            onFinishCleaning={handleFinishCleaning}
          />
        )}

        {view === 'edit' && selectedDocument && (
          <EditPage
            document={selectedDocument}
            onBack={() => {
              setSelectedDocument(null);
              setView('home');
            }}
            onNavigateToClean={handleNavigateToCleanFromEdit}
          />
        )}
      </div>
    </div>
  );
}
