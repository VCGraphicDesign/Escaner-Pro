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

export default function CropTool({ imageUrl, cropPoints, onChange }: CropToolProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeHandle, setActiveHandle] = useState<keyof CropPoints | null>(null);
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

  // Manejar el arrastre
  const handlePointerDown = (handle: keyof CropPoints, e: React.PointerEvent) => {
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
    let x = Math.min(1, Math.max(0, offsetX / dimensions.width));
    let y = Math.min(1, Math.max(0, offsetY / dimensions.height));

    // Forzar límites para que las esquinas no se crucen
    const updatedPoints = { ...cropPoints };
    updatedPoints[activeHandle] = { x, y };
    onChange(updatedPoints);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeHandle) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      setActiveHandle(null);
    }
  };

  // Convertir puntos a pixeles para dibujar el polígono SVG
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

  const pointsSvgString = `${p0.x},${p0.y} ${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`;

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
            {/* Polígono de Recorte */}
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
              
              {/* Bordes del polígono */}
              <polygon
                points={pointsSvgString}
                fill="none"
                stroke="#2979FF"
                strokeWidth="2"
                strokeDasharray="4 4"
              />
            </svg>

            {/* Manillas (Handles) Arrastrables en las Esquinas */}
            {(Object.keys(cropPoints) as Array<keyof CropPoints>).map((handleKey) => {
              const point = cropPoints[handleKey];
              const coord = getPixelCoord(point);

              return (
                <div
                  id={`handle-${handleKey}`}
                  key={handleKey}
                  style={{
                    left: `${coord.x}px`,
                    top: `${coord.y}px`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  onPointerDown={(e) => handlePointerDown(handleKey, e)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  className={`absolute w-7 h-7 rounded-full bg-white border-2 border-[#2979FF] shadow-lg flex items-center justify-center cursor-pointer touch-none z-10 transition-transform ${
                    activeHandle === handleKey ? 'scale-125' : 'hover:scale-110'
                  }`}
                >
                  <div className="w-2 h-2 rounded-full bg-[#2979FF]" />
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
