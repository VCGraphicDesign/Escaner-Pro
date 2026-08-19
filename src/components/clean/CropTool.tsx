/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { CropPoints } from '../../types';

interface CropToolProps {
  imageUrl: string;
  cropPoints: CropPoints;
  onChange: (points: CropPoints) => void;
}

type HandleType = keyof CropPoints | 'top' | 'bottom' | 'left' | 'right';

export default function CropTool({ imageUrl, cropPoints, onChange }: CropToolProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeHandle, setActiveHandle] = useState<HandleType | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Actualizar dimensiones de la imagen para calcular posiciones relativas exactas
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setDimensions({
      width: img.clientWidth,
      height: img.clientHeight,
    });
  };

  // Escuchar redimensionamiento de ventana para ajustar posiciones
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const img = containerRef.current.querySelector('img');
        if (img) {
          setDimensions({
            width: img.clientWidth,
            height: img.clientHeight,
          });
        }
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Manejar el inicio del arrastre (para esquinas o bordes completos)
  const handlePointerDown = (handle: HandleType, e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setActiveHandle(handle);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeHandle || !containerRef.current || dimensions.width === 0) return;

    const rect = containerRef.current.getBoundingClientRect();

    // Obtener coordenadas relativas dentro de la imagen
    const offsetX = e.clientX - rect.left - (rect.width - dimensions.width) / 2;
    const offsetY = e.clientY - rect.top - (rect.height - dimensions.height) / 2;

    // Convertir a porcentajes (0 a 1)
    const normX = Math.min(0.99, Math.max(0.01, offsetX / dimensions.width));
    const normY = Math.min(0.99, Math.max(0.01, offsetY / dimensions.height));

    const updated = { ...cropPoints };

    switch (activeHandle) {
      // 1. Esquinas individuales
      case 'topLeft':
        updated.topLeft = { x: Math.min(normX, updated.topRight.x - 0.05), y: Math.min(normY, updated.bottomLeft.y - 0.05) };
        break;
      case 'topRight':
        updated.topRight = { x: Math.max(normX, updated.topLeft.x + 0.05), y: Math.min(normY, updated.bottomRight.y - 0.05) };
        break;
      case 'bottomRight':
        updated.bottomRight = { x: Math.max(normX, updated.bottomLeft.x + 0.05), y: Math.max(normY, updated.topRight.y + 0.05) };
        break;
      case 'bottomLeft':
        updated.bottomLeft = { x: Math.min(normX, updated.bottomRight.x - 0.05), y: Math.max(normY, updated.topLeft.y + 0.05) };
        break;

      // 2. Líneas completas (bordes)
      case 'top': {
        const deltaY = normY;
        const maxY = Math.min(updated.bottomLeft.y, updated.bottomRight.y) - 0.05;
        const safeY = Math.min(deltaY, maxY);
        updated.topLeft = { ...updated.topLeft, y: safeY };
        updated.topRight = { ...updated.topRight, y: safeY };
        break;
      }
      case 'bottom': {
        const deltaY = normY;
        const minY = Math.max(updated.topLeft.y, updated.topRight.y) + 0.05;
        const safeY = Math.max(deltaY, minY);
        updated.bottomLeft = { ...updated.bottomLeft, y: safeY };
        updated.bottomRight = { ...updated.bottomRight, y: safeY };
        break;
      }
      case 'left': {
        const deltaX = normX;
        const maxX = Math.min(updated.topRight.x, updated.bottomRight.x) - 0.05;
        const safeX = Math.min(deltaX, maxX);
        updated.topLeft = { ...updated.topLeft, x: safeX };
        updated.bottomLeft = { ...updated.bottomLeft, x: safeX };
        break;
      }
      case 'right': {
        const deltaX = normX;
        const minX = Math.max(updated.topLeft.x, updated.bottomLeft.x) + 0.05;
        const safeX = Math.max(deltaX, minX);
        updated.topRight = { ...updated.topRight, x: safeX };
        updated.bottomRight = { ...updated.bottomRight, x: safeX };
        break;
      }
    }

    onChange(updated);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeHandle) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      setActiveHandle(null);
    }
  };

  // Convertir puntos a píxeles para dibujar en SVG y posicionar controles
  const getPixelCoord = (point: { x: number; y: number }) => {
    const leftOffset = containerRef.current
      ? (containerRef.current.clientWidth - dimensions.width) / 2
      : 0;
    const topOffset = containerRef.current
      ? (containerRef.current.clientHeight - dimensions.height) / 2
      : 0;

    return {
      x: point.x * dimensions.width + leftOffset,
      y: point.y * dimensions.height + topOffset,
    };
  };

  const p0 = getPixelCoord(cropPoints.topLeft);
  const p1 = getPixelCoord(cropPoints.topRight);
  const p2 = getPixelCoord(cropPoints.bottomRight);
  const p3 = getPixelCoord(cropPoints.bottomLeft);

  // Puntos medios para los 4 bordes
  const midTop = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  const midBottom = { x: (p3.x + p2.x) / 2, y: (p3.y + p2.y) / 2 };
  const midLeft = { x: (p0.x + p3.x) / 2, y: (p0.y + p3.y) / 2 };
  const midRight = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

  const pointsSvgString = `${p0.x},${p0.y} ${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`;

  const cornerHandles: Array<{ key: keyof CropPoints; coord: { x: number; y: number }; label: string }> = [
    { key: 'topLeft', coord: p0, label: 'Superior Izquierda' },
    { key: 'topRight', coord: p1, label: 'Superior Derecha' },
    { key: 'bottomRight', coord: p2, label: 'Inferior Derecha' },
    { key: 'bottomLeft', coord: p3, label: 'Inferior Izquierda' },
  ];

  const edgeHandles: Array<{ key: 'top' | 'bottom' | 'left' | 'right'; coord: { x: number; y: number }; cursor: string; isHorizontal: boolean }> = [
    { key: 'top', coord: midTop, cursor: 'ns-resize', isHorizontal: true },
    { key: 'bottom', coord: midBottom, cursor: 'ns-resize', isHorizontal: true },
    { key: 'left', coord: midLeft, cursor: 'ew-resize', isHorizontal: false },
    { key: 'right', coord: midRight, cursor: 'ew-resize', isHorizontal: false },
  ];

  return (
    <div className="flex-1 w-full h-full p-2 flex flex-col items-center justify-center relative">
      <div
        ref={containerRef}
        className="relative w-full h-full max-h-[70vh] bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden flex items-center justify-center touch-none select-none shadow-xl"
      >
        <img
          src={imageUrl}
          alt="Recortar documento"
          onLoad={handleImageLoad}
          className="max-w-full max-h-full object-contain pointer-events-none"
          referrerPolicy="no-referrer"
        />

        {dimensions.width > 0 && (
          <>
            {/* Polígono de Recorte con máscara */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              {/* Overlay oscuro fuera del polígono */}
              <mask id="crop-mask">
                <rect width="100%" height="100%" fill="white" />
                <polygon points={pointsSvgString} fill="black" />
              </mask>
              <rect
                width="100%"
                height="100%"
                fill="rgba(0,0,0,0.55)"
                mask="url(#crop-mask)"
              />

              {/* Cuadrícula interna de regla de tercios */}
              <line
                x1={p0.x + (p1.x - p0.x) / 3}
                y1={p0.y + (p1.y - p0.y) / 3}
                x2={p3.x + (p2.x - p3.x) / 3}
                y2={p3.y + (p2.y - p3.y) / 3}
                stroke="#2979FF"
                strokeWidth="1"
                strokeOpacity="0.3"
              />
              <line
                x1={p0.x + ((p1.x - p0.x) * 2) / 3}
                y1={p0.y + ((p1.y - p0.y) * 2) / 3}
                x2={p3.x + ((p2.x - p3.x) * 2) / 3}
                y2={p3.y + ((p2.y - p3.y) * 2) / 3}
                stroke="#2979FF"
                strokeWidth="1"
                strokeOpacity="0.3"
              />
              <line
                x1={p0.x + (p3.x - p0.x) / 3}
                y1={p0.y + (p3.y - p0.y) / 3}
                x2={p1.x + (p2.x - p1.x) / 3}
                y2={p1.y + (p2.y - p1.y) / 3}
                stroke="#2979FF"
                strokeWidth="1"
                strokeOpacity="0.3"
              />
              <line
                x1={p0.x + ((p3.x - p0.x) * 2) / 3}
                y1={p0.y + ((p3.y - p0.y) * 2) / 3}
                x2={p1.x + ((p2.x - p1.x) * 2) / 3}
                y2={p1.y + ((p2.y - p1.y) * 2) / 3}
                stroke="#2979FF"
                strokeWidth="1"
                strokeOpacity="0.3"
              />

              {/* Bordes principales del polígono */}
              <polygon
                points={pointsSvgString}
                fill="none"
                stroke="#2979FF"
                strokeWidth="2.5"
              />
            </svg>

            {/* 1. Manillas de los 4 Bordes / Líneas Completas (Superior, Inferior, Izquierda, Derecha) */}
            {edgeHandles.map((eh) => (
              <div
                id={`handle-edge-${eh.key}`}
                key={`edge-${eh.key}`}
                style={{
                  left: `${eh.coord.x}px`,
                  top: `${eh.coord.y}px`,
                  transform: 'translate(-50%, -50%)',
                  cursor: eh.cursor,
                }}
                onPointerDown={(e) => handlePointerDown(eh.key, e)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className={`absolute z-20 flex items-center justify-center touch-none transition-transform ${
                  eh.isHorizontal ? 'w-12 h-6' : 'w-6 h-12'
                } ${activeHandle === eh.key ? 'scale-125' : 'hover:scale-110'}`}
                title={`Mover línea ${eh.key === 'top' ? 'superior' : eh.key === 'bottom' ? 'inferior' : eh.key === 'left' ? 'izquierda' : 'derecha'}`}
              >
                <div
                  className={`bg-[#2979FF] border-2 border-white rounded-full shadow-lg flex items-center justify-center ${
                    eh.isHorizontal ? 'w-8 h-3.5' : 'w-3.5 h-8'
                  }`}
                >
                  <div
                    className={`bg-white rounded-full ${
                      eh.isHorizontal ? 'w-3.5 h-1' : 'w-1 h-3.5'
                    }`}
                  />
                </div>
              </div>
            ))}

            {/* 2. Manillas (Handles) Arrastrables en las 4 Esquinas */}
            {cornerHandles.map((ch) => (
              <div
                id={`handle-corner-${ch.key}`}
                key={`corner-${ch.key}`}
                style={{
                  left: `${ch.coord.x}px`,
                  top: `${ch.coord.y}px`,
                  transform: 'translate(-50%, -50%)',
                }}
                onPointerDown={(e) => handlePointerDown(ch.key, e)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className={`absolute w-8 h-8 rounded-full bg-white border-2 border-[#2979FF] shadow-lg flex items-center justify-center cursor-move touch-none z-30 transition-transform ${
                  activeHandle === ch.key ? 'scale-125' : 'hover:scale-110'
                }`}
                title={ch.label}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-[#2979FF]" />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
