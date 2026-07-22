import React, { useRef, useState, useEffect } from 'react';

interface ZoomableImageProps {
  src: string;
  alt?: string;
  className?: string;
}

export const ZoomableImage: React.FC<ZoomableImageProps> = ({ src, alt = '', className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [lastDist, setLastDist] = useState<number | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  // Reset scale and offset when image source changes
  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [src]);

  // Wheel zoom for desktop / mouse
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY;
    const factor = delta > 0 ? 1.1 : 0.9;
    setScale((prev) => {
      const nextScale = Math.min(5, Math.max(1, prev * factor));
      if (nextScale === 1) setOffset({ x: 0, y: 0 });
      return nextScale;
    });
  };

  // Touch pinch‑zoom for mobile touchscreens
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      const dist = Math.hypot(dx, dy);
      if (lastDist !== null) {
        const diff = dist - lastDist;
        const factor = diff > 0 ? 1.03 : 0.97;
        setScale((prev) => {
          const nextScale = Math.min(5, Math.max(1, prev * factor));
          if (nextScale === 1) setOffset({ x: 0, y: 0 });
          return nextScale;
        });
      }
      setLastDist(dist);
    }
  };

  const handleTouchEnd = () => setLastDist(null);

  // Touch/pointer dragging for panning when zoomed in
  const handlePointerDown = (e: React.PointerEvent) => {
    if (scale > 1) {
      try {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch (_) {}
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragStart && scale > 1) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragStart) {
      try {
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch (_) {}
      setDragStart(null);
    }
  };

  // Double tap to quickly zoom in/out
  const handleDoubleClick = () => {
    if (scale > 1) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
    } else {
      setScale(2.5);
    }
  };

  // Prevent default page scrolling when pinching
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const prevent = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    el.addEventListener('touchmove', prevent, { passive: false });
    return () => el.removeEventListener('touchmove', prevent);
  }, []);

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      style={{
        overflow: 'hidden',
        touchAction: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      <img
        src={src}
        alt={alt}
        className={className}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transition: dragStart ? 'none' : 'transform 0.15s ease-out',
          transformOrigin: 'center center',
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          display: 'block',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
