import React, { useState, useRef } from 'react';
import { Trash2, Type, Check } from 'lucide-react';
import type { TextLayer } from '../services/db';


interface TextLayerEditorProps {
  texts: TextLayer[];
  onChange: (updatedTexts: TextLayer[]) => void;
  imageWidth: number;
  imageHeight: number;
  active: boolean;
}

export const TextLayerEditor: React.FC<TextLayerEditorProps> = ({
  texts,
  onChange,
  imageWidth,
  imageHeight,
  active,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; textX: number; textY: number } | null>(null);

  const colors = [
    '#000000', // Black
    '#ffffff', // White
    '#ef4444', // Red
    '#3b82f6', // Blue
    '#22c55e', // Green
    '#eab308', // Yellow
    '#a855f7', // Purple
  ];

  // Deselect when clicking empty space
  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (e.target === containerRef.current) {
      setSelectedTextId(null);
      setEditingTextId(null);
    }
  };

  // Add a new text box
  const handleAddText = () => {
    const newId = `text-${Date.now()}`;
    const newText: TextLayer = {
      id: newId,
      text: 'Escribe aquí...',
      x: 35, // center x percentage
      y: 40, // center y percentage
      size: 22,
      color: '#ef4444', // default red
    };

    onChange([...texts, newText]);
    setSelectedTextId(newId);
    setEditingTextId(newId);
  };

  // Delete selected text box
  const handleDeleteText = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(texts.filter((t) => t.id !== id));
    if (selectedTextId === id) {
      setSelectedTextId(null);
      setEditingTextId(null);
    }
  };

  // Handle Drag Start
  const handleDragStart = (
    id: string,
    clientX: number,
    clientY: number,
    textX: number,
    textY: number,
    e: React.MouseEvent | React.TouchEvent
  ) => {
    if (editingTextId === id) return; // Don't drag while typing
    e.stopPropagation();
    setSelectedTextId(id);
    setDragStart({
      x: clientX,
      y: clientY,
      textX,
      textY,
    });
  };

  // Handle Drag Move
  const handleDragMove = (clientX: number, clientY: number) => {
    if (!dragStart || !selectedTextId || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const dxPercentage = ((clientX - dragStart.x) / rect.width) * 100;
    const dyPercentage = ((clientY - dragStart.y) / rect.height) * 100;

    const updated = texts.map((t) => {
      if (t.id === selectedTextId) {
        return {
          ...t,
          x: Math.max(0, Math.min(90, dragStart.textX + dxPercentage)),
          y: Math.max(0, Math.min(95, dragStart.textY + dyPercentage)),
        };
      }
      return t;
    });

    onChange(updated);
  };

  const handleDragEnd = () => {
    setDragStart(null);
  };

  // Update text box attributes
  const updateTextProp = (id: string, props: Partial<TextLayer>) => {
    const updated = texts.map((t) => {
      if (t.id === id) {
        return { ...t, ...props };
      }
      return t;
    });
    onChange(updated);
  };

  const selectedText = texts.find((t) => t.id === selectedTextId);

  return (
    <div className="absolute inset-0 pointer-events-none z-30" style={{ width: `${imageWidth}px`, height: `${imageHeight}px` }}>
      {/* Draggable container surface */}
      <div
        ref={containerRef}
        className="w-full h-full relative pointer-events-auto"
        onClick={handleBackgroundClick}
        onMouseMove={(e) => handleDragMove(e.clientX, e.clientY)}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
        onTouchMove={(e) => {
          if (e.touches[0]) handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
        }}
        onTouchEnd={handleDragEnd}
      >
        {/* Render individual text nodes */}
        {texts.map((t) => {
          const isSelected = t.id === selectedTextId;
          const isEditing = t.id === editingTextId;

          return (
            <div
              key={t.id}
              className={`absolute select-none group pointer-events-auto cursor-move rounded px-2 py-1 ${
                isSelected ? 'border-2 border-dashed border-cyan-400 bg-cyan-950/20' : 'border-2 border-transparent hover:border-slate-800'
              }`}
              style={{
                left: `${t.x}%`,
                top: `${t.y}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: isSelected ? 40 : 30,
              }}
              onMouseDown={(e) => handleDragStart(t.id, e.clientX, e.clientY, t.x, t.y, e)}
              onTouchStart={(e) => {
                if (e.touches[0]) {
                  handleDragStart(t.id, e.touches[0].clientX, e.touches[0].clientY, t.x, t.y, e);
                }
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingTextId(t.id);
              }}
            >
              {isEditing ? (
                <div className="flex items-center gap-1.5 pointer-events-auto">
                  <input
                    type="text"
                    value={t.text}
                    onChange={(e) => updateTextProp(t.id, { text: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setEditingTextId(null);
                      }
                    }}
                    autoFocus
                    className="bg-slate-900 text-white rounded border border-slate-700 px-2 py-1 text-sm outline-none w-44"
                    style={{ fontSize: `${t.size}px`, color: t.color }}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingTextId(null);
                    }}
                    className="bg-cyan-500 hover:bg-cyan-600 text-white p-1 rounded"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <span
                  style={{
                    fontSize: `${t.size}px`,
                    color: t.color,
                    fontWeight: 'bold',
                    textShadow: t.color === '#ffffff' 
                      ? '0 1px 4px rgba(0,0,0,0.8), 0 0 1px rgba(0,0,0,0.9)' 
                      : '0 1px 2px rgba(255,255,255,0.7), 0 0 1px rgba(255,255,255,0.8)',
                  }}
                >
                  {t.text}
                </span>
              )}

              {/* Close delete button badge for active items */}
              {isSelected && !isEditing && (
                <button
                  onClick={(e) => handleDeleteText(t.id, e)}
                  className="absolute -top-3.5 -right-3.5 bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-full shadow-md transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Floating Plus/Text panel (Only active when text edit state is opened) */}
      {active && (
        <div className="absolute -bottom-16 left-1/2 transform -translate-x-1/2 bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex items-center gap-4 shadow-[0_10px_25px_rgba(0,0,0,0.5)] z-50 pointer-events-auto backdrop-blur-md w-[90vw] max-w-[480px]">
          <button
            onClick={handleAddText}
            className="flex items-center gap-1.5 text-xs bg-cyan-500 hover:bg-cyan-600 text-white px-3 py-2 rounded-lg font-medium transition-all mr-2 whitespace-nowrap"
          >
            <Type className="w-4 h-4" />
            + Agregar texto
          </button>

          {selectedText && (
            <div className="flex items-center gap-4 flex-1 justify-between">
              {/* Sizing slider */}
              <div className="flex items-center gap-2 flex-grow max-w-[140px]">
                <span className="text-[10px] text-slate-400 font-semibold uppercase">Tamaño</span>
                <input
                  type="range"
                  min="12"
                  max="60"
                  value={selectedText.size}
                  onChange={(e) => updateTextProp(selectedText.id, { size: parseInt(e.target.value) })}
                  className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Color dots grid */}
              <div className="flex gap-1.5">
                {colors.map((c) => (
                  <button
                    key={c}
                    onClick={() => updateTextProp(selectedText.id, { color: c })}
                    className={`w-6 h-6 rounded-full border shadow-sm transition-transform active:scale-90 ${
                      selectedText.color === c ? 'scale-125 border-white ring-2 ring-cyan-500/50' : 'border-slate-800 hover:scale-110'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
