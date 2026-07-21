/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useTransition } from 'react';
import { ArrowLeft, Check, Sparkles, CopyCheck, RefreshCw, ChevronLeft, ChevronRight, Crop } from 'lucide-react';
import { ScannedPage, CropPoints } from '../types';
import { processPageImage } from '../services/imageProcessor';
import FilterCarousel from '../components/clean/FilterCarousel';
import AdjustmentSliders from '../components/clean/AdjustmentSliders';
import CropTool from '../components/clean/CropTool';

interface CleanPageProps {
  capturedPages: ScannedPage[];
  onBack: () => void;
  onFinishCleaning: (cleanedPages: ScannedPage[]) => void;
}

export default function CleanPage({ capturedPages, onBack, onFinishCleaning }: CleanPageProps) {
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCropTool, setShowCropTool] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Inicializar páginas con puntos de recorte predeterminados si no tienen
  useEffect(() => {
    const initialized = capturedPages.map((page) => {
      if (!page.adjustments.crop) {
        // Inicializar esquinas a las 4 esquinas del lienzo
        page.adjustments.crop = {
          topLeft: { x: 0.05, y: 0.05 },
          topRight: { x: 0.95, y: 0.05 },
          bottomLeft: { x: 0.05, y: 0.95 },
          bottomRight: { x: 0.95, y: 0.95 },
        };
      }
      return page;
    });
    setPages(initialized);
  }, [capturedPages]);

  const currentPage = pages[currentIndex];

  // Efecto para procesar la imagen actual cada vez que cambien sus ajustes
  useEffect(() => {
    if (!currentPage) return;

    let isMounted = true;
    const runProcessing = async () => {
      setIsProcessing(true);
      try {
        const processed = await processPageImage(
          currentPage.originalImage,
          currentPage.adjustments
        );
        if (isMounted) {
          setPages((prev) => {
            const next = [...prev];
            if (next[currentIndex]) {
              next[currentIndex] = {
                ...next[currentIndex],
                processedImage: processed,
              };
            }
            return next;
          });
        }
      } catch (err) {
        console.error('Error procesando imagen', err);
      } finally {
        if (isMounted) {
          setIsProcessing(false);
        }
      }
    };

    // Pequeño timeout para debouncar los sliders
    const delay = setTimeout(() => {
      runProcessing();
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(delay);
    };
  }, [
    currentPage?.adjustments.brightness,
    currentPage?.adjustments.contrast,
    currentPage?.adjustments.sharpness,
    currentPage?.adjustments.filter,
    currentPage?.adjustments.rotation,
    currentPage?.adjustments.crop,
  ]);

  // Manejadores de cambios en los ajustes
  const updateAdjustment = <K extends keyof typeof currentPage.adjustments>(
    key: K,
    value: typeof currentPage.adjustments[K]
  ) => {
    setPages((prev) => {
      const next = [...prev];
      const page = next[currentIndex];
      if (page) {
        next[currentIndex] = {
          ...page,
          adjustments: {
            ...page.adjustments,
            [key]: value,
          },
        };
      }
      return next;
    });
  };

  // Aplicar ajustes actuales a todas las páginas de este lote
  const handleApplyToAll = () => {
    if (!currentPage) return;
    const currentAdjusts = { ...currentPage.adjustments };
    
    // Omitimos el recorte ya que cada página tiene diferente perspectiva
    setPages((prev) =>
      prev.map((page, idx) => {
        if (idx === currentIndex) return page;
        return {
          ...page,
          adjustments: {
            ...page.adjustments,
            brightness: currentAdjusts.brightness,
            contrast: currentAdjusts.contrast,
            sharpness: currentAdjusts.sharpness,
            filter: currentAdjusts.filter,
            rotation: currentAdjusts.rotation,
          },
        };
      })
    );

    alert('Filtros y ajustes manuales aplicados a todas las páginas correctamente.');
  };

  // Finalizar y pasar al editor general
  const handleNext = () => {
    onFinishCleaning(pages);
  };

  if (!currentPage) {
    return (
      <div className="flex items-center justify-center h-full bg-[#09364D] text-white">
        <RefreshCw className="animate-spin text-[#2979FF]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#09364D] text-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#2C2C2E] bg-[#1C1C1E] z-10">
        <button
          id="btn-clean-back"
          onClick={onBack}
          className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-[#2C2C2E] rounded-xl transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h3 className="text-sm font-semibold uppercase tracking-wide">
          Procesar Imagen ({currentIndex + 1} de {pages.length})
        </h3>
        <button
          id="btn-clean-next"
          onClick={handleNext}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#2979FF] hover:bg-[#2979FF]/90 text-white rounded-xl text-xs font-bold shadow-md shadow-[#2979FF]/25 active:scale-95 transition-all"
        >
          Editor
          <Check size={14} />
        </button>
      </div>

      {/* Área Central de Visualización y Controles de Recorte */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center">
        {/* Navegación de página superior */}
        {pages.length > 1 && (
          <div className="flex items-center gap-4 mb-4">
            <button
              id="prev-page-btn"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((idx) => idx - 1)}
              className="p-1.5 bg-[#1C1C1E] hover:bg-[#2C2C2E] text-gray-400 hover:text-white disabled:opacity-40 rounded-lg transition-colors border border-white/5"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-semibold text-gray-400">
              Página {currentIndex + 1} de {pages.length}
            </span>
            <button
              id="next-page-btn"
              disabled={currentIndex === pages.length - 1}
              onClick={() => setCurrentIndex((idx) => idx + 1)}
              className="p-1.5 bg-[#1C1C1E] hover:bg-[#2C2C2E] text-gray-400 hover:text-white disabled:opacity-40 rounded-lg transition-colors border border-white/5"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Alternador de Vista de Recorte vs Vista de Ajustes */}
        <div className="flex justify-center gap-2.5 mb-4 w-full max-w-sm">
          <button
            id="toggle-crop-view-btn"
            onClick={() => setShowCropTool(true)}
            className={`flex-1 py-2 px-4 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
              showCropTool
                ? 'bg-[#2979FF] border-transparent text-white'
                : 'bg-[#1C1C1E] border-[#2C2C2E] text-gray-400 hover:text-white'
            }`}
          >
            <Crop size={14} />
            Recorte de Perspectiva
          </button>
          <button
            id="toggle-adjust-view-btn"
            onClick={() => setShowCropTool(false)}
            className={`flex-1 py-2 px-4 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
              !showCropTool
                ? 'bg-[#2979FF] border-transparent text-white'
                : 'bg-[#1C1C1E] border-[#2C2C2E] text-gray-400 hover:text-white'
            }`}
          >
            <Sparkles size={14} />
            Filtros y Sliders
          </button>
        </div>

        {/* Contenedor del Preview */}
        {showCropTool ? (
          <div className="w-full">
            <CropTool
              imageUrl={currentPage.originalImage}
              cropPoints={currentPage.adjustments.crop || {
                topLeft: { x: 0, y: 0 },
                topRight: { x: 1, y: 0 },
                bottomLeft: { x: 0, y: 1 },
                bottomRight: { x: 1, y: 1 },
              }}
              onChange={(pts) => updateAdjustment('crop', pts)}
            />
            {/* Reset Crop */}
            <div className="flex justify-center mt-2">
              <button
                id="reset-crop-btn"
                onClick={() => {
                  updateAdjustment('crop', {
                    topLeft: { x: 0.05, y: 0.05 },
                    topRight: { x: 0.95, y: 0.05 },
                    bottomLeft: { x: 0.05, y: 0.95 },
                    bottomRight: { x: 0.95, y: 0.95 },
                  });
                }}
                className="text-[11px] text-[#2979FF] hover:underline"
              >
                Restablecer puntos de esquina
              </button>
            </div>
          </div>
        ) : (
          <div className="relative w-full max-w-sm aspect-[3/4] bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden flex items-center justify-center p-2 mb-4 group shadow-lg">
            <img
              src={currentPage.processedImage}
              alt="Preview Procesada"
              className="max-w-full max-h-full object-contain rounded-lg transition-all"
              referrerPolicy="no-referrer"
            />
            {isProcessing && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center text-[#2979FF]">
                <RefreshCw className="animate-spin" size={28} />
              </div>
            )}
          </div>
        )}

        {/* Sección de Filtros y Sliders (Sólo si no se está recortando) */}
        {!showCropTool && (
          <div className="w-full max-w-sm flex flex-col gap-5 mt-2">
            <FilterCarousel
              selectedFilter={currentPage.adjustments.filter}
              onChange={(f) => updateAdjustment('filter', f)}
            />

            <AdjustmentSliders
              brightness={currentPage.adjustments.brightness}
              contrast={currentPage.adjustments.contrast}
              sharpness={currentPage.adjustments.sharpness}
              onBrightnessChange={(b) => updateAdjustment('brightness', b)}
              onContrastChange={(c) => updateAdjustment('contrast', c)}
              onSharpnessChange={(s) => updateAdjustment('sharpness', s)}
            />

            {/* Rotación rápida */}
            <div className="flex justify-between items-center bg-[#1C1C1E] border border-[#2C2C2E] px-4 py-3.5 rounded-2xl">
              <span className="text-xs text-gray-300 font-medium">Rotación</span>
              <button
                id="rotate-doc-btn"
                onClick={() => {
                  const nextRotation = (currentPage.adjustments.rotation + 90) % 360;
                  updateAdjustment('rotation', nextRotation);
                }}
                className="text-xs font-bold text-[#2979FF] hover:text-[#2979FF]/80 flex items-center gap-1 bg-[#2979FF]/10 px-3 py-1.5 rounded-xl"
              >
                <RefreshCw size={12} />
                Girar 90°
              </button>
            </div>

            {/* Aplicar lote */}
            <button
              id="apply-to-all-btn"
              onClick={handleApplyToAll}
              className="w-full py-3 bg-[#1C1C1E] border border-[#2C2C2E] hover:bg-[#2C2C2E] text-gray-300 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all mt-1"
            >
              <CopyCheck size={14} className="text-[#2979FF]" />
              Aplicar filtros de esta página a todo el lote
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
