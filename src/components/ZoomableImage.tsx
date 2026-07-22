import React, { useRef, useState, useEffect } from 'react';

interface ZoomableImageProps {
  src: string;
  alt?: string;
  className?: string;
}

export const ZoomableImage: React.FC<ZoomableImageProps> = ({ src, alt = '', className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [lastDist, setLastDist] = useState<number | null>(null);

  // Wheel zoom for desktop
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY;
    const factor = delta > 0 ? 1.05 : 0.95;
    setScale(prev => Math.min(5, Math.max(1, prev * factor)));
  };

  // Pinch‑zoom for touch devices
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      const dist = Math.hypot(dx, dy);
      if (lastDist !== null) {
        const diff = dist - lastDist;
        const factor = diff > 0 ? 1.02 : 0.98;
        setScale(prev => Math.min(5, Math.max(1, prev * factor)));
      }
      setLastDist(dist);
    }
  };

  const handleTouchEnd = () => setLastDist(null);

  // Prevent page‑level pinch‑zoom when interacting with the image
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const prevent = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
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
      style={{
        overflow: 'hidden',
        touchAction: 'none',
        display: 'inline-block',
        transform: `scale(${scale})`,
        transition: 'transform 0.1s ease-out',
        transformOrigin: 'center center',
      }}
    >
      <img src={src} alt={alt} className={className} />
    </div>
  );
};
