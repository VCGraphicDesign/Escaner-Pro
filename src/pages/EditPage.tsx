/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Save,
  RotateCw,
  Trash2,
  ChevronUp,
  ChevronDown,
  Plus,
  Type,
  FileImage,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Undo,
  Redo,
  Sparkles,
} from 'lucide-react';
import { DocumentItem, ScannedPage, Annotation } from '../types';
import { saveDocument } from '../services/documentStore';
import { generatePDF } from '../services/pdfGenerator';
import { loadImage } from '../services/imageProcessor';
import SaveBottomSheet from '../components/save/SaveBottomSheet';

interface EditPageProps {
  document: DocumentItem;
  onBack: () => void;
  onNavigateToClean: (pages: ScannedPage[]) => void;
}

type TabType = 'pages' | 'annotate' | 'image' | 'filter';

export default function EditPage({ document: initialDoc, onBack, onNavigateToClean }: EditPageProps) {
  const [doc, setDoc] = useState<DocumentItem>(initialDoc);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<TabType>('pages');
  const [showSaveSheet, setShowSaveSheet] = useState(false);
  const [textToInput, setTextToInput] = useState('');
  const [textColor, setTextColor] = useState('#FF0000');
  const [textSize, setTextSize] = useState(18);

  // Historial para deshacer/rehacer (máximo 20 estados)
  const [history, setHistory] = useState<DocumentItem[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);

  // Inicializar historial
  useEffect(() => {
    setDoc(initialDoc);
    setHistory([initialDoc]);
    setHistoryIndex(0);
  }, [initialDoc]);

  // Agregar estado al historial
  const pushState = (newDoc: DocumentItem) => {
    const updatedHistory = history.slice(0, historyIndex + 1);
    const nextHistory = [...updatedHistory, newDoc];
    
    // Limitar historial a 20 pasos
    if (nextHistory.length > 20) {
      nextHistory.shift();
    }
    
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
    setDoc(newDoc);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setDoc(history[prevIndex]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      setDoc(history[nextIdx]);
    }
  };

  const currentPage = doc.pages[currentIndex];

  // ----------------------------------------------------
  // Acciones de Pestaña: Páginas
  // ----------------------------------------------------
  const handleRotateCurrent = () => {
    if (!currentPage) return;
    const nextRotation = (currentPage.adjustments.rotation + 90) % 360;
    
    // Al rotar, reconstruimos la imagen procesada
    updatePageAdjustments(currentIndex, { rotation: nextRotation });
  };

  const handleDeleteCurrent = () => {
    if (doc.pages.length <= 1) {
      alert('Un documento debe tener al menos una página.');
      return;
    }
    if (confirm('¿Quieres eliminar esta página del documento?')) {
      const nextPages = doc.pages.filter((_, idx) => idx !== currentIndex);
      const nextDoc = { ...doc, pages: nextPages };
      setCurrentIndex(Math.max(0, currentIndex - 1));
      pushState(nextDoc);
    }
  };

  const handleMoveUp = () => {
    if (currentIndex === 0) return;
    const nextPages = [...doc.pages];
    const temp = nextPages[currentIndex];
    nextPages[currentIndex] = nextPages[currentIndex - 1];
    nextPages[currentIndex - 1] = temp;
    const nextDoc = { ...doc, pages: nextPages };
    setCurrentIndex(currentIndex - 1);
    pushState(nextDoc);
  };

  const handleMoveDown = () => {
    if (currentIndex === doc.pages.length - 1) return;
    const nextPages = [...doc.pages];
    const temp = nextPages[currentIndex];
    nextPages[currentIndex] = nextPages[currentIndex + 1];
    nextPages[currentIndex + 1] = temp;
    const nextDoc = { ...doc, pages: nextPages };
    setCurrentIndex(currentIndex + 1);
    pushState(nextDoc);
  };

  const handleAddPageFromGallery = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        const base64 = event.target.result as string;
        const newPage: ScannedPage = {
          id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          originalImage: base64,
          processedImage: base64,
          adjustments: {
            brightness: 100,
            contrast: 100,
            sharpness: 0,
            filter: 'original',
            rotation: 0,
            crop: null,
            annotations: [],
          },
        };

        const nextPages = [...doc.pages];
        nextPages.splice(currentIndex + 1, 0, newPage);
        const nextDoc = { ...doc, pages: nextPages };
        setCurrentIndex(currentIndex + 1);
        pushState(nextDoc);
      }
    };
    reader.readAsDataURL(file);
  };

  // ----------------------------------------------------
  // Acciones de Pestaña: Anotar (Texto Drag & Drop)
  // ----------------------------------------------------
  const handleAddAnnotation = () => {
    if (!textToInput.trim() || !currentPage) return;

    const newAnnot: Annotation = {
      id: `annot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      text: textToInput.trim(),
      x: 30, // Centrado por defecto
      y: 35,
      color: textColor,
      fontSize: textSize,
    };

    const nextPages = [...doc.pages];
    const nextAnnots = [...currentPage.adjustments.annotations, newAnnot];
    
    nextPages[currentIndex] = {
      ...currentPage,
      adjustments: {
        ...currentPage.adjustments,
        annotations: nextAnnots,
      },
    };

    const nextDoc = { ...doc, pages: nextPages };
    pushState(nextDoc);
    setTextToInput('');
  };

  const handleUpdateAnnotationPosition = (annotId: string, clientX: number, clientY: number) => {
    if (!pageContainerRef.current || !currentPage) return;

    const rect = pageContainerRef.current.getBoundingClientRect();
    
    // Calcular posiciones relativas en porcentaje 0-100
    const x = Math.min(90, Math.max(5, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.min(90, Math.max(5, ((clientY - rect.top) / rect.height) * 100));

    const nextPages = [...doc.pages];
    const nextAnnots = currentPage.adjustments.annotations.map((annot) => {
      if (annot.id === annotId) {
        return { ...annot, x, y };
      }
      return annot;
    });

    nextPages[currentIndex] = {
      ...currentPage,
      adjustments: {
        ...currentPage.adjustments,
        annotations: nextAnnots,
      },
    };

    const nextDoc = { ...doc, pages: nextPages };
    // No usamos pushState completo para evitar saturar el historial durante el arrastre,
    // actualizamos sólo el estado actual. Al soltar se consolida en el historial.
    setDoc(nextDoc);
  };

  const handleRemoveAnnotation = (annotId: string) => {
    if (!currentPage) return;
    const nextAnnots = currentPage.adjustments.annotations.filter((a) => a.id !== annotId);
    
    const nextPages = [...doc.pages];
    nextPages[currentIndex] = {
      ...currentPage,
      adjustments: {
        ...currentPage.adjustments,
        annotations: nextAnnots,
      },
    };
    pushState({ ...doc, pages: nextPages });
  };

  // ----------------------------------------------------
  // Utilidades generales
  // ----------------------------------------------------
  const updatePageAdjustments = (index: number, changes: Partial<ScannedPage['adjustments']>) => {
    const nextPages = [...doc.pages];
    const target = nextPages[index];
    if (target) {
      nextPages[index] = {
        ...target,
        adjustments: {
          ...target.adjustments,
          ...changes,
        },
      };
      const nextDoc = { ...doc, pages: nextPages };
      pushState(nextDoc);
    }
  };

  // Guardar documento localmente y descargar
  const handleSaveDocument = async (name: string, format: 'pdf') => {
    // 1. Quemar/dibujar las anotaciones de texto en la imagen antes de exportar
    const finalPages = await Promise.all(
      doc.pages.map(async (page) => {
        if (page.adjustments.annotations.length === 0) return page;

        // Cargar imagen en un canvas para dibujar el texto encima
        const img = await loadImage(page.processedImage);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return page;

        // Dibujar imagen
        ctx.drawImage(img, 0, 0);

        // Dibujar cada anotación
        page.adjustments.annotations.forEach((annot) => {
          const fontSizeInCanvas = Math.round((annot.fontSize / 100) * canvas.width);
          ctx.font = `bold ${fontSizeInCanvas}px "Courier New", monospace`;
          ctx.fillStyle = annot.color;
          
          // Calcular la posición exacta basada en porcentajes
          const xPos = (annot.x / 100) * canvas.width;
          const yPos = (annot.y / 100) * canvas.height;

          // Dibujar fondo sutil para legibilidad de anotación
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          const textWidth = ctx.measureText(annot.text).width;
          ctx.fillRect(xPos - 5, yPos - fontSizeInCanvas, textWidth + 10, fontSizeInCanvas + 8);

          ctx.fillStyle = annot.color;
          ctx.fillText(annot.text, xPos, yPos);
        });

        return {
          ...page,
          processedImage: canvas.toDataURL('image/jpeg', 0.9),
        };
      })
    );

    // Actualizar documento final
    const docWithBurnedLayers = {
      ...doc,
      name,
      pages: finalPages,
    };

    // Almacenar en base de datos local
    saveDocument(docWithBurnedLayers);

    // 2. Exportar / Descargar como PDF
    await generatePDF(name, finalPages);
  };

  return (
    <div className="flex flex-col h-full bg-[#09364D] text-white overflow-hidden">
      {/* Header */}
      <header className="px-4 py-4 bg-[#1C1C1E] border-b border-[#2C2C2E] flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            id="btn-edit-back"
            onClick={onBack}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-[#2C2C2E] rounded-xl transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-sm font-bold truncate max-w-[150px]" title={doc.name}>
              {doc.name}
            </h2>
            <p className="text-[10px] text-gray-500 font-medium">Editor de Páginas</p>
          </div>
        </div>

        {/* Historial y Guardar */}
        <div className="flex items-center gap-2">
          {/* Deshacer */}
          <button
            id="undo-btn"
            disabled={historyIndex <= 0}
            onClick={handleUndo}
            className="p-1.5 bg-[#2C2C2E]/60 text-gray-300 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent rounded-lg transition-colors border border-white/5"
            title="Deshacer"
          >
            <Undo size={14} />
          </button>
          {/* Rehacer */}
          <button
            id="redo-btn"
            disabled={historyIndex >= history.length - 1}
            onClick={handleRedo}
            className="p-1.5 bg-[#2C2C2E]/60 text-gray-300 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent rounded-lg transition-colors border border-white/5"
            title="Rehacer"
          >
            <Redo size={14} />
          </button>

          <button
            id="btn-open-save-dialog"
            onClick={() => setShowSaveSheet(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#2979FF] hover:bg-[#2979FF]/90 text-white rounded-xl text-xs font-bold shadow-md shadow-[#2979FF]/25 active:scale-95 transition-all ml-1"
          >
            <Save size={14} />
            Guardar
          </button>
        </div>
      </header>

      {/* Área Central: Visualizador de Página con anotaciones encima */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center">
        {currentPage ? (
          <div className="flex flex-col items-center w-full max-w-sm">
            {/* Navegación interna */}
            <div className="flex items-center justify-between w-full mb-3 px-1 text-xs text-gray-400 font-semibold">
              <button
                id="edit-prev-page"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((idx) => idx - 1)}
                className="flex items-center gap-1 hover:text-white disabled:opacity-30"
              >
                <ChevronLeft size={14} />
                Anterior
              </button>
              <span>
                Página {currentIndex + 1} de {doc.pages.length}
              </span>
              <button
                id="edit-next-page"
                disabled={currentIndex === doc.pages.length - 1}
                onClick={() => setCurrentIndex((idx) => idx + 1)}
                className="flex items-center gap-1 hover:text-white disabled:opacity-30"
              >
                Siguiente
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Contenedor del lienzo de página */}
            <div
              ref={pageContainerRef}
              className="relative w-full aspect-[3/4] bg-neutral-900 border border-[#2C2C2E] rounded-2xl p-1 shadow-xl flex items-center justify-center select-none overflow-hidden"
            >
              <img
                src={currentPage.processedImage}
                alt={`Página ${currentIndex + 1}`}
                className="max-w-full max-h-full object-contain rounded-xl pointer-events-none"
                referrerPolicy="no-referrer"
              />

              {/* Capa de Anotaciones de Texto Interactivas */}
              {currentPage.adjustments.annotations?.map((annot) => {
                let isDragging = false;
                const onPointerDown = (e: React.PointerEvent) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  isDragging = true;
                };

                const onPointerMove = (e: React.PointerEvent) => {
                  if (isDragging) {
                    handleUpdateAnnotationPosition(annot.id, e.clientX, e.clientY);
                  }
                };

                const onPointerUp = (e: React.PointerEvent) => {
                  isDragging = false;
                  (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                  // Guardar el estado consolidado al terminar el arrastre
                  pushState(doc);
                };

                return (
                  <div
                    id={`annotation-${annot.id}`}
                    key={annot.id}
                    style={{
                      left: `${annot.x}%`,
                      top: `${annot.y}%`,
                      color: annot.color,
                      fontSize: `${annot.fontSize}px`,
                    }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    className="absolute cursor-move font-bold whitespace-nowrap px-2 py-1 rounded bg-white/80 border border-neutral-300 shadow-md flex items-center gap-1.5 touch-none group select-none"
                  >
                    <span>{annot.text}</span>
                    <button
                      id={`delete-annot-${annot.id}`}
                      onPointerDown={(e) => e.stopPropagation()} // Evitar arrastrar al hacer clic en eliminar
                      onClick={() => handleRemoveAnnotation(annot.id)}
                      className="text-red-500 hover:text-red-700 font-bold p-0.5 hover:bg-red-50 rounded"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-20 text-gray-500">No hay páginas capturadas</div>
        )}
      </div>

      {/* Controles de la Pestaña Activa en la barra inferior */}
      <div className="bg-[#1C1C1E] border-t border-[#2C2C2E] p-4 shrink-0">
        {/* Contenido Dinámico de la Pestaña */}
        {activeTab === 'pages' && (
          <div className="flex flex-col gap-4 animate-fade-in">
            <div className="flex items-center justify-between text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              <span>Organizar Páginas</span>
              <span className="text-[#2979FF]">Pág {currentIndex + 1} de {doc.pages.length}</span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {/* Girar */}
              <button
                id="btn-edit-rotate"
                onClick={handleRotateCurrent}
                className="flex flex-col items-center justify-center p-3 bg-[#2C2C2E] hover:bg-[#3C3C3E] rounded-xl text-gray-200 transition-colors gap-1.5"
              >
                <RotateCw size={16} className="text-[#2979FF]" />
                <span className="text-[10px] font-bold">Girar</span>
              </button>

              {/* Subir Orden */}
              <button
                id="btn-edit-move-up"
                disabled={currentIndex === 0}
                onClick={handleMoveUp}
                className="flex flex-col items-center justify-center p-3 bg-[#2C2C2E] hover:bg-[#3C3C3E] disabled:opacity-40 disabled:hover:bg-[#2C2C2E] rounded-xl text-gray-200 transition-colors gap-1.5"
              >
                <ChevronUp size={16} className="text-[#2979FF]" />
                <span className="text-[10px] font-bold">Subir</span>
              </button>

              {/* Bajar Orden */}
              <button
                id="btn-edit-move-down"
                disabled={currentIndex === doc.pages.length - 1}
                onClick={handleMoveDown}
                className="flex flex-col items-center justify-center p-3 bg-[#2C2C2E] hover:bg-[#3C3C3E] disabled:opacity-40 disabled:hover:bg-[#2C2C2E] rounded-xl text-gray-200 transition-colors gap-1.5"
              >
                <ChevronDown size={16} className="text-[#2979FF]" />
                <span className="text-[10px] font-bold">Bajar</span>
              </button>

              {/* Eliminar Página */}
              <button
                id="btn-edit-delete"
                onClick={handleDeleteCurrent}
                className="flex flex-col items-center justify-center p-3 bg-red-500/10 hover:bg-red-500/20 rounded-xl text-red-400 transition-colors gap-1.5"
              >
                <Trash2 size={16} />
                <span className="text-[10px] font-bold text-red-300">Eliminar</span>
              </button>
            </div>

            {/* Añadir Página */}
            <button
              id="btn-add-page"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#2C2C2E] hover:bg-[#3C3C3E] border border-white/5 text-gray-200 rounded-xl text-xs font-bold transition-all"
            >
              <Plus size={14} className="text-[#2979FF]" />
              Insertar Página desde Archivo
            </button>
          </div>
        )}

        {activeTab === 'annotate' && (
          <div className="flex flex-col gap-3.5 animate-fade-in">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
              Añadir Anotaciones de Texto (Arrastrables)
            </span>

            <div className="flex gap-2">
              <input
                id="annotation-text-input"
                type="text"
                placeholder="Escribe texto de anotación..."
                value={textToInput}
                onChange={(e) => setTextToInput(e.target.value)}
                className="flex-1 px-3.5 py-2.5 bg-[#2C2C2E] border border-[#3C3C3E] rounded-xl text-xs text-white focus:outline-none focus:border-[#2979FF]"
              />
              <button
                id="add-annotation-btn"
                onClick={handleAddAnnotation}
                disabled={!textToInput.trim()}
                className="px-4 bg-[#2979FF] hover:bg-[#2979FF]/90 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <Plus size={14} />
                Añadir
              </button>
            </div>

            {/* Selector de color y tamaño */}
            <div className="flex items-center justify-between bg-[#2C2C2E]/50 px-3.5 py-2 rounded-xl">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Color:</span>
                <div className="flex gap-1.5">
                  {['#FF0000', '#000000', '#0000FF', '#00FF00', '#FF8F00'].map((color) => (
                    <button
                      id={`color-btn-${color.replace('#', '')}`}
                      key={color}
                      type="button"
                      onClick={() => setTextColor(color)}
                      style={{ backgroundColor: color }}
                      className={`w-5 h-5 rounded-full border ${textColor === color ? 'border-white scale-110 shadow-md' : 'border-black/20'}`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Tamaño:</span>
                <input
                  id="font-size-slider"
                  type="range"
                  min="12"
                  max="32"
                  value={textSize}
                  onChange={(e) => setTextSize(Number(e.target.value))}
                  className="w-16 accent-[#2979FF]"
                />
                <span className="text-[10px] text-gray-300 font-bold w-4 text-right">{textSize}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'image' && (
          <div className="flex flex-col gap-3 animate-fade-in">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
              Insertar firma o imagen externa
            </span>
            <p className="text-[11px] text-gray-400">
              Puedes subir una imagen transparente PNG o JPG de tu firma escaneada o un sello para colocarlo en tus documentos.
            </p>
            <button
              id="add-signature-btn"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#2979FF]/10 hover:bg-[#2979FF]/20 border border-[#2979FF]/30 text-[#2979FF] rounded-xl text-xs font-bold transition-all"
            >
              <FileImage size={14} />
              Cargar Firma / Imagen
            </button>
          </div>
        )}

        {activeTab === 'filter' && (
          <div className="flex flex-col gap-3 animate-fade-in text-center py-2">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block text-left mb-1">
              Recorte y Filtros Avanzados
            </span>
            <p className="text-[11px] text-gray-400 text-left mb-2">
              ¿Deseas volver a encuadrar o cambiar el filtro original de esta página? Salta directo a la pantalla de limpieza.
            </p>
            <button
              id="btn-edit-clean-shortcut"
              onClick={() => onNavigateToClean(doc.pages)}
              className="flex items-center justify-center gap-1.5 py-3 bg-[#1C1C1E] hover:bg-[#2C2C2E] border border-[#3C3C3E] text-white rounded-xl text-xs font-bold transition-all"
            >
              <Sliders size={14} className="text-[#2979FF]" />
              Ajustar Recorte, Brillo o Filtros
            </button>
          </div>
        )}

        {/* Input de archivo oculto */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAddPageFromGallery}
          className="hidden"
        />

        {/* Barra de Tabs inferiores */}
        <div className="flex border-t border-white/5 mt-4 pt-3.5 justify-around">
          {/* Tab: Páginas */}
          <button
            id="tab-btn-pages"
            onClick={() => setActiveTab('pages')}
            className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-all ${
              activeTab === 'pages' ? 'text-[#2979FF]' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Sliders size={16} />
            Páginas
          </button>

          {/* Tab: Anotar */}
          <button
            id="tab-btn-annotate"
            onClick={() => setActiveTab('annotate')}
            className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-all ${
              activeTab === 'annotate' ? 'text-[#2979FF]' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Type size={16} />
            Anotar
          </button>

          {/* Tab: Imagen */}
          <button
            id="tab-btn-image"
            onClick={() => setActiveTab('image')}
            className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-all ${
              activeTab === 'image' ? 'text-[#2979FF]' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <FileImage size={16} />
            Imagen/Firma
          </button>

          {/* Tab: Ajustar */}
          <button
            id="tab-btn-filter"
            onClick={() => setActiveTab('filter')}
            className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-all ${
              activeTab === 'filter' ? 'text-[#2979FF]' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Sparkles size={16} />
            Recortar/Filtro
          </button>
        </div>
      </div>

      {/* Dialogo de Guardado de Bottom Sheet */}
      {showSaveSheet && (
        <SaveBottomSheet
          defaultName={doc.name}
          onClose={() => setShowSaveSheet(false)}
          onSave={handleSaveDocument}
        />
      )}
    </div>
  );
}
