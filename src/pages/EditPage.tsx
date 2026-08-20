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
  Loader2,
  ZoomIn,
  ZoomOut,
  X,
} from 'lucide-react';
import { DocumentItem, ScannedPage, Annotation, ImageOverlay } from '../types';
import { saveDocument } from '../services/documentStore';
import { generatePDF } from '../services/pdfGenerator';
import { loadImage, processPageImage } from '../services/imageProcessor';
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
  const [isRotating, setIsRotating] = useState(false);

  // Estados de Anotación de Texto
  const [textToInput, setTextToInput] = useState('');
  const [textColor, setTextColor] = useState('#FF0000');
  const [textSize, setTextSize] = useState(18);

  // Historial para deshacer/rehacer (máximo 20 estados)
  const [history, setHistory] = useState<DocumentItem[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const fileInputPageRef = useRef<HTMLInputElement>(null);
  const fileInputSignatureRef = useRef<HTMLInputElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);

  // Referencia para arrastre suave y preciso (sin saltos bruscos)
  const dragRef = useRef<{
    activeId: string | null;
    type: 'annotation' | 'overlay';
    startClientX: number;
    startClientY: number;
    startElemX: number;
    startElemY: number;
  }>({
    activeId: null,
    type: 'annotation',
    startClientX: 0,
    startClientY: 0,
    startElemX: 0,
    startElemY: 0,
  });

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

    if (nextHistory.length > 20) {
      nextHistory.shift();
    }

    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
    setDoc(newDoc);
    saveDocument(newDoc);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setDoc(history[prevIndex]);
      saveDocument(history[prevIndex]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      setDoc(history[nextIdx]);
      saveDocument(history[nextIdx]);
    }
  };

  const currentPage = doc.pages[currentIndex];

  // ----------------------------------------------------
  // 1. GIRAR PÁGINA (Rotación 90° instantánea y real)
  // ----------------------------------------------------
  const handleRotateCurrent = async () => {
    if (!currentPage || isRotating) return;
    setIsRotating(true);

    try {
      const nextRotation = (currentPage.adjustments.rotation + 90) % 360;
      const updatedAdjustments = {
        ...currentPage.adjustments,
        rotation: nextRotation,
      };

      // Procesar la rotación real en canvas
      const newProcessed = await processPageImage(currentPage.originalImage, updatedAdjustments);

      const nextPages = [...doc.pages];
      nextPages[currentIndex] = {
        ...currentPage,
        processedImage: newProcessed,
        adjustments: updatedAdjustments,
      };

      const nextDoc = { ...doc, pages: nextPages };
      pushState(nextDoc);
    } catch (err) {
      console.error('Error rotando página:', err);
    } finally {
      setIsRotating(false);
    }
  };

  // ----------------------------------------------------
  // 2. SUBIR Y BAJAR (Reordenar páginas)
  // ----------------------------------------------------
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

  const handleAddPageFromGallery = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    e.target.value = '';
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
            overlays: [],
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
  // 3. ANOTACIONES DE TEXTO (Arrastre 1:1 de precisión suave)
  // ----------------------------------------------------
  const handleAddAnnotation = () => {
    if (!textToInput.trim() || !currentPage) return;

    const newAnnot: Annotation = {
      id: `annot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      text: textToInput.trim(),
      x: 50,
      y: 50,
      color: textColor,
      fontSize: textSize,
    };

    const nextPages = [...doc.pages];
    const currentAnnots = currentPage.adjustments.annotations || [];
    nextPages[currentIndex] = {
      ...currentPage,
      adjustments: {
        ...currentPage.adjustments,
        annotations: [...currentAnnots, newAnnot],
      },
    };

    pushState({ ...doc, pages: nextPages });
    setTextToInput('');
  };

  const handleRemoveAnnotation = (annotId: string) => {
    if (!currentPage) return;
    const nextAnnots = (currentPage.adjustments.annotations || []).filter((a) => a.id !== annotId);

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
  // 4. FIRMAS E IMÁGENES SUPERPUESTAS (Arrastrables y Redimensionables)
  // ----------------------------------------------------
  const handleAddSignatureOrImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !currentPage) return;

    const file = files[0];
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        const base64 = event.target.result as string;
        const newOverlay: ImageOverlay = {
          id: `overlay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          imageBase64: base64,
          x: 50,
          y: 75,
          width: 35, // 35% del ancho de la página
        };

        const currentOverlays = currentPage.adjustments.overlays || [];
        const nextPages = [...doc.pages];
        nextPages[currentIndex] = {
          ...currentPage,
          adjustments: {
            ...currentPage.adjustments,
            overlays: [...currentOverlays, newOverlay],
          },
        };

        pushState({ ...doc, pages: nextPages });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResizeOverlay = (overlayId: string, deltaWidth: number) => {
    if (!currentPage) return;
    const currentOverlays = currentPage.adjustments.overlays || [];
    const nextOverlays = currentOverlays.map((ov) => {
      if (ov.id === overlayId) {
        const newW = Math.min(80, Math.max(10, ov.width + deltaWidth));
        return { ...ov, width: newW };
      }
      return ov;
    });

    const nextPages = [...doc.pages];
    nextPages[currentIndex] = {
      ...currentPage,
      adjustments: {
        ...currentPage.adjustments,
        overlays: nextOverlays,
      },
    };
    pushState({ ...doc, pages: nextPages });
  };

  const handleRemoveOverlay = (overlayId: string) => {
    if (!currentPage) return;
    const currentOverlays = currentPage.adjustments.overlays || [];
    const nextOverlays = currentOverlays.filter((ov) => ov.id !== overlayId);

    const nextPages = [...doc.pages];
    nextPages[currentIndex] = {
      ...currentPage,
      adjustments: {
        ...currentPage.adjustments,
        overlays: nextOverlays,
      },
    };
    pushState({ ...doc, pages: nextPages });
  };

  // ----------------------------------------------------
  // MANEJADOR UNIVERSAL DE ARRASTRE SUAVE (Anotaciones y Firmas)
  // ----------------------------------------------------
  const handlePointerDownElement = (
    id: string,
    type: 'annotation' | 'overlay',
    currentX: number,
    currentY: number,
    e: React.PointerEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    dragRef.current = {
      activeId: id,
      type,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startElemX: currentX,
      startElemY: currentY,
    };
  };

  const handlePointerMoveElement = (e: React.PointerEvent) => {
    const { activeId, type, startClientX, startClientY, startElemX, startElemY } = dragRef.current;
    if (!activeId || !pageContainerRef.current || !currentPage) return;

    const rect = pageContainerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Calcular desplazamiento delta en porcentaje
    const deltaX = ((e.clientX - startClientX) / rect.width) * 100;
    const deltaY = ((e.clientY - startClientY) / rect.height) * 100;

    const newX = Math.min(95, Math.max(5, startElemX + deltaX));
    const newY = Math.min(95, Math.max(5, startElemY + deltaY));

    if (type === 'annotation') {
      const updatedAnnots = (currentPage.adjustments.annotations || []).map((a) =>
        a.id === activeId ? { ...a, x: newX, y: newY } : a
      );
      const nextPages = [...doc.pages];
      nextPages[currentIndex] = {
        ...currentPage,
        adjustments: { ...currentPage.adjustments, annotations: updatedAnnots },
      };
      setDoc({ ...doc, pages: nextPages });
    } else {
      const updatedOverlays = (currentPage.adjustments.overlays || []).map((ov) =>
        ov.id === activeId ? { ...ov, x: newX, y: newY } : ov
      );
      const nextPages = [...doc.pages];
      nextPages[currentIndex] = {
        ...currentPage,
        adjustments: { ...currentPage.adjustments, overlays: updatedOverlays },
      };
      setDoc({ ...doc, pages: nextPages });
    }
  };

  const handlePointerUpElement = (e: React.PointerEvent) => {
    if (dragRef.current.activeId) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      dragRef.current.activeId = null;
      pushState(doc);
    }
  };

  // ----------------------------------------------------
  // GUARDAR DOCUMENTO Y QUEMAR CAPAS EN PDF
  // ----------------------------------------------------
  const handleSaveDocument = async (name: string, format: 'pdf') => {
    const finalPages = await Promise.all(
      doc.pages.map(async (page) => {
        const hasAnnotations = (page.adjustments.annotations || []).length > 0;
        const hasOverlays = (page.adjustments.overlays || []).length > 0;

        if (!hasAnnotations && !hasOverlays) return page;

        const img = await loadImage(page.processedImage);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return page;

        // 1. Dibujar imagen base
        ctx.drawImage(img, 0, 0);

        // 2. Quemar firmas/imágenes superpuestas
        for (const overlay of page.adjustments.overlays || []) {
          try {
            const overlayImg = await loadImage(overlay.imageBase64);
            const overlayW = (overlay.width / 100) * canvas.width;
            const aspect = overlayImg.naturalHeight / overlayImg.naturalWidth;
            const overlayH = overlayW * aspect;
            const posX = (overlay.x / 100) * canvas.width - overlayW / 2;
            const posY = (overlay.y / 100) * canvas.height - overlayH / 2;
            ctx.drawImage(overlayImg, posX, posY, overlayW, overlayH);
          } catch (err) {
            console.error('Error quemando firma/overlay:', err);
          }
        }

        // 3. Quemar anotaciones de texto
        for (const annot of page.adjustments.annotations || []) {
          const fontSizeInCanvas = Math.round((annot.fontSize / 100) * canvas.width);
          ctx.font = `bold ${fontSizeInCanvas}px sans-serif`;

          const xPos = (annot.x / 100) * canvas.width;
          const yPos = (annot.y / 100) * canvas.height;

          // Fondo blanco semitransparente para legibilidad
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          const textWidth = ctx.measureText(annot.text).width;
          ctx.fillRect(xPos - textWidth / 2 - 6, yPos - fontSizeInCanvas / 2 - 6, textWidth + 12, fontSizeInCanvas + 12);

          ctx.fillStyle = annot.color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(annot.text, xPos, yPos);
        }

        return {
          ...page,
          processedImage: canvas.toDataURL('image/jpeg', 0.95),
        };
      })
    );

    const docWithBurnedLayers = {
      ...doc,
      name,
      pages: finalPages,
    };

    saveDocument(docWithBurnedLayers);
    await generatePDF(name, finalPages);
  };

  return (
    <div className="flex flex-col h-full bg-[#09364D] text-white overflow-hidden">
      {/* Header */}
      <header className="px-4 py-3.5 bg-[#1C1C1E] border-b border-[#2C2C2E] flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-2">
          <button
            id="btn-edit-back"
            onClick={onBack}
            className="p-2 text-gray-400 hover:text-white hover:bg-[#2C2C2E] rounded-xl transition-colors cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-sm font-bold truncate max-w-[150px]" title={doc.name}>
              {doc.name}
            </h2>
            <p className="text-[10px] text-gray-400 font-medium">Editor de Páginas</p>
          </div>
        </div>

        {/* Historial y Guardar */}
        <div className="flex items-center gap-2">
          <button
            id="undo-btn"
            disabled={historyIndex <= 0}
            onClick={handleUndo}
            className="p-2 bg-[#2C2C2E]/60 text-gray-300 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent rounded-lg transition-colors border border-white/5 cursor-pointer"
            title="Deshacer"
          >
            <Undo size={14} />
          </button>
          <button
            id="redo-btn"
            disabled={historyIndex >= history.length - 1}
            onClick={handleRedo}
            className="p-2 bg-[#2C2C2E]/60 text-gray-300 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent rounded-lg transition-colors border border-white/5 cursor-pointer"
            title="Rehacer"
          >
            <Redo size={14} />
          </button>

          <button
            id="btn-open-save-dialog"
            onClick={() => setShowSaveSheet(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#2979FF] hover:bg-[#1E6BE6] text-white rounded-xl text-xs font-bold shadow-md shadow-[#2979FF]/25 active:scale-95 transition-all ml-1 cursor-pointer"
          >
            <Save size={14} />
            Guardar
          </button>
        </div>
      </header>

      {/* Área Central: Visualizador de Página con Anotaciones y Firmas Interactivas */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center">
        {currentPage ? (
          <div className="flex flex-col items-center w-full max-w-sm">
            {/* Navegación interna entre páginas */}
            <div className="flex items-center justify-between w-full mb-2 px-1 text-xs text-gray-300 font-semibold">
              <button
                id="edit-prev-page"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((idx) => idx - 1)}
                className="flex items-center gap-1 hover:text-white disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft size={14} />
                Anterior
              </button>
              <span className="bg-black/40 px-3 py-1 rounded-full text-[11px] font-bold">
                Página {currentIndex + 1} de {doc.pages.length}
              </span>
              <button
                id="edit-next-page"
                disabled={currentIndex === doc.pages.length - 1}
                onClick={() => setCurrentIndex((idx) => idx + 1)}
                className="flex items-center gap-1 hover:text-white disabled:opacity-30 cursor-pointer"
              >
                Siguiente
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Contenedor del lienzo de página */}
            <div
              ref={pageContainerRef}
              className="relative w-full aspect-[3/4] bg-neutral-900 border border-[#2C2C2E] rounded-2xl p-1 shadow-2xl flex items-center justify-center select-none overflow-hidden touch-none"
            >
              <img
                src={currentPage.processedImage}
                alt={`Página ${currentIndex + 1}`}
                className="max-w-full max-h-full object-contain rounded-xl pointer-events-none"
                referrerPolicy="no-referrer"
              />

              {/* 1. Capa de Firmas / Imágenes Superpuestas (Arrastrables 1:1 y Redimensionables) */}
              {(currentPage.adjustments.overlays || []).map((ov) => (
                <div
                  id={`overlay-${ov.id}`}
                  key={ov.id}
                  style={{
                    left: `${ov.x}%`,
                    top: `${ov.y}%`,
                    width: `${ov.width}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  onPointerDown={(e) => handlePointerDownElement(ov.id, 'overlay', ov.x, ov.y, e)}
                  onPointerMove={handlePointerMoveElement}
                  onPointerUp={handlePointerUpElement}
                  className="absolute cursor-move touch-none group border-2 border-dashed border-[#2979FF] rounded-lg p-1 bg-white/10 backdrop-blur-xs flex flex-col items-center justify-center z-20 shadow-xl"
                >
                  <img
                    src={ov.imageBase64}
                    alt="Firma superpuesta"
                    className="w-full h-auto object-contain pointer-events-none"
                  />

                  {/* Controles flotantes de la firma */}
                  <div className="absolute -top-7 right-0 flex items-center gap-1 bg-[#111118] border border-white/20 rounded-lg px-1.5 py-0.5 shadow-lg">
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => handleResizeOverlay(ov.id, -5)}
                      className="text-gray-300 hover:text-white font-bold px-1 text-xs cursor-pointer"
                      title="Reducir tamaño"
                    >
                      -
                    </button>
                    <span className="text-[9px] text-gray-400 font-bold">{Math.round(ov.width)}%</span>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => handleResizeOverlay(ov.id, 5)}
                      className="text-gray-300 hover:text-white font-bold px-1 text-xs cursor-pointer"
                      title="Aumentar tamaño"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => handleRemoveOverlay(ov.id)}
                      className="text-red-400 hover:text-red-300 ml-1 p-0.5 cursor-pointer"
                      title="Eliminar firma"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}

              {/* 2. Capa de Anotaciones de Texto Interactivas (Arrastre suave 1:1) */}
              {(currentPage.adjustments.annotations || []).map((annot) => (
                <div
                  id={`annotation-${annot.id}`}
                  key={annot.id}
                  style={{
                    left: `${annot.x}%`,
                    top: `${annot.y}%`,
                    transform: 'translate(-50%, -50%)',
                    color: annot.color,
                    fontSize: `${annot.fontSize}px`,
                  }}
                  onPointerDown={(e) => handlePointerDownElement(annot.id, 'annotation', annot.x, annot.y, e)}
                  onPointerMove={handlePointerMoveElement}
                  onPointerUp={handlePointerUpElement}
                  className="absolute cursor-move font-bold whitespace-nowrap px-2.5 py-1 rounded-lg bg-white/90 border border-neutral-300 shadow-xl flex items-center gap-2 touch-none z-30 select-none"
                >
                  <span>{annot.text}</span>
                  <button
                    id={`delete-annot-${annot.id}`}
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => handleRemoveAnnotation(annot.id)}
                    className="text-red-500 hover:text-red-700 font-bold p-0.5 hover:bg-red-50 rounded cursor-pointer"
                    title="Eliminar texto"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-20 text-gray-400">No hay páginas capturadas</div>
        )}
      </div>

      {/* Controles de la Pestaña Activa en la barra inferior */}
      <div className="bg-[#1C1C1E] border-t border-[#2C2C2E] p-4 shrink-0">
        {/* Pestaña: Páginas (Girar, Subir, Bajar, Eliminar) */}
        {activeTab === 'pages' && (
          <div className="flex flex-col gap-3.5 animate-fade-in">
            <div className="flex items-center justify-between text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              <span>Organizar Página {currentIndex + 1} de {doc.pages.length}</span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {/* 1. Girar */}
              <button
                id="btn-edit-rotate"
                disabled={isRotating}
                onClick={handleRotateCurrent}
                className="flex flex-col items-center justify-center p-3 bg-[#2C2C2E] hover:bg-[#3C3C3E] active:scale-95 rounded-xl text-gray-200 transition-all gap-1.5 cursor-pointer"
                title="Girar página 90 grados"
              >
                {isRotating ? (
                  <Loader2 size={16} className="text-[#2979FF] animate-spin" />
                ) : (
                  <RotateCw size={16} className="text-[#2979FF]" />
                )}
                <span className="text-[10px] font-bold">{isRotating ? 'Girando...' : 'Girar 90°'}</span>
              </button>

              {/* 2. Subir Orden */}
              <button
                id="btn-edit-move-up"
                disabled={currentIndex === 0}
                onClick={handleMoveUp}
                className="flex flex-col items-center justify-center p-3 bg-[#2C2C2E] hover:bg-[#3C3C3E] active:scale-95 disabled:opacity-30 disabled:hover:bg-[#2C2C2E] rounded-xl text-gray-200 transition-all gap-1.5 cursor-pointer"
                title="Mover antes"
              >
                <ChevronUp size={16} className="text-[#2979FF]" />
                <span className="text-[10px] font-bold">Subir</span>
              </button>

              {/* 3. Bajar Orden */}
              <button
                id="btn-edit-move-down"
                disabled={currentIndex === doc.pages.length - 1}
                onClick={handleMoveDown}
                className="flex flex-col items-center justify-center p-3 bg-[#2C2C2E] hover:bg-[#3C3C3E] active:scale-95 disabled:opacity-30 disabled:hover:bg-[#2C2C2E] rounded-xl text-gray-200 transition-all gap-1.5 cursor-pointer"
                title="Mover después"
              >
                <ChevronDown size={16} className="text-[#2979FF]" />
                <span className="text-[10px] font-bold">Bajar</span>
              </button>

              {/* 4. Eliminar Página */}
              <button
                id="btn-edit-delete"
                onClick={handleDeleteCurrent}
                className="flex flex-col items-center justify-center p-3 bg-red-500/10 hover:bg-red-500/20 active:scale-95 rounded-xl text-red-400 transition-all gap-1.5 cursor-pointer"
                title="Eliminar página"
              >
                <Trash2 size={16} />
                <span className="text-[10px] font-bold text-red-300">Eliminar</span>
              </button>
            </div>

            {/* Añadir Página */}
            <button
              id="btn-add-page"
              onClick={() => fileInputPageRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#2C2C2E] hover:bg-[#3C3C3E] border border-white/5 text-gray-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              <Plus size={14} className="text-[#2979FF]" />
              Insertar Página desde Galería
            </button>
          </div>
        )}

        {/* Pestaña: Anotar */}
        {activeTab === 'annotate' && (
          <div className="flex flex-col gap-3.5 animate-fade-in">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
              Añadir Anotación de Texto
            </span>

            <div className="flex gap-2">
              <input
                id="annotation-text-input"
                type="text"
                placeholder="Escribe texto para añadir a la página..."
                value={textToInput}
                onChange={(e) => setTextToInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddAnnotation()}
                className="flex-1 px-3.5 py-2.5 bg-[#2C2C2E] border border-[#3C3C3E] rounded-xl text-xs text-white focus:outline-none focus:border-[#2979FF]"
              />
              <button
                id="add-annotation-btn"
                onClick={handleAddAnnotation}
                disabled={!textToInput.trim()}
                className="px-4 bg-[#2979FF] hover:bg-[#1E6BE6] disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
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
                  {['#FF0000', '#000000', '#0000FF', '#00AA00', '#FF8F00'].map((color) => (
                    <button
                      id={`color-btn-${color.replace('#', '')}`}
                      key={color}
                      type="button"
                      onClick={() => setTextColor(color)}
                      style={{ backgroundColor: color }}
                      className={`w-5 h-5 rounded-full border cursor-pointer ${textColor === color ? 'border-white scale-110 shadow-md' : 'border-black/20'}`}
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
                  max="36"
                  value={textSize}
                  onChange={(e) => setTextSize(Number(e.target.value))}
                  className="w-16 accent-[#2979FF]"
                />
                <span className="text-[10px] text-gray-300 font-bold w-4 text-right">{textSize}</span>
              </div>
            </div>
          </div>
        )}

        {/* Pestaña: Imagen / Firma */}
        {activeTab === 'image' && (
          <div className="flex flex-col gap-3 animate-fade-in">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
              Insertar Firma o Logo sobre la Página Actual
            </span>
            <p className="text-[11px] text-gray-400">
              Sube una imagen de tu firma, sello o logo para colocarla encima de esta página, arrastrarla y ajustar su tamaño libremente.
            </p>
            <button
              id="add-signature-btn"
              onClick={() => fileInputSignatureRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#2979FF] hover:bg-[#1E6BE6] text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-[#2979FF]/25 cursor-pointer"
            >
              <FileImage size={15} />
              Cargar Firma / Logo (PNG / JPG)
            </button>
          </div>
        )}

        {/* Pestaña: Recorte y Filtros */}
        {activeTab === 'filter' && (
          <div className="flex flex-col gap-3 animate-fade-in text-center py-2">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block text-left mb-1">
              Recorte y Filtros de Imagen
            </span>
            <p className="text-[11px] text-gray-400 text-left mb-2">
              Ajusta los filtros de procesamiento (Color Pro, Sin Arrugas, Gris) o modifica el marco de recorte.
            </p>
            <button
              id="btn-edit-clean-shortcut"
              onClick={() => onNavigateToClean(doc.pages)}
              className="flex items-center justify-center gap-1.5 py-3 bg-[#2979FF]/15 hover:bg-[#2979FF]/25 border border-[#2979FF]/40 text-[#2979FF] rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              <Sliders size={14} />
              Abrir Ajustes de Filtros y Recorte
            </button>
          </div>
        )}

        {/* Inputs de archivo ocultos */}
        <input
          ref={fileInputPageRef}
          type="file"
          accept="image/*"
          onChange={handleAddPageFromGallery}
          className="hidden"
        />
        <input
          ref={fileInputSignatureRef}
          type="file"
          accept="image/*"
          onChange={handleAddSignatureOrImage}
          className="hidden"
        />

        {/* Barra de Tabs inferiores */}
        <div className="flex border-t border-white/5 mt-4 pt-3.5 justify-around">
          <button
            id="tab-btn-pages"
            onClick={() => setActiveTab('pages')}
            className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-all cursor-pointer ${
              activeTab === 'pages' ? 'text-[#2979FF]' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Sliders size={16} />
            Páginas
          </button>

          <button
            id="tab-btn-annotate"
            onClick={() => setActiveTab('annotate')}
            className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-all cursor-pointer ${
              activeTab === 'annotate' ? 'text-[#2979FF]' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Type size={16} />
            Anotar
          </button>

          <button
            id="tab-btn-image"
            onClick={() => setActiveTab('image')}
            className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-all cursor-pointer ${
              activeTab === 'image' ? 'text-[#2979FF]' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <FileImage size={16} />
            Imagen/Firma
          </button>

          <button
            id="tab-btn-filter"
            onClick={() => setActiveTab('filter')}
            className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-all cursor-pointer ${
              activeTab === 'filter' ? 'text-[#2979FF]' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Sparkles size={16} />
            Filtros
          </button>
        </div>
      </div>

      {/* Diálogo de Guardado de Bottom Sheet */}
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
