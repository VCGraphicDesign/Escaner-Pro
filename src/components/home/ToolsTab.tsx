/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Wrench, 
  ArrowLeft, 
  AlertCircle, 
  Crop, 
  Eraser, 
  Upload, 
  Download, 
  Save, 
  Undo, 
  Check, 
  FolderOpen, 
  ChevronRight, 
  Sparkles,
  FileText,
  Layers,
  ArrowUp,
  ArrowDown,
  Trash2,
  Sliders,
  Plus
} from 'lucide-react';
import { DocumentItem, ScannedPage, CropPoints } from '../../types';
import { getDocuments, saveDocument, createDefaultAdjustments } from '../../services/documentStore';
import { applyPerspectiveCrop, loadImage, processPageImage } from '../../services/imageProcessor';
import CropTool from '../clean/CropTool';

interface ToolsTabProps {
  onStartNewScan: () => void;
}

type ActiveToolType = 'none' | 'recortar' | 'borrar' | 'combinar' | 'mejorar';

export default function ToolsTab({ onStartNewScan }: ToolsTabProps) {
  const [activeTool, setActiveTool] = useState<ActiveToolType>('none');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>('imagen_herramienta');
  
  // Para seleccionar de documentos existentes
  const [showDocSelector, setShowDocSelector] = useState(false);
  const [availableDocs, setAvailableDocs] = useState<DocumentItem[]>([]);

  // Estados para herramienta RECORTAR
  const [cropPoints, setCropPoints] = useState<CropPoints>({
    topLeft: { x: 0.1, y: 0.1 },
    topRight: { x: 0.9, y: 0.1 },
    bottomRight: { x: 0.9, y: 0.9 },
    bottomLeft: { x: 0.1, y: 0.9 },
  });
  const [croppedResult, setCroppedResult] = useState<string | null>(null);

  // Estados para herramienta BORRAR
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [brushSize, setBrushSize] = useState<number>(24);
  const [eraserColor, setEraserColor] = useState<string>('#ffffff'); // blanco papel por defecto
  const [undoHistory, setUndoHistory] = useState<string[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [editedResult, setEditedResult] = useState<string | null>(null);

  // --- ESTADOS PARA COMBINAR ARCHIVOS ---
  const [selectedDocsToCombine, setSelectedDocsToCombine] = useState<DocumentItem[]>([]);
  const [combinedDocName, setCombinedDocName] = useState('Documento Combinado');

  // --- ESTADOS PARA MEJORAR IMAGEN ---
  const [improvementAdjustments, setImprovementAdjustments] = useState({
    brightness: 100,
    contrast: 110,
    sharpness: 50,
    filter: 'auto' as 'original' | 'auto' | 'bw' | 'grayscale' | 'enhanced' | 'gamma',
  });
  const [improving, setImproving] = useState(false);
  const [improvedImagePreview, setImprovedImagePreview] = useState<string | null>(null);

  // Cargar documentos del local store para el selector
  useEffect(() => {
    if (showDocSelector || activeTool === 'combinar') {
      setAvailableDocs(getDocuments());
    }
  }, [showDocSelector, activeTool]);

  // Manejar subida de archivo local
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    
    // Guardar el nombre original sin extensión
    const cleanName = file.name.replace(/\.[^/.]+$/, "");
    setImageName(cleanName);

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setSelectedImage(event.target.result as string);
        resetToolStates();
      }
    };
    reader.readAsDataURL(file);
  };

  const resetToolStates = () => {
    setCroppedResult(null);
    setEditedResult(null);
    setUndoHistory([]);
    setCropPoints({
      topLeft: { x: 0.1, y: 0.1 },
      topRight: { x: 0.9, y: 0.1 },
      bottomRight: { x: 0.9, y: 0.9 },
      bottomLeft: { x: 0.1, y: 0.9 },
    });
    setImprovementAdjustments({
      brightness: 100,
      contrast: 110,
      sharpness: 50,
      filter: 'auto',
    });
    setImprovedImagePreview(null);
  };

  // Seleccionar una página de un documento escaneado (para Recortar/Borrar/Mejorar)
  const handleSelectPage = (page: ScannedPage, docName: string, index: number) => {
    setSelectedImage(page.processedImage);
    setImageName(`${docName}_Pág${index + 1}_editado`);
    setShowDocSelector(false);
    resetToolStates();
  };

  // Volver a la lista de herramientas
  const handleBackToMenu = () => {
    setActiveTool('none');
    setSelectedImage(null);
    resetToolStates();
    setShowDocSelector(false);
    setSelectedDocsToCombine([]);
    setCombinedDocName('Documento Combinado');
  };

  // --- LÓGICA DE RECORTAR (PERSPECTIVA) ---
  const handleApplyCrop = async () => {
    if (!selectedImage) return;
    try {
      const img = await loadImage(selectedImage);
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = img.naturalWidth;
      srcCanvas.height = img.naturalHeight;
      const ctx = srcCanvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);

      const destCanvas = document.createElement('canvas');
      applyPerspectiveCrop(srcCanvas, destCanvas, cropPoints);
      
      const dataUrl = destCanvas.toDataURL('image/jpeg', 0.9);
      setCroppedResult(dataUrl);
    } catch (err) {
      console.error('Error aplicando recorte', err);
    }
  };

  // --- LÓGICA DE BORRADOR (CORRECTOR) ---
  useEffect(() => {
    if (activeTool === 'borrar' && selectedImage && canvasRef.current && !editedResult) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = selectedImage;
      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
        // Guardar estado inicial para deshacer
        setUndoHistory([canvas.toDataURL()]);
      };
    }
  }, [activeTool, selectedImage, editedResult]);

  const getCanvasCoordinates = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    // Mapear coordenadas de pantalla a la resolución real del canvas
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    
    const pos = getCanvasCoordinates(e);
    lastPos.current = pos;
    setIsDrawing(true);

    const currentState = canvas.toDataURL();
    setUndoHistory(prev => [...prev.slice(-9), currentState]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentPos = getCanvasCoordinates(e);

    ctx.beginPath();
    ctx.strokeStyle = eraserColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(currentPos.x, currentPos.y);
    ctx.stroke();

    lastPos.current = currentPos;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDrawing && canvasRef.current) {
      canvasRef.current.releasePointerCapture(e.pointerId);
      setIsDrawing(false);
    }
  };

  const handleUndo = () => {
    if (undoHistory.length === 0 || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const previousStates = [...undoHistory];
    const prevStateDataUrl = previousStates.pop();
    if (!prevStateDataUrl) return;

    const img = new Image();
    img.src = prevStateDataUrl;
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      setUndoHistory(previousStates);
    };
  };

  const handleApplyEraser = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.9);
    setEditedResult(dataUrl);
  };

  // --- LÓGICA DE MEJORAR IMAGEN (PREVIEW EN TIEMPO REAL) ---
  useEffect(() => {
    if (activeTool === 'mejorar' && selectedImage) {
      let isCurrent = true;
      setImproving(true);
      const process = async () => {
        try {
          const res = await processPageImage(selectedImage, {
            brightness: improvementAdjustments.brightness,
            contrast: improvementAdjustments.contrast,
            sharpness: improvementAdjustments.sharpness,
            filter: improvementAdjustments.filter,
            rotation: 0,
            crop: null,
          });
          if (isCurrent) {
            setImprovedImagePreview(res);
            setImproving(false);
          }
        } catch (e) {
          console.error(e);
          if (isCurrent) setImproving(false);
        }
      };

      const timer = setTimeout(process, 150); // Debounce de 150ms
      return () => {
        isCurrent = false;
        clearTimeout(timer);
      };
    }
  }, [activeTool, selectedImage, improvementAdjustments]);

  // --- LÓGICA DE COMBINAR ARCHIVOS ---
  const handleAddDocToCombine = (doc: DocumentItem) => {
    setSelectedDocsToCombine(prev => [...prev, doc]);
  };

  const handleRemoveDocFromCombine = (index: number) => {
    setSelectedDocsToCombine(prev => prev.filter((_, i) => i !== index));
  };

  const handleMoveDocInCombine = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === selectedDocsToCombine.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const newList = [...selectedDocsToCombine];
    const temp = newList[index];
    newList[index] = newList[targetIndex];
    newList[targetIndex] = temp;
    setSelectedDocsToCombine(newList);
  };

  const handleMergeDocuments = () => {
    if (selectedDocsToCombine.length < 2) {
      alert('Por favor selecciona al menos 2 documentos para poder combinarlos.');
      return;
    }

    // Copiar y aplanar todas las páginas con nuevos IDs para evitar colisiones
    const mergedPages: ScannedPage[] = [];
    selectedDocsToCombine.forEach((doc) => {
      doc.pages.forEach((page) => {
        mergedPages.push({
          ...page,
          id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          adjustments: JSON.parse(JSON.stringify(page.adjustments)),
        });
      });
    });

    const newMergedDoc: DocumentItem = {
      id: `doc_${Date.now()}`,
      name: combinedDocName.trim() || 'Documento Combinado',
      createdAt: new Date().toISOString(),
      pages: mergedPages,
    };

    saveDocument(newMergedDoc);
    alert(`¡Éxito! Se han combinado ${selectedDocsToCombine.length} documentos en "${newMergedDoc.name}".`);
    handleBackToMenu();
  };

  // --- LÓGICA DE GUARDAR / EXPORTAR ---
  const handleDownload = (dataUrl: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${imageName}_editado.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveToDocuments = (dataUrl: string) => {
    const newPage: ScannedPage = {
      id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      originalImage: dataUrl,
      processedImage: dataUrl,
      adjustments: createDefaultAdjustments(),
    };

    const newDoc: DocumentItem = {
      id: `doc_${Date.now()}`,
      name: imageName.trim() || 'Documento Editado',
      createdAt: new Date().toISOString(),
      pages: [newPage],
    };

    saveDocument(newDoc);
    alert('¡Guardado exitosamente en tus documentos de Escáner Pro!');
    handleBackToMenu();
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-white pb-12">
      {/* MENU PRINCIPAL DE HERRAMIENTAS */}
      {activeTool === 'none' && (
        <>
          {/* Opciones de Herramientas */}
          <div className="flex flex-col gap-4">
            {/* Opción Recortar */}
            <button
              onClick={() => {
                setActiveTool('recortar');
                resetToolStates();
              }}
              className="flex items-center gap-4 p-4 rounded-xl border border-[#2C2C2E] bg-[#1C1C1E] hover:bg-[#2C2C2E]/60 hover:border-[#2979FF]/40 transition-all text-left group"
            >
              <div className="p-3 rounded-xl bg-[#2979FF]/10 text-[#2979FF] group-hover:scale-105 transition-transform">
                <Crop size={24} />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-white">Recortar Perspectiva</h4>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Corrige fotos inclinadas ajustando las 4 esquinas manualmente de forma precisa.
                </p>
              </div>
              <ChevronRight size={18} className="text-gray-500 group-hover:text-white transition-colors" />
            </button>

            {/* Opción Borrar */}
            <button
              onClick={() => {
                setActiveTool('borrar');
                resetToolStates();
              }}
              className="flex items-center gap-4 p-4 rounded-xl border border-[#2C2C2E] bg-[#1C1C1E] hover:bg-[#2C2C2E]/60 hover:border-[#2979FF]/40 transition-all text-left group"
            >
              <div className="p-3 rounded-xl bg-[#E040FB]/10 text-[#E040FB] group-hover:scale-105 transition-transform">
                <Eraser size={24} />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-white">Borrar y Corregir</h4>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Pinta con pincel blanco/negro para censurar o limpiar imperfecciones sutiles.
                </p>
              </div>
              <ChevronRight size={18} className="text-gray-500 group-hover:text-white transition-colors" />
            </button>

            {/* Opción Combinar Archivos */}
            <button
              onClick={() => {
                setActiveTool('combinar');
                resetToolStates();
              }}
              className="flex items-center gap-4 p-4 rounded-xl border border-[#2C2C2E] bg-[#1C1C1E] hover:bg-[#2C2C2E]/60 hover:border-[#2979FF]/40 transition-all text-left group"
            >
              <div className="p-3 rounded-xl bg-[#00E676]/10 text-[#00E676] group-hover:scale-105 transition-transform">
                <Layers size={24} />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-white">Combinar Archivos</h4>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Une varias páginas o múltiples documentos escaneados independientes en un único archivo.
                </p>
              </div>
              <ChevronRight size={18} className="text-gray-500 group-hover:text-white transition-colors" />
            </button>

            {/* Opción Mejorar Imagen */}
            <button
              onClick={() => {
                setActiveTool('mejorar');
                resetToolStates();
              }}
              className="flex items-center gap-4 p-4 rounded-xl border border-[#2C2C2E] bg-[#1C1C1E] hover:bg-[#2C2C2E]/60 hover:border-[#2979FF]/40 transition-all text-left group"
            >
              <div className="p-3 rounded-xl bg-[#FFD600]/10 text-[#FFD600] group-hover:scale-105 transition-transform">
                <Sparkles size={24} />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-white">Mejorar Claridad</h4>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Aplica filtros avanzados, aumenta la nitidez y elimina sombras para que el texto sea nítido y legible.
                </p>
              </div>
              <ChevronRight size={18} className="text-gray-500 group-hover:text-white transition-colors" />
            </button>
          </div>
        </>
      )}

      {/* VISTA ACTIVA DE LA HERRAMIENTA */}
      {activeTool !== 'none' && (
        <div className="flex flex-col gap-5">
          {/* Cabecera del Editor */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleBackToMenu}
              className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-[#2C2C2E] rounded-xl transition-all"
              title="Volver"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h3 className="text-xs font-bold text-[#2979FF] uppercase tracking-widest flex items-center gap-2">
                <Wrench size={14} />
                Herramienta
              </h3>
              <h2 className="text-base font-bold text-white capitalize">
                {activeTool === 'recortar' && 'Recortar Perspectiva'}
                {activeTool === 'borrar' && 'Borrar e Limpiar'}
                {activeTool === 'combinar' && 'Combinar Archivos'}
                {activeTool === 'mejorar' && 'Mejorar Claridad'}
              </h2>
            </div>
          </div>

          {/* HERRAMIENTA: COMBINAR ARCHIVOS */}
          {activeTool === 'combinar' && (
            <div className="flex flex-col gap-4 animate-fade-in">
              <p className="text-xs text-gray-400">
                Selecciona los documentos que deseas unir. Podrás ordenarlos antes de generar el documento final unificado.
              </p>

              {/* Documentos Seleccionados en Orden */}
              <div className="border border-[#2C2C2E] rounded-2xl bg-[#1C1C1E] p-4 flex flex-col gap-3">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                  Archivos en Cola de Fusión ({selectedDocsToCombine.length})
                </span>

                {selectedDocsToCombine.length === 0 ? (
                  <div className="text-center py-6 text-xs text-gray-500">
                    Ningún archivo seleccionado. Añade archivos del listado de abajo.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {selectedDocsToCombine.map((doc, idx) => (
                      <div 
                        key={`${doc.id}_combine_${idx}`}
                        className="flex items-center gap-3 p-3 rounded-xl bg-neutral-900 border border-[#2C2C2E]/60"
                      >
                        <div className="w-8 h-8 rounded-lg bg-[#2979FF]/10 text-[#2979FF] flex items-center justify-center font-bold text-xs shrink-0">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-white truncate">{doc.name}</h4>
                          <span className="text-[10px] text-gray-500">{doc.pages.length} {doc.pages.length === 1 ? 'página' : 'páginas'}</span>
                        </div>
                        
                        {/* Controles de ordenamiento */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleMoveDocInCombine(idx, 'up')}
                            disabled={idx === 0}
                            className={`p-1.5 rounded-lg transition-colors ${idx === 0 ? 'text-gray-700' : 'text-gray-400 hover:text-white hover:bg-[#2C2C2E]'}`}
                            title="Subir"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            onClick={() => handleMoveDocInCombine(idx, 'down')}
                            disabled={idx === selectedDocsToCombine.length - 1}
                            className={`p-1.5 rounded-lg transition-colors ${idx === selectedDocsToCombine.length - 1 ? 'text-gray-700' : 'text-gray-400 hover:text-white hover:bg-[#2C2C2E]'}`}
                            title="Bajar"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            onClick={() => handleRemoveDocFromCombine(idx)}
                            className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                            title="Quitar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Entrada del Nombre Unificado */}
              {selectedDocsToCombine.length >= 2 && (
                <div className="flex flex-col gap-1.5 px-1 animate-fade-in">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Nombre del Documento Combinado</label>
                  <input 
                    type="text"
                    value={combinedDocName}
                    onChange={(e) => setCombinedDocName(e.target.value)}
                    placeholder="Escribe el nombre del nuevo archivo..."
                    className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#2979FF]"
                  />
                  
                  <button
                    onClick={handleMergeDocuments}
                    className="w-full mt-2 py-3 px-4 rounded-xl text-xs font-bold bg-[#00E676] hover:bg-[#00E676]/90 text-neutral-950 flex items-center justify-center gap-1.5 shadow-lg shadow-[#00E676]/20 transition-all"
                  >
                    <Check size={14} strokeWidth={3} />
                    Combinar en un Solo Archivo
                  </button>
                </div>
              )}

              {/* Documentos Disponibles para Agregar */}
              <div className="border border-[#2C2C2E] rounded-2xl bg-[#1C1C1E] p-4 flex flex-col gap-3">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                  Selecciona Documentos para Añadir
                </span>

                {availableDocs.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-6">No tienes documentos guardados aún.</p>
                ) : (
                  <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto">
                    {availableDocs.map((doc) => (
                      <div 
                        key={doc.id}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-900/40 border border-[#2C2C2E]/40 hover:bg-neutral-900 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText size={16} className="text-[#2979FF] shrink-0" />
                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-white block truncate">{doc.name}</span>
                            <span className="text-[9px] text-gray-500">{doc.pages.length} {doc.pages.length === 1 ? 'pág' : 'págs'}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleAddDocToCombine(doc)}
                          className="p-1.5 rounded-lg bg-[#2979FF]/10 text-[#2979FF] hover:bg-[#2979FF] hover:text-white transition-all flex items-center gap-1 text-[10px] font-bold"
                        >
                          <Plus size={12} strokeWidth={3} />
                          Añadir
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PASO 1: SELECCIONAR IMAGEN (PARA RECORTAR / BORRAR / MEJORAR) */}
          {activeTool !== 'combinar' && !selectedImage && (
            <div className="flex flex-col gap-4 animate-fade-in">
              <p className="text-xs text-gray-400">
                Selecciona una foto existente o sube una nueva imagen para comenzar a procesar.
              </p>

              <div className="grid grid-cols-2 gap-4">
                {/* Botón Subir Archivo */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-6 rounded-2xl border border-dashed border-[#2C2C2E] bg-[#1C1C1E]/40 hover:bg-[#1C1C1E] hover:border-[#2979FF]/50 transition-all gap-3 group text-center"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#2979FF]/10 text-[#2979FF] flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Upload size={22} />
                  </div>
                  <div>
                    <span className="text-xs font-bold block text-white">Subir Imagen</span>
                    <span className="text-[10px] text-gray-500 block mt-0.5">Formatos JPG, PNG</span>
                  </div>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  className="hidden"
                />

                {/* Botón Elegir de Escaneos */}
                <button
                  onClick={() => setShowDocSelector(true)}
                  className="flex flex-col items-center justify-center p-6 rounded-2xl border border-dashed border-[#2C2C2E] bg-[#1C1C1E]/40 hover:bg-[#1C1C1E] hover:border-[#2979FF]/50 transition-all gap-3 group text-center"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#E040FB]/10 text-[#E040FB] flex items-center justify-center group-hover:scale-110 transition-transform">
                    <FolderOpen size={22} />
                  </div>
                  <div>
                    <span className="text-xs font-bold block text-white">Elegir de Escaneos</span>
                    <span className="text-[10px] text-gray-500 block mt-0.5">Tus documentos guardados</span>
                  </div>
                </button>
              </div>

              {/* Selector de Páginas de Documentos Guardados */}
              {showDocSelector && (
                <div className="border border-[#2C2C2E] rounded-2xl bg-[#1C1C1E] p-4 flex flex-col gap-3 animate-fade-in max-h-[350px] overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      Tus Documentos Guardados
                    </span>
                    <button 
                      onClick={() => setShowDocSelector(false)}
                      className="text-[11px] text-[#2979FF] hover:underline"
                    >
                      Cerrar
                    </button>
                  </div>
                  {availableDocs.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-6">No tienes documentos guardados aún.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {availableDocs.map((doc) => (
                        <div key={doc.id} className="border-b border-[#2C2C2E]/50 pb-2 last:border-b-0">
                          <div className="flex items-center gap-2 mb-1.5 px-1">
                            <FileText size={14} className="text-[#2979FF]" />
                            <span className="text-xs font-bold text-white truncate">{doc.name}</span>
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            {doc.pages.map((page, index) => (
                              <button
                                key={page.id}
                                onClick={() => handleSelectPage(page, doc.name, index)}
                                className="relative aspect-[3/4] rounded-lg overflow-hidden border border-[#2C2C2E] hover:border-[#2979FF] transition-all bg-black flex items-center justify-center group"
                              >
                                <img 
                                  src={page.processedImage} 
                                  alt={`Pág ${index+1}`}
                                  className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                  referrerPolicy="no-referrer"
                                />
                                <span className="absolute bottom-1 right-1 bg-black/60 px-1 py-0.5 rounded text-[8px] font-bold text-white">
                                  Pág {index+1}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* PASO 2: EDICIÓN ACTIVA DE MEJORAR CLARIDAD */}
          {selectedImage && activeTool === 'mejorar' && (
            <div className="flex flex-col gap-4 animate-fade-in">
              {/* Preview de la Imagen con Filtros */}
              <div className="border border-[#2C2C2E] rounded-2xl bg-neutral-950 p-2 overflow-hidden flex flex-col items-center justify-center relative min-h-[250px]">
                {improving && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-2 z-10 backdrop-blur-xs rounded-xl">
                    <Sparkles className="animate-spin text-[#FFD600]" size={20} />
                    <span className="text-xs font-semibold text-[#FFD600]">Procesando mejora...</span>
                  </div>
                )}
                {improvedImagePreview ? (
                  <img
                    src={improvedImagePreview}
                    alt="Previsualización mejorada"
                    className="max-h-[40vh] object-contain rounded-xl shadow-lg"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <img
                    src={selectedImage}
                    alt="Original"
                    className="max-h-[40vh] object-contain rounded-xl shadow-lg"
                    referrerPolicy="no-referrer"
                  />
                )}
              </div>

              {/* Controles de Mejora Inteligente */}
              <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-4 flex flex-col gap-4">
                {/* Selector de Filtros de Escaneado */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Filtros Inteligentes</span>
                  <div className="grid grid-cols-5 gap-1">
                    <button
                      onClick={() => setImprovementAdjustments(prev => ({ ...prev, filter: 'original' }))}
                      className={`py-1.5 px-1 text-[10px] font-bold rounded-lg border transition-all text-center ${
                        improvementAdjustments.filter === 'original' 
                          ? 'bg-[#2979FF] border-[#2979FF] text-white' 
                          : 'bg-neutral-900 border-[#2C2C2E] text-gray-400 hover:text-white'
                      }`}
                    >
                      Original
                    </button>
                    <button
                      onClick={() => setImprovementAdjustments(prev => ({ ...prev, filter: 'auto' }))}
                      className={`py-1.5 px-1 text-[10px] font-bold rounded-lg border transition-all text-center ${
                        improvementAdjustments.filter === 'auto' 
                          ? 'bg-[#2979FF] border-[#2979FF] text-white' 
                          : 'bg-neutral-900 border-[#2C2C2E] text-gray-400 hover:text-white'
                      }`}
                    >
                      Auto
                    </button>
                    <button
                      onClick={() => setImprovementAdjustments(prev => ({ ...prev, filter: 'bw' }))}
                      className={`py-1.5 px-1 text-[10px] font-bold rounded-lg border transition-all text-center ${
                        improvementAdjustments.filter === 'bw' 
                          ? 'bg-[#2979FF] border-[#2979FF] text-white' 
                          : 'bg-neutral-900 border-[#2C2C2E] text-gray-400 hover:text-white'
                      }`}
                    >
                      B&N
                    </button>
                    <button
                      onClick={() => setImprovementAdjustments(prev => ({ ...prev, filter: 'grayscale' }))}
                      className={`py-1.5 px-1 text-[10px] font-bold rounded-lg border transition-all text-center ${
                        improvementAdjustments.filter === 'grayscale' 
                          ? 'bg-[#2979FF] border-[#2979FF] text-white' 
                          : 'bg-neutral-900 border-[#2C2C2E] text-gray-400 hover:text-white'
                      }`}
                    >
                      Gris
                    </button>
                    <button
                      onClick={() => setImprovementAdjustments(prev => ({ ...prev, filter: 'enhanced' }))}
                      className={`py-1.5 px-1 text-[10px] font-bold rounded-lg border transition-all text-center ${
                        improvementAdjustments.filter === 'enhanced' 
                          ? 'bg-[#2979FF] border-[#2979FF] text-white' 
                          : 'bg-neutral-900 border-[#2C2C2E] text-gray-400 hover:text-white'
                      }`}
                    >
                      Realzado
                    </button>
                    <button
                      onClick={() => setImprovementAdjustments(prev => ({ ...prev, filter: 'gamma' }))}
                      className={`py-1.5 px-1 text-[10px] font-bold rounded-lg border transition-all text-center ${
                        improvementAdjustments.filter === 'gamma' 
                          ? 'bg-[#2979FF] border-[#2979FF] text-white' 
                          : 'bg-neutral-900 border-[#2C2C2E] text-gray-400 hover:text-white'
                      }`}
                    >
                      Gamma
                    </button>
                  </div>
                </div>

                {/* Slider de Nitidez */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                    <span>Nitidez / Enfoque:</span>
                    <span className="text-[#FFD600]">{improvementAdjustments.sharpness}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={improvementAdjustments.sharpness}
                    onChange={(e) => setImprovementAdjustments(prev => ({ ...prev, sharpness: Number(e.target.value) }))}
                    className="w-full accent-[#FFD600]"
                  />
                </div>

                {/* Slider de Contraste */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                    <span>Contraste de Texto:</span>
                    <span className="text-[#2979FF]">{improvementAdjustments.contrast}%</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="150"
                    value={improvementAdjustments.contrast}
                    onChange={(e) => setImprovementAdjustments(prev => ({ ...prev, contrast: Number(e.target.value) }))}
                    className="w-full accent-[#2979FF]"
                  />
                </div>

                {/* Slider de Brillo */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                    <span>Brillo / Fondo:</span>
                    <span className="text-gray-300">{improvementAdjustments.brightness}%</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="150"
                    value={improvementAdjustments.brightness}
                    onChange={(e) => setImprovementAdjustments(prev => ({ ...prev, brightness: Number(e.target.value) }))}
                    className="w-full accent-white"
                  />
                </div>
              </div>

              {/* Nombre de archivo editable */}
              <div className="flex flex-col gap-1.5 px-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Nombre del Archivo Mejorado</label>
                <input 
                  type="text"
                  value={imageName}
                  onChange={(e) => setImageName(e.target.value)}
                  className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#2979FF]"
                />
              </div>

              {/* Acciones */}
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => improvedImagePreview && handleDownload(improvedImagePreview)}
                    disabled={!improvedImagePreview}
                    className="py-3 px-4 rounded-xl text-xs font-bold border border-[#2C2C2E] bg-[#1C1C1E] hover:bg-[#2C2C2E] transition-all flex items-center justify-center gap-1.5 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Download size={14} />
                    Descargar JPG
                  </button>
                  <button
                    onClick={() => improvedImagePreview && handleSaveToDocuments(improvedImagePreview)}
                    disabled={!improvedImagePreview}
                    className="py-3 px-4 rounded-xl text-xs font-bold bg-[#2979FF] hover:bg-[#2979FF]/90 text-white flex items-center justify-center gap-1.5 shadow-lg shadow-[#2979FF]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save size={14} />
                    Guardar Escaneo
                  </button>
                </div>
                <button
                  onClick={() => {
                    setSelectedImage(null);
                    setImprovedImagePreview(null);
                  }}
                  className="py-2 px-4 text-xs font-medium text-gray-400 hover:text-white text-center"
                >
                  Elegir otra imagen
                </button>
              </div>
            </div>
          )}

          {/* PASO 2: EDICIÓN ACTIVA DE RECORTAR */}
          {selectedImage && activeTool === 'recortar' && !croppedResult && (
            <div className="flex flex-col gap-4 animate-fade-in">
              <div className="border border-[#2C2C2E] rounded-2xl bg-neutral-950 p-2 overflow-hidden flex items-center justify-center">
                <CropTool
                  imageUrl={selectedImage}
                  cropPoints={cropPoints}
                  onChange={setCropPoints}
                />
              </div>

              {/* Acciones */}
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedImage(null)}
                  className="flex-1 py-3 px-4 rounded-xl text-xs font-bold bg-[#2C2C2E] hover:bg-[#3A3A3C] transition-colors"
                >
                  Cambiar Imagen
                </button>
                <button
                  onClick={handleApplyCrop}
                  className="flex-1 py-3 px-4 rounded-xl text-xs font-bold bg-[#2979FF] hover:bg-[#2979FF]/90 text-white flex items-center justify-center gap-1.5 shadow-lg shadow-[#2979FF]/20"
                >
                  <Crop size={14} />
                  Aplicar Recorte
                </button>
              </div>
            </div>
          )}

          {/* RESULTADO DEL RECORTE */}
          {croppedResult && activeTool === 'recortar' && (
            <div className="flex flex-col gap-4 animate-fade-in">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold px-1">
                <Check size={16} />
                <span>¡Imagen recortada y alineada con éxito!</span>
              </div>

              <div className="border border-emerald-500/20 rounded-2xl bg-[#1C1C1E]/50 p-3 flex flex-col items-center justify-center">
                <img
                  src={croppedResult}
                  alt="Resultado del recorte"
                  className="max-h-[50vh] object-contain rounded-xl shadow-lg border border-[#2C2C2E]"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Nombre de archivo editable */}
              <div className="flex flex-col gap-1.5 px-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Nombre del Archivo</label>
                <input 
                  type="text"
                  value={imageName}
                  onChange={(e) => setImageName(e.target.value)}
                  className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#2979FF]"
                />
              </div>

              {/* Botones de Guardar / Exportar */}
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleDownload(croppedResult)}
                    className="py-3 px-4 rounded-xl text-xs font-bold border border-[#2C2C2E] bg-[#1C1C1E] hover:bg-[#2C2C2E] transition-all flex items-center justify-center gap-1.5 text-white"
                  >
                    <Download size={14} />
                    Descargar JPG
                  </button>
                  <button
                    onClick={() => handleSaveToDocuments(croppedResult)}
                    className="py-3 px-4 rounded-xl text-xs font-bold bg-[#2979FF] hover:bg-[#2979FF]/90 text-white flex items-center justify-center gap-1.5 shadow-lg shadow-[#2979FF]/20"
                  >
                    <Save size={14} />
                    Guardar Escaneo
                  </button>
                </div>
                <button
                  onClick={() => setCroppedResult(null)}
                  className="py-2 px-4 text-xs font-medium text-gray-400 hover:text-white text-center"
                >
                  Ajustar Recorte de nuevo
                </button>
              </div>
            </div>
          )}

          {/* PASO 2: EDICIÓN ACTIVA DE BORRAR */}
          {selectedImage && activeTool === 'borrar' && !editedResult && (
            <div className="flex flex-col gap-4 animate-fade-in">
              <p className="text-xs text-gray-400">
                Pasa el dedo o cursor para limpiar, tapar o borrar manchas. Usa el color blanco para papel o negro para censurar firmas.
              </p>

              {/* Lienzo Interactivo de Dibujo */}
              <div className="border border-[#2C2C2E] rounded-2xl bg-neutral-950 p-2 overflow-hidden flex items-center justify-center relative touch-none select-none">
                <canvas
                  ref={canvasRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  className="max-w-full max-h-[50vh] object-contain bg-neutral-900 rounded-xl cursor-crosshair"
                />
              </div>

              {/* Controles de Pincel */}
              <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-4 flex flex-col gap-4">
                {/* Fila de Color y Undo */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Color del Borrador:</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEraserColor('#ffffff')}
                        className={`w-6 h-6 rounded-full bg-white border flex items-center justify-center transition-transform ${
                          eraserColor === '#ffffff' ? 'border-[#2979FF] scale-110 ring-2 ring-[#2979FF]/30' : 'border-gray-600'
                        }`}
                        title="Blanco Papel"
                      />
                      <button
                        onClick={() => setEraserColor('#000000')}
                        className={`w-6 h-6 rounded-full bg-black border flex items-center justify-center transition-transform ${
                          eraserColor === '#000000' ? 'border-[#2979FF] scale-110 ring-2 ring-[#2979FF]/30' : 'border-gray-600'
                        }`}
                        title="Censurar / Negro"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleUndo}
                    disabled={undoHistory.length === 0}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      undoHistory.length > 0 
                        ? 'bg-[#2C2C2E] text-white hover:bg-[#3A3A3C]' 
                        : 'text-gray-600 cursor-not-allowed bg-[#1C1C1E]'
                    }`}
                  >
                    <Undo size={14} />
                    Deshacer
                  </button>
                </div>

                {/* Tamaño del Pincel */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                    <span>Tamaño del Pincel:</span>
                    <span>{brushSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="80"
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="w-full accent-[#2979FF]"
                  />
                </div>
              </div>

              {/* Acciones */}
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedImage(null)}
                  className="flex-1 py-3 px-4 rounded-xl text-xs font-bold bg-[#2C2C2E] hover:bg-[#3A3A3C] transition-colors"
                >
                  Cambiar Imagen
                </button>
                <button
                  onClick={handleApplyEraser}
                  className="flex-1 py-3 px-4 rounded-xl text-xs font-bold bg-[#2979FF] hover:bg-[#2979FF]/90 text-white flex items-center justify-center gap-1.5 shadow-lg shadow-[#2979FF]/20"
                >
                  <Check size={14} />
                  Terminar Borrador
                </button>
              </div>
            </div>
          )}

          {/* RESULTADO DEL BORRADOR */}
          {editedResult && activeTool === 'borrar' && (
            <div className="flex flex-col gap-4 animate-fade-in">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold px-1">
                <Check size={16} />
                <span>¡Imagen editada guardada exitosamente!</span>
              </div>

              <div className="border border-emerald-500/20 rounded-2xl bg-[#1C1C1E]/50 p-3 flex flex-col items-center justify-center">
                <img
                  src={editedResult}
                  alt="Resultado de edición"
                  className="max-h-[50vh] object-contain rounded-xl shadow-lg border border-[#2C2C2E]"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Nombre de archivo editable */}
              <div className="flex flex-col gap-1.5 px-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Nombre del Archivo</label>
                <input 
                  type="text"
                  value={imageName}
                  onChange={(e) => setImageName(e.target.value)}
                  className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#2979FF]"
                />
              </div>

              {/* Botones de Guardar / Exportar */}
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleDownload(editedResult)}
                    className="py-3 px-4 rounded-xl text-xs font-bold border border-[#2C2C2E] bg-[#1C1C1E] hover:bg-[#2C2C2E] transition-all flex items-center justify-center gap-1.5 text-white"
                  >
                    <Download size={14} />
                    Descargar JPG
                  </button>
                  <button
                    onClick={() => handleSaveToDocuments(editedResult)}
                    className="py-3 px-4 rounded-xl text-xs font-bold bg-[#2979FF] hover:bg-[#2979FF]/90 text-white flex items-center justify-center gap-1.5 shadow-lg shadow-[#2979FF]/20"
                  >
                    <Save size={14} />
                    Guardar Escaneo
                  </button>
                </div>
                <button
                  onClick={() => setEditedResult(null)}
                  className="py-2 px-4 text-xs font-medium text-gray-400 hover:text-white text-center"
                >
                  Seguir Borrando / Editar más
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
