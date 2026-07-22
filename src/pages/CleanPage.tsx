/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Check, Sparkles, CopyCheck, RefreshCw, ChevronLeft, ChevronRight, Crop, Sliders, ZoomIn, ZoomOut } from 'lucide-react';
import { ScannedPage } from '../types';
import { processPageImage } from '../services/imageProcessor';
import FilterCarousel from '../components/clean/FilterCarousel';
import AdjustmentSliders from '../components/clean/AdjustmentSliders';
import CropTool from '../components/clean/CropTool';

interface CleanPageProps {
  capturedPages: ScannedPage[];
  onBack: () => void;
  onFinishCleaning: (cleanedPages: ScannedPage[]) => void;
}

type TabType = 'filtros' | 'ajustes' | 'recortar';

export default function CleanPage({ capturedPages, onBack, onFinishCleaning }: CleanPageProps) {
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('filtros');
  const [zoomLevel, setZoomLevel] = useState(1);

  // Inicializar páginas con puntos de recorte predeterminados si no tienen
  useEffect(() => {
    const initialized = capturedPages.map((page) => {
      if (!page.adjustments.crop) {
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

    alert('Filtros y ajustes manuales aplicados a todas las páginas.');
  };

  if (!currentPage) {
    return (
      <div className="flex items-center justify-center h-full bg-[#09364D] text-white">
        <RefreshCw className="animate-spin text-[#2979FF]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#09364D] text-white overflow-hidden relative">
      {/* 1. HEADER (Top Bar) */}
      <div className="flex-none flex items-center justify-between p-4 bg-[#1C1C1E] z-20">
        <button
          onClick={onBack}
          className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-[#2C2C2E] rounded-xl transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h3 className="text-sm font-semibold uppercase tracking-wide">
          Procesar
        </h3>
        <button
          onClick={() => onFinishCleaning(pages)}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#2979FF] hover:bg-[#2979FF]/90 text-white rounded-xl text-xs font-bold shadow-md shadow-[#2979FF]/25 active:scale-95 transition-all"
        >
          Editor
          <Check size={14} />
        </button>
      </div>

      {/* 2. ÁREA CENTRAL: VISTA PREVIA DEL DOCUMENTO GIGANTE */}
      <div className="flex-1 relative overflow-hidden bg-black flex flex-col items-center justify-center p-2 z-10">
        {/* Navegación flotante superior (solo si hay más de 1 página) */}
        {pages.length > 1 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 shadow-lg">
            <button
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((idx) => idx - 1)}
              className="p-1 text-gray-300 hover:text-white disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-semibold text-white px-2">
              {currentIndex + 1} de {pages.length}
            </span>
            <button
              disabled={currentIndex === pages.length - 1}
              onClick={() => setCurrentIndex((idx) => idx + 1)}
              className="p-1 text-gray-300 hover:text-white disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Imagen del Documento o Herramienta de Recorte */}
        {activeTab === 'recortar' ? (
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
        ) : (
          <div className="relative w-full h-full flex items-center justify-center overflow-auto">
            <img
              src={currentPage.processedImage}
              alt="Documento Procesado"
              className="max-w-none max-h-none object-contain rounded-lg shadow-2xl transition-transform duration-200"
              style={{ transform: `scale(${zoomLevel})` }}
              referrerPolicy="no-referrer"
            />
            {isProcessing && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center text-[#2979FF] rounded-lg">
                <RefreshCw className="animate-spin" size={32} />
              </div>
            )}
            {/* Controles de Zoom */}
            <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-30">
              <button
                onClick={() => setZoomLevel(Math.min(zoomLevel + 0.25, 3))}
                className="p-2 bg-black/60 backdrop-blur-md rounded-lg text-white hover:bg-black/80 transition-colors"
                title="Ampliar"
              >
                <ZoomIn size={20} />
              </button>
              <button
                onClick={() => setZoomLevel(Math.max(zoomLevel - 0.25, 0.5))}
                className="p-2 bg-black/60 backdrop-blur-md rounded-lg text-white hover:bg-black/80 transition-colors"
                title="Reducir"
              >
                <ZoomOut size={20} />
              </button>
              <button
                onClick={() => setZoomLevel(1)}
                className="p-2 bg-black/60 backdrop-blur-md rounded-lg text-white hover:bg-black/80 transition-colors text-xs font-bold"
                title="Restablecer zoom"
              >
                {Math.round(zoomLevel * 100)}%
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. BARRA DE HERRAMIENTAS INFERIOR (Ocupa ~30% de la pantalla) */}
      <div className="flex-none bg-[#1C1C1E] border-t border-[#2C2C2E] flex flex-col z-20">
        {/* Selector de Pestañas (Tabs) */}
        <div className="flex items-center justify-around border-b border-[#2C2C2E] px-2 py-1 bg-[#151517]">
          <button
            onClick={() => setActiveTab('filtros')}
            className={`flex-1 py-3 text-xs font-bold transition-all flex items-center justify-center gap-1.5 border-b-2 ${
              activeTab === 'filtros' ? 'border-[#2979FF] text-[#2979FF]' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <Sparkles size={16} />
            Filtros
          </button>
          <button
            onClick={() => setActiveTab('ajustes')}
            className={`flex-1 py-3 text-xs font-bold transition-all flex items-center justify-center gap-1.5 border-b-2 ${
              activeTab === 'ajustes' ? 'border-[#2979FF] text-[#2979FF]' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <Sliders size={16} />
            Ajustes
          </button>
          <button
            onClick={() => setActiveTab('recortar')}
            className={`flex-1 py-3 text-xs font-bold transition-all flex items-center justify-center gap-1.5 border-b-2 ${
              activeTab === 'recortar' ? 'border-[#2979FF] text-[#2979FF]' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <Crop size={16} />
            Recortar
          </button>
        </div>

        {/* Contenido de la Pestaña Activa */}
        <div className="p-4 h-[220px] overflow-y-auto">
          {/* PESTAÑA: FILTROS */}
          {activeTab === 'filtros' && (
            <div className="flex flex-col h-full justify-between gap-4">
              <FilterCarousel
                selectedFilter={currentPage.adjustments.filter}
                onChange={(f) => updateAdjustment('filter', f)}
              />
              <button
                onClick={handleApplyToAll}
                className="w-full py-3 bg-[#2C2C2E] hover:bg-[#3C3C3E] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all"
              >
                <CopyCheck size={14} className="text-[#2979FF]" />
                Aplicar filtros a todas las páginas
              </button>
            </div>
          )}

          {/* PESTAÑA: AJUSTES */}
          {activeTab === 'ajustes' && (
            <div className="flex flex-col h-full gap-4">
              <AdjustmentSliders
                brightness={currentPage.adjustments.brightness}
                contrast={currentPage.adjustments.contrast}
                sharpness={currentPage.adjustments.sharpness}
                onBrightnessChange={(b) => updateAdjustment('brightness', b)}
                onContrastChange={(c) => updateAdjustment('contrast', c)}
                onSharpnessChange={(s) => updateAdjustment('sharpness', s)}
              />
              
              <div className="flex justify-between items-center bg-[#2C2C2E] px-4 py-2.5 rounded-xl">
                <span className="text-xs text-gray-300 font-medium">Rotación</span>
                <button
                  onClick={() => {
                    const nextRotation = (currentPage.adjustments.rotation + 90) % 360;
                    updateAdjustment('rotation', nextRotation);
                  }}
                  className="text-xs font-bold text-[#2979FF] flex items-center gap-1.5 bg-[#1C1C1E] px-3 py-1.5 rounded-lg border border-[#3C3C3E]"
                >
                  <RefreshCw size={12} />
                  Girar 90°
                </button>
              </div>
            </div>
          )}

          {/* PESTAÑA: RECORTAR */}
          {activeTab === 'recortar' && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
              <p className="text-xs text-gray-400">
                Arrastra las 4 esquinas azules sobre la imagen para corregir la perspectiva de la página.
              </p>
              <button
                onClick={() => {
                  updateAdjustment('crop', {
                    topLeft: { x: 0.05, y: 0.05 },
                    topRight: { x: 0.95, y: 0.05 },
                    bottomLeft: { x: 0.05, y: 0.95 },
                    bottomRight: { x: 0.95, y: 0.95 },
                  });
                }}
                className="px-6 py-2.5 bg-[#2C2C2E] hover:bg-[#3C3C3E] text-white text-xs font-bold rounded-xl border border-[#3C3C3E] transition-all"
              >
                Restablecer bordes
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
