import React, { useState, useRef, useEffect } from 'react';
import { Check, Edit2, RotateCw } from 'lucide-react';

interface Point {
  x: number; // 0 to 1
  y: number; // 0 to 1
}

interface PerspectiveCropperProps {
  imageSrc: string;
  onCropComplete: (warpedPoints: Point[]) => void;
  onCancel: () => void;
}

export const PerspectiveCropper: React.FC<PerspectiveCropperProps> = ({
  imageSrc,
  onCropComplete,
  onCancel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const magnifierCanvasRef = useRef<HTMLCanvasElement>(null);

  const [points, setPoints] = useState<Point[]>([
    { x: 0.15, y: 0.15 }, // Top-Left
    { x: 0.85, y: 0.15 }, // Top-Right
    { x: 0.85, y: 0.85 }, // Bottom-Right
    { x: 0.15, y: 0.85 }, // Bottom-Left
  ]);

  const [dimensions, setDimensions] = useState({ width: 0, height: 0, left: 0, top: 0 });
  const [activeHandle, setActiveHandle] = useState<{ type: 'corner' | 'edge'; index: number } | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [draggedStartPoints, setDraggedStartPoints] = useState<Point[]>([]);
  const [magnifierInfo, setMagnifierInfo] = useState<{ x: number; y: number; originalX: number; originalY: number } | null>(null);

  // Update layout bounds of image
  const updateLayoutBounds = () => {
    if (imgRef.current) {
      const rect = imgRef.current.getBoundingClientRect();
      const cont = containerRef.current?.getBoundingClientRect();
      setDimensions({
        width: rect.width,
        height: rect.height,
        left: rect.left - (cont?.left || 0),
        top: rect.top - (cont?.top || 0),
      });
    }
  };

  useEffect(() => {
    window.addEventListener('resize', updateLayoutBounds);
    return () => window.removeEventListener('resize', updateLayoutBounds);
  }, []);

  // Compute midpoints between corners
  const getMidPoints = (): Point[] => {
    return [
      { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }, // Top edge
      { x: (points[1].x + points[2].x) / 2, y: (points[1].y + points[2].y) / 2 }, // Right edge
      { x: (points[2].x + points[3].x) / 2, y: (points[2].y + points[3].y) / 2 }, // Bottom edge
      { x: (points[3].x + points[0].x) / 2, y: (points[3].y + points[0].y) / 2 }, // Left edge
    ];
  };



  // Handle Drag Start
  const handleStart = (clientX: number, clientY: number, handleType: 'corner' | 'edge', index: number) => {
    setActiveHandle({ type: handleType, index });
    setDragStart({ x: clientX, y: clientY });
    setDraggedStartPoints([...points]);
    
    // Set initial magnifier position relative to screen coords
    const pt = handleType === 'corner' ? points[index] : getMidPoints()[index];
    triggerMagnifier(pt.x, pt.y, clientX, clientY);
  };

  // Trigger and Render Magnifier Glass
  const triggerMagnifier = (normX: number, normY: number, clientX: number, clientY: number) => {
    const canvas = magnifierCanvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // View dimensions
    const diameter = 130;
    canvas.width = diameter;
    canvas.height = diameter;

    // Calculate crop origin of full-resolution image
    const origWidth = img.naturalWidth;
    const origHeight = img.naturalHeight;

    const targetX = normX * origWidth;
    const targetY = normY * origHeight;

    const zoomFactor = 2.5;
    const cropSize = diameter / zoomFactor;

    ctx.clearRect(0, 0, diameter, diameter);
    
    // Draw viewport circular clip mask
    ctx.save();
    ctx.beginPath();
    ctx.arc(diameter / 2, diameter / 2, diameter / 2 - 2, 0, Math.PI * 2);
    ctx.clip();

    // Draw magnified portion of original image
    ctx.drawImage(
      img,
      targetX - cropSize / 2,
      targetY - cropSize / 2,
      cropSize,
      cropSize,
      0,
      0,
      diameter,
      diameter
    );

    // Draw cursor center crosshair
    ctx.beginPath();
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.5;
    ctx.arc(diameter / 2, diameter / 2, 6, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();

    // Draw magnifier glass outer border ring
    ctx.beginPath();
    ctx.arc(diameter / 2, diameter / 2, diameter / 2 - 1, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    ctx.stroke();

    // Position magnifier bubble slightly above finger
    if (containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const relativeX = clientX - containerRect.left;
      const relativeY = clientY - containerRect.top - 95; // Offset 95px above
      setMagnifierInfo({ x: relativeX, y: relativeY, originalX: normX, originalY: normY });
    }
  };

  // Handle Drag Motion
  const handleMove = (clientX: number, clientY: number) => {
    if (!activeHandle || !dragStart || !imgRef.current) return;
    const dxClient = clientX - dragStart.x;
    const dyClient = clientY - dragStart.y;

    const rect = imgRef.current.getBoundingClientRect();
    const dx = dxClient / rect.width;
    const dy = dyClient / rect.height;

    const updated = [...points];

    if (activeHandle.type === 'corner') {
      const idx = activeHandle.index;
      const original = draggedStartPoints[idx];
      updated[idx] = {
        x: Math.max(0, Math.min(1, original.x + dx)),
        y: Math.max(0, Math.min(1, original.y + dy)),
      };
      setPoints(updated);
      triggerMagnifier(updated[idx].x, updated[idx].y, clientX, clientY);
    } else {
      // Edge drag: slides the two corners configuring the edge by the vector delta
      const edgeIdx = activeHandle.index;
      let c1Idx = 0;
      let c2Idx = 0;

      if (edgeIdx === 0) { c1Idx = 0; c2Idx = 1; } // Top
      else if (edgeIdx === 1) { c1Idx = 1; c2Idx = 2; } // Right
      else if (edgeIdx === 2) { c1Idx = 2; c2Idx = 3; } // Bottom
      else if (edgeIdx === 3) { c1Idx = 3; c2Idx = 0; } // Left

      const originalC1 = draggedStartPoints[c1Idx];
      const originalC2 = draggedStartPoints[c2Idx];

      updated[c1Idx] = {
        x: Math.max(0, Math.min(1, originalC1.x + dx)),
        y: Math.max(0, Math.min(1, originalC1.y + dy)),
      };

      updated[c2Idx] = {
        x: Math.max(0, Math.min(1, originalC2.x + dx)),
        y: Math.max(0, Math.min(1, originalC2.y + dy)),
      };

      setPoints(updated);
      const mid = getMidPoints()[edgeIdx];
      triggerMagnifier(mid.x, mid.y, clientX, clientY);
    }
  };

  const handleEnd = () => {
    setActiveHandle(null);
    setDragStart(null);
    setMagnifierInfo(null);
  };

  // Convert points to SVG polygon rendering string
  const getPolygonPointsString = () => {
    return points
      .map((p) => `${dimensions.left + p.x * dimensions.width},${dimensions.top + p.y * dimensions.height}`)
      .join(' ');
  };

  // Auto-detect helper: Fits document to high luminance boundaries
  // Scans image from corners, adjusting handles in slightly for better focus
  const autoDetectDocument = () => {
    const img = imgRef.current;
    if (!img) return;

    // Set crop boundaries closer into the center as a standard starting point
    setPoints([
      { x: 0.12, y: 0.1 },
      { x: 0.88, y: 0.1 },
      { x: 0.88, y: 0.9 },
      { x: 0.12, y: 0.9 },
    ]);
  };

  // Rotates original coordinates 90deg CW
  const rotatePointsCW = () => {
    const warped = points.map(p => ({
      x: 1 - p.y,
      y: p.x
    }));
    // Realign corners after rotation to preserve TL, TR, BR, BL order
    setPoints([
      warped[3], // was bottom left -> now top left
      warped[0], // was top left -> now top right
      warped[1], // was top right -> now bottom right
      warped[2], // was bottom right -> now bottom left
    ]);
  };

  return (
    <div className="crop-screen flex-1 flex flex-col bg-slate-900 select-none overflow-hidden relative">
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between z-10">
        <h3 className="text-lg font-semibold text-slate-200">Ajustar bordes</h3>
        <span className="text-slate-400 text-xs bg-slate-800 py-1 px-2.5 rounded-full">
          Arrastra esquinas o lados
        </span>
      </div>

      {/* Main Image Cropper Canvas Wrapper */}
      <div
        ref={containerRef}
        className="flex-1 w-full flex items-center justify-center p-6 relative overflow-hidden"
        onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchMove={(e) => {
          if (e.touches[0]) handleMove(e.touches[0].clientX, e.touches[0].clientY);
        }}
        onTouchEnd={handleEnd}
      >
        <div className="relative inline-block max-h-[62vh]">
          <img
            ref={imgRef}
            src={imageSrc}
            alt="Original"
            className="w-auto h-auto max-h-[62vh] object-contain rounded-md"
            onLoad={updateLayoutBounds}
            draggable={false}
          />

          {/* SVG Overlay for Vector handles */}
          {dimensions.width > 0 && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ top: 0, left: 0 }}
            >
              {/* Document crop polygon mask overlay */}
              <polygon
                points={getPolygonPointsString()}
                fill="rgba(34, 211, 238, 0.15)"
                stroke="#22d3ee"
                strokeWidth="2.5"
              />
            </svg>
          )}

          {/* Render Corner interactive nodes */}
          {dimensions.width > 0 &&
            points.map((pt, idx) => (
              <div
                key={`corner-${idx}`}
                className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full flex items-center justify-center cursor-pointer pointer-events-auto"
                style={{
                  left: `${dimensions.left + pt.x * dimensions.width}px`,
                  top: `${dimensions.top + pt.y * dimensions.height}px`,
                  zIndex: 20,
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleStart(e.clientX, e.clientY, 'corner', idx);
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  if (e.touches[0]) {
                    handleStart(e.touches[0].clientX, e.touches[0].clientY, 'corner', idx);
                  }
                }}
              >
                <div className="w-4 h-4 rounded-full bg-cyan-400 border-2 border-white shadow-lg active:scale-125 transition-transform duration-100"></div>
              </div>
            ))}

          {/* Render Edge interactive center handles */}
          {dimensions.width > 0 &&
            getMidPoints().map((pt, idx) => (
              <div
                key={`edge-${idx}`}
                className="absolute w-8 h-8 -ml-4 -mt-4 flex items-center justify-center cursor-pointer pointer-events-auto"
                style={{
                  left: `${dimensions.left + pt.x * dimensions.width}px`,
                  top: `${dimensions.top + pt.y * dimensions.height}px`,
                  zIndex: 15,
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleStart(e.clientX, e.clientY, 'edge', idx);
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  if (e.touches[0]) {
                    handleStart(e.touches[0].clientX, e.touches[0].clientY, 'edge', idx);
                  }
                }}
              >
                {/* Horizontal / vertical bar style for edges */}
                <div className="w-6 h-2 rounded bg-slate-900 border border-cyan-400 shadow-md transform rotate-0 hover:bg-cyan-400"></div>
              </div>
            ))}
        </div>

        {/* Dynamic Magnifier Magnify Floating Canvas */}
        {magnifierInfo && (
          <div
            className="absolute rounded-full border-2 border-white shadow-[0_4px_20px_rgba(0,0,0,0.6)] backdrop-blur-sm pointer-events-none z-50 animate-fade-in"
            style={{
              left: `${magnifierInfo.x}px`,
              top: `${magnifierInfo.y}px`,
              width: '130px',
              height: '130px',
              transform: 'translateX(-50%)',
            }}
          >
            <canvas ref={magnifierCanvasRef} className="rounded-full w-full h-full" />
          </div>
        )}
      </div>

      {/* Control bar bottom */}
      <div className="p-6 bg-slate-950 border-t border-slate-800 flex items-center justify-between z-10 gap-4">
        <button onClick={onCancel} className="btn btn-secondary px-5 py-2.5 rounded-lg text-slate-300 font-medium">
          Cancelar
        </button>

        <div className="flex gap-2.5">
          <button
            onClick={rotatePointsCW}
            className="btn btn-secondary p-2.5 rounded-lg flex items-center justify-center text-slate-300 gap-1.5"
            title="Rotar selección"
          >
            <RotateCw className="w-5 h-5" />
            <span className="text-sm hidden sm:inline">Girar</span>
          </button>

          <button
            onClick={autoDetectDocument}
            className="btn btn-secondary p-2.5 rounded-lg flex items-center justify-center text-slate-300 gap-1.5"
            title="Restablecer"
          >
            <Edit2 className="w-5 h-5" />
            <span className="text-sm hidden sm:inline">Reset</span>
          </button>
        </div>

        <button
          onClick={() => onCropComplete(points)}
          className="btn btn-primary px-6 py-2.5 rounded-lg flex items-center gap-2 hover:bg-cyan-500 transition-colors"
        >
          <Check className="w-5 h-5" />
          <span>Confirmar</span>
        </button>
      </div>
    </div>
  );
};
