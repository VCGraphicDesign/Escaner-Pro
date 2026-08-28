/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Home,
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
  Eye,
  Droplet,
  Zap,
} from 'lucide-react';
import { DocumentItem, ScannedPage, Annotation, ImageOverlay } from '../types';
import { saveDocument } from '../services/documentStore';
import { generatePDF } from '../services/pdfGenerator';
import { loadImage, processPageImage, restoreDocument } from '../services/imageProcessor';
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
  const [isApplyingFilter, setIsApplyingFilter] = useState(false);
  
  // Estado para modo de dibujo de máscara (filtro sin arrugas)
  const [isMaskDrawingMode, setIsMaskDrawingMode] = useState(false);
  const [maskCanvas, setMaskCanvas] = useState<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [maskRect, setMaskRect] = useState<{ left: number; top: number; width: number; height: number }>({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });
  const [restoreBrushSize, setRestoreBrushSize] = useState<number>(24);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewImgRef = useRef<HTMLImageElement>(null);
  const imgWrapperRef = useRef<HTMLDivElement>(null);

  // Estados de Anotación de Texto
  const [textToInput, setTextToInput] = useState('');
  const [textColor, setTextColor] = useState('#FF0000');
  const [textSize, setTextSize] = useState(18);

  // Estados de selección contextual para anotaciones y firmas/overlays
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);

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

    // [ORIGINAL-DIAGNOSTIC] Registro de página actual al entrar a EditPage
    if (initialDoc.pages && initialDoc.pages.length > 0) {
      const p = initialDoc.pages[0];
      import('../utils/imageDiagnostic').then(({ recordImageDiagnostic }) => {
        recordImageDiagnostic(
          'stage_5_current_page',
          'EditPage Current Page (originalImage)',
          'src/pages/EditPage.tsx',
          'useEffect[initialDoc]',
          'p.originalImage',
          p.originalImage,
          { docId: initialDoc.id, filter: p.adjustments?.filter }
        );
      });
    }
  }, [initialDoc]);

  // Limpiar selección de anotación y overlay al cambiar de página
  useEffect(() => {
    setSelectedOverlayId(null);
    setSelectedAnnotationId(null);
  }, [currentIndex]);

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
  // CAMBIAR FILTRO PROFESIONAL EN TIEMPO REAL
  // ----------------------------------------------------
  const handleChangeFilter = async (filterType: 'original' | 'auto' | 'grayscale' | 'restore') => {
    if (!currentPage || isApplyingFilter) return;
    setIsApplyingFilter(true);

    try {
      const updatedAdjustments = {
        ...currentPage.adjustments,
        filter: filterType,
      };

      // Si el filtro seleccionado es 'original', retornar directamente la imagen original sin procesar ni pasar por Canvas
      let newProcessed: string;
      if (filterType === 'original') {
        newProcessed = currentPage.originalImage;
        // [ORIGINAL-DIAGNOSTIC] Registro de selección del filtro Original
        import('../utils/imageDiagnostic').then(({ recordImageDiagnostic }) => {
          recordImageDiagnostic(
            'stage_6_original_selection',
            'Original Filter Selection',
            'src/pages/EditPage.tsx',
            'handleChangeFilter',
            'currentPage.originalImage',
            currentPage.originalImage,
            { filterType, previousFilter: currentPage.adjustments?.filter }
          );
        });
      } else {
        newProcessed = await processPageImage(currentPage.originalImage, updatedAdjustments);
      }

      const nextPages = [...doc.pages];
      nextPages[currentIndex] = {
        ...currentPage,
        processedImage: newProcessed,
        adjustments: updatedAdjustments,
      };

      const nextDoc = { ...doc, pages: nextPages };
      pushState(nextDoc);
    } catch (err) {
      console.error('Error aplicando filtro:', err);
    } finally {
      setIsApplyingFilter(false);
    }
  };

  // ----------------------------------------------------
  // MODO DE DIBUJO DE MÁSCARA (Filtro Sin Arrugas)
  // ----------------------------------------------------
  // Función para sincronizar la geometría de visualización de la máscara con el elemento de imagen renderizado
  const updateMaskGeometry = () => {
    if (!previewImgRef.current || !imgWrapperRef.current) return;
    const img = previewImgRef.current;
    const wrapper = imgWrapperRef.current;
    const imgRect = img.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();

    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;

    if (!naturalWidth || !naturalHeight || imgRect.width <= 0 || imgRect.height <= 0) return;

    // Calcular el rectángulo exacto donde la imagen está dibujada dentro de su caja de object-contain
    const naturalAspect = naturalWidth / naturalHeight;
    const boxAspect = imgRect.width / imgRect.height;

    let renderedWidth = imgRect.width;
    let renderedHeight = imgRect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (boxAspect > naturalAspect) {
      // Letterbox a los lados (pillarbox)
      renderedHeight = imgRect.height;
      renderedWidth = renderedHeight * naturalAspect;
      offsetX = (imgRect.width - renderedWidth) / 2;
    } else {
      // Letterbox arriba y abajo
      renderedWidth = imgRect.width;
      renderedHeight = renderedWidth / naturalAspect;
      offsetY = (imgRect.height - renderedHeight) / 2;
    }

    // Posición relativa al wrapper común
    const leftInWrapper = (imgRect.left - wrapperRect.left) + offsetX;
    const topInWrapper = (imgRect.top - wrapperRect.top) + offsetY;

    setMaskRect({
      left: Math.round(leftInWrapper),
      top: Math.round(topInWrapper),
      width: Math.max(1, Math.round(renderedWidth)),
      height: Math.max(1, Math.round(renderedHeight)),
    });
  };

  // Convertir eventos de puntero directamente a coordenadas en el espacio nativo de la imagen (0..naturalWidth, 0..naturalHeight)
  const getCoordinatesFromEvent = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!maskCanvasRef.current || !previewImgRef.current) return null;
    const canvas = maskCanvasRef.current;
    const img = previewImgRef.current;

    const naturalWidth = canvas.width || img.naturalWidth;
    const naturalHeight = canvas.height || img.naturalHeight;
    if (!naturalWidth || !naturalHeight) return null;

    // Obtener la posición exacta de pantalla del lienzo de máscara (que coincide 1:1 con el rectángulo renderizado de la imagen)
    const canvasRect = canvas.getBoundingClientRect();
    if (canvasRect.width <= 0 || canvasRect.height <= 0) return null;

    const clientX = 'touches' in e && e.touches.length > 0 ? e.touches[0].clientX : 'clientX' in e ? e.clientX : 0;
    const clientY = 'touches' in e && e.touches.length > 0 ? e.touches[0].clientY : 'clientY' in e ? e.clientY : 0;

    // Mapeo proporcional exacto desde píxeles de pantalla a píxeles nativos de la imagen fuente
    const scaleX = naturalWidth / canvasRect.width;
    const scaleY = naturalHeight / canvasRect.height;

    const x = Math.max(0, Math.min(naturalWidth, (clientX - canvasRect.left) * scaleX));
    const y = Math.max(0, Math.min(naturalHeight, (clientY - canvasRect.top) * scaleY));

    return { x, y, canvas };
  };

  const handleStartMaskDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const coords = getCoordinatesFromEvent(e);
    if (!coords) return;
    const { x, y, canvas } = coords;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(x, y);
    // Trazo visual rojo semitransparente para ver el documento debajo
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.65)';
    ctx.lineWidth = restoreBrushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setIsDrawing(true);
  };

  const handleDrawMask = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const coords = getCoordinatesFromEvent(e);
    if (!coords) return;
    const { x, y, canvas } = coords;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handleStopMaskDrawing = () => {
    if (!maskCanvasRef.current) return;
    const ctx = maskCanvasRef.current.getContext('2d');
    if (!ctx) return;

    ctx.closePath();
    setIsDrawing(false);
  };

  const handleClearMask = () => {
    if (!maskCanvasRef.current) return;
    const ctx = maskCanvasRef.current.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
  };

  const handleApplyInpainting = async () => {
    if (!currentPage || !maskCanvasRef.current) return;

    setIsApplyingFilter(true);
    try {
      const img = await loadImage(currentPage.originalImage);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);

      // Crear máscara binaria interna (fondo negro #000000, trazos en blanco #ffffff) para OpenCV
      const binaryMaskCanvas = document.createElement('canvas');
      binaryMaskCanvas.width = canvas.width;
      binaryMaskCanvas.height = canvas.height;
      const bCtx = binaryMaskCanvas.getContext('2d');
      if (!bCtx) return;

      bCtx.fillStyle = '#000000';
      bCtx.fillRect(0, 0, binaryMaskCanvas.width, binaryMaskCanvas.height);

      const visibleCtx = maskCanvasRef.current.getContext('2d');
      if (visibleCtx) {
        const visibleData = visibleCtx.getImageData(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
        const binaryData = bCtx.getImageData(0, 0, binaryMaskCanvas.width, binaryMaskCanvas.height);
        for (let i = 0; i < visibleData.data.length; i += 4) {
          const alpha = visibleData.data[i + 3];
          if (alpha > 20) {
            binaryData.data[i] = 255;
            binaryData.data[i + 1] = 255;
            binaryData.data[i + 2] = 255;
            binaryData.data[i + 3] = 255;
          }
        }
        bCtx.putImageData(binaryData, 0, 0);
      }

      // Aplicar inpainting con la máscara binaria
      await restoreDocument(canvas, binaryMaskCanvas);

      const newProcessed = canvas.toDataURL('image/jpeg', 0.98);

      const nextPages = [...doc.pages];
      nextPages[currentIndex] = {
        ...currentPage,
        processedImage: newProcessed,
      };

      const nextDoc = { ...doc, pages: nextPages };
      pushState(nextDoc);

      // Salir del modo de dibujo
      setIsMaskDrawingMode(false);
      handleClearMask();
    } catch (err) {
      console.error('Error aplicando inpainting:', err);
    } finally {
      setIsApplyingFilter(false);
    }
  };

  // Inicializar canvas de máscara transparente y observar cambios de geometría al activar el modo o redimensionar
  useEffect(() => {
    if (isMaskDrawingMode && currentPage && maskCanvasRef.current) {
      const canvas = maskCanvasRef.current;
      const img = new Image();
      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        setMaskCanvas(canvas);
        updateMaskGeometry();
      };
      img.src = currentPage.originalImage;
    }
  }, [isMaskDrawingMode, currentPage]);

  // Recalcular geometría de la máscara ante cambios de contenedor, ventana o carga de imagen
  useEffect(() => {
    if (!isMaskDrawingMode) return;

    updateMaskGeometry();

    const handleResize = () => {
      updateMaskGeometry();
    };

    window.addEventListener('resize', handleResize);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && imgWrapperRef.current) {
      resizeObserver = new ResizeObserver(() => {
        updateMaskGeometry();
      });
      resizeObserver.observe(imgWrapperRef.current);
      if (previewImgRef.current) {
        resizeObserver.observe(previewImgRef.current);
      }
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [isMaskDrawingMode, currentPage]);

  // Modificar handleChangeFilter para activar modo de dibujo con restore y actualizar estado de filtro
  const handleChangeFilterWithMask = async (filterType: 'original' | 'auto' | 'grayscale' | 'restore') => {
    if (filterType === 'restore') {
      if (currentPage) {
        const updatedAdjustments = {
          ...currentPage.adjustments,
          filter: 'restore' as const,
        };
        const nextPages = [...doc.pages];
        nextPages[currentIndex] = {
          ...currentPage,
          adjustments: updatedAdjustments,
        };
        const nextDoc = { ...doc, pages: nextPages };
        pushState(nextDoc);
      }
      setIsMaskDrawingMode(true);
      setActiveTab('filter');
      return;
    }

    setIsMaskDrawingMode(false);
    await handleChangeFilter(filterType);
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
  // 3. ANOTACIONES DE TEXTO (Arrastre 1:1 de precisión suave y selección)
  // ----------------------------------------------------
  const handleAddAnnotation = () => {
    if (!textToInput.trim() || !currentPage) return;

    const newAnnotId = `annot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newAnnot: Annotation = {
      id: newAnnotId,
      text: textToInput.trim(),
      x: 50,
      y: 50,
      color: textColor || '#FF0000',
      fontSize: textSize || 18,
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
    setSelectedAnnotationId(newAnnotId);
    setSelectedOverlayId(null);
  };

  const handleUpdateAnnotationColor = (annotId: string, newColor: string) => {
    if (!currentPage) return;
    const currentAnnots = currentPage.adjustments.annotations || [];
    const nextAnnots = currentAnnots.map((a) =>
      a.id === annotId ? { ...a, color: newColor } : a
    );

    const nextPages = [...doc.pages];
    nextPages[currentIndex] = {
      ...currentPage,
      adjustments: {
        ...currentPage.adjustments,
        annotations: nextAnnots,
      },
    };
    pushState({ ...doc, pages: nextPages });
    setTextColor(newColor);
  };

  const handleUpdateAnnotationSize = (annotId: string, newSize: number) => {
    if (!currentPage) return;
    const currentAnnots = currentPage.adjustments.annotations || [];
    const nextAnnots = currentAnnots.map((a) =>
      a.id === annotId ? { ...a, fontSize: newSize } : a
    );

    const nextPages = [...doc.pages];
    nextPages[currentIndex] = {
      ...currentPage,
      adjustments: {
        ...currentPage.adjustments,
        annotations: nextAnnots,
      },
    };
    pushState({ ...doc, pages: nextPages });
    setTextSize(newSize);
  };

  const handleRemoveAnnotation = (annotId: string) => {
    if (!currentPage) return;
    if (selectedAnnotationId === annotId) {
      setSelectedAnnotationId(null);
    }
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
        const newOverlayId = `overlay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const newOverlay: ImageOverlay = {
          id: newOverlayId,
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
        setSelectedOverlayId(newOverlayId);
        setSelectedAnnotationId(null);
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
    if (selectedOverlayId === overlayId) {
      setSelectedOverlayId(null);
    }
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
    if (type === 'annotation') {
      setSelectedAnnotationId(id);
      setSelectedOverlayId(null);
    } else {
      setSelectedOverlayId(id);
      setSelectedAnnotationId(null);
    }
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

        // 3. Quemar anotaciones de texto en ultra-alta resolución
        for (const annot of page.adjustments.annotations || []) {
          // Escalar fuente respecto a la proporción real del canvas
          const fontSizeInCanvas = Math.max(20, Math.round((annot.fontSize / 340) * canvas.width));
          ctx.font = `bold ${fontSizeInCanvas}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

          const xPos = (annot.x / 100) * canvas.width;
          const yPos = (annot.y / 100) * canvas.height;

          // Fondo blanco con esquinas sutiles para legibilidad
          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          const textMetrics = ctx.measureText(annot.text);
          const padX = fontSizeInCanvas * 0.3;
          const padY = fontSizeInCanvas * 0.2;
          ctx.fillRect(
            xPos - textMetrics.width / 2 - padX,
            yPos - fontSizeInCanvas / 2 - padY,
            textMetrics.width + padX * 2,
            fontSizeInCanvas + padY * 2
          );

          ctx.fillStyle = annot.color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(annot.text, xPos, yPos);
        }

        return {
          ...page,
          processedImage: canvas.toDataURL('image/jpeg', 0.98),
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

  const selectedAnnotation = (currentPage?.adjustments.annotations || []).find(
    (a) => a.id === selectedAnnotationId
  );

  return (
    <div className="flex flex-col h-full bg-[#09364D] text-white overflow-hidden">
      {/* Header */}
      <header className="px-4 py-3.5 bg-[#1C1C1E] border-b border-[#2C2C2E] flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            id="btn-edit-back"
            onClick={onBack}
            className="p-2 text-gray-400 hover:text-white hover:bg-[#2C2C2E] rounded-xl transition-colors cursor-pointer"
            title="Volver"
            aria-label="Volver"
          >
            <ArrowLeft size={18} />
          </button>
          <button
            id="btn-edit-home"
            onClick={onBack}
            className="p-2 text-gray-400 hover:text-white hover:bg-[#2C2C2E] rounded-xl transition-colors cursor-pointer"
            title="Inicio"
            aria-label="Ir a Inicio"
          >
            <Home size={18} />
          </button>
          <div>
            <h2 className="text-sm font-bold truncate max-w-[130px] sm:max-w-[150px]" title={doc.name}>
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
      <div
        onClick={() => {
          setSelectedOverlayId(null);
          setSelectedAnnotationId(null);
        }}
        className="flex-1 min-h-0 px-2 py-1 sm:px-3 sm:py-1.5 flex flex-col items-center justify-center overflow-hidden"
      >
        {currentPage ? (
          <div className="flex flex-col items-center w-full h-full min-h-0 max-w-3xl">
            {/* Navegación interna entre páginas */}
            <div className="flex items-center justify-between w-full mb-1.5 px-1 text-xs text-gray-300 font-semibold shrink-0">
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
              onClick={() => {
                setSelectedOverlayId(null);
                setSelectedAnnotationId(null);
              }}
              className="relative flex-1 min-h-0 w-full bg-neutral-900 border border-[#2C2C2E] rounded-2xl p-1 shadow-2xl flex items-center justify-center select-none overflow-hidden touch-none"
            >
              <div
                ref={imgWrapperRef}
                className="relative w-full h-full flex items-center justify-center overflow-hidden"
              >
                <img
                  ref={previewImgRef}
                  src={
                    (currentPage.adjustments.filter === 'original' ||
                      (currentPage.adjustments.filter === 'restore' && isMaskDrawingMode)) &&
                    (!currentPage.adjustments.rotation || currentPage.adjustments.rotation === 0) &&
                    !currentPage.adjustments.crop
                      ? currentPage.originalImage
                      : currentPage.processedImage || currentPage.originalImage
                  }
                  alt={`Página ${currentIndex + 1}`}
                  onLoad={(e) => {
                    const target = e.currentTarget;
                    if (isMaskDrawingMode) {
                      updateMaskGeometry();
                    }
                    import('../utils/imageDiagnostic').then(({ recordImageDiagnostic }) => {
                      recordImageDiagnostic(
                        'stage_7_rendered_image',
                        'Final DOM Image Preview',
                        'src/pages/EditPage.tsx',
                        'img.onLoad',
                        'target.src',
                        target.src,
                        {
                          naturalWidth: target.naturalWidth,
                          naturalHeight: target.naturalHeight,
                          clientWidth: target.clientWidth,
                          clientHeight: target.clientHeight,
                          activeFilter: currentPage.adjustments?.filter,
                        }
                      );
                    });
                  }}
                  className="w-full h-full object-contain rounded-xl pointer-events-none"
                  referrerPolicy="no-referrer"
                />

                {/* Canvas de máscara para modo de dibujo (filtro sin arrugas) alineado exactamente con la imagen renderizada */}
                {isMaskDrawingMode && (
                  <canvas
                    ref={maskCanvasRef}
                    onMouseDown={handleStartMaskDrawing}
                    onMouseMove={handleDrawMask}
                    onMouseUp={handleStopMaskDrawing}
                    onMouseLeave={handleStopMaskDrawing}
                    onTouchStart={handleStartMaskDrawing}
                    onTouchMove={handleDrawMask}
                    onTouchEnd={handleStopMaskDrawing}
                    onTouchCancel={handleStopMaskDrawing}
                    className="absolute cursor-crosshair z-30 rounded-xl pointer-events-auto"
                    style={{
                      left: `${maskRect.left}px`,
                      top: `${maskRect.top}px`,
                      width: `${maskRect.width}px`,
                      height: `${maskRect.height}px`,
                      touchAction: 'none',
                    }}
                  />
                )}
              </div>

              {/* Controles e instrucciones de máscara */}
              {isMaskDrawingMode && (
                <>
                  {/* Control de grosor del pincel */}
                  <div className="absolute top-2 left-2 flex items-center gap-2 bg-[#1C1C1E]/90 backdrop-blur-md border border-[#2C2C2E] text-white px-3 py-1.5 rounded-xl text-xs z-40 shadow-xl">
                    <span className="text-[11px] font-bold text-gray-300 whitespace-nowrap">Grosor del pincel:</span>
                    <input
                      id="restore-brush-size-slider"
                      type="range"
                      min="8"
                      max="80"
                      step="2"
                      value={restoreBrushSize}
                      onChange={(e) => setRestoreBrushSize(Number(e.target.value))}
                      className="w-20 sm:w-24 accent-[#2979FF] cursor-pointer"
                    />
                    <span className="text-[11px] font-bold text-[#2979FF] min-w-[32px] text-right">
                      {restoreBrushSize}px
                    </span>
                  </div>

                  <div className="absolute top-2 right-2 flex gap-2 z-40">
                    <button
                      id="btn-restore-clear-mask"
                      onClick={handleClearMask}
                      className="p-2 bg-red-500/80 text-white rounded-lg hover:bg-red-600 transition-colors text-xs font-bold shadow-lg cursor-pointer"
                    >
                      Limpiar
                    </button>
                    <button
                      id="btn-restore-apply-mask"
                      onClick={handleApplyInpainting}
                      disabled={isApplyingFilter}
                      className="p-2 bg-[#2979FF]/80 text-white rounded-lg hover:bg-[#2979FF] transition-colors text-xs font-bold disabled:opacity-50 shadow-lg cursor-pointer"
                    >
                      {isApplyingFilter ? 'Aplicando...' : 'Aplicar'}
                    </button>
                    <button
                      id="btn-restore-cancel-mask"
                      onClick={() => {
                        setIsMaskDrawingMode(false);
                        handleClearMask();
                      }}
                      className="p-2 bg-gray-600/80 text-white rounded-lg hover:bg-gray-700 transition-colors text-xs font-bold shadow-lg cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                  
                  <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg text-xs z-40">
                    Dibuja sobre las líneas de pliegue para eliminarlas
                  </div>
                </>
              )}

              {/* 1. Capa de Firmas / Imágenes Superpuestas (Arrastrables 1:1 y Redimensionables) */}
              {(currentPage.adjustments.overlays || []).map((ov) => {
                const isSelected = selectedOverlayId === ov.id;
                return (
                  <div
                    id={`overlay-${ov.id}`}
                    key={ov.id}
                    style={{
                      left: `${ov.x}%`,
                      top: `${ov.y}%`,
                      width: `${ov.width}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedOverlayId(ov.id);
                      setSelectedAnnotationId(null);
                    }}
                    onPointerDown={(e) => {
                      setSelectedOverlayId(ov.id);
                      setSelectedAnnotationId(null);
                      handlePointerDownElement(ov.id, 'overlay', ov.x, ov.y, e);
                    }}
                    onPointerMove={handlePointerMoveElement}
                    onPointerUp={handlePointerUpElement}
                    className={`absolute touch-none flex flex-col items-center justify-center transition-all ${
                      isSelected
                        ? 'cursor-move border-2 border-dashed border-[#2979FF] rounded-lg p-1 bg-white/10 backdrop-blur-xs z-30 shadow-xl'
                        : 'cursor-pointer border-2 border-transparent rounded-lg p-1 z-20 hover:border-[#2979FF]/40'
                    }`}
                  >
                    <img
                      src={ov.imageBase64}
                      alt="Firma superpuesta"
                      className="w-full h-auto object-contain pointer-events-none"
                    />

                    {/* Controles flotantes de la firma (visibles únicamente al estar seleccionada) */}
                    {isSelected && (
                      <div className="absolute -top-7 right-0 flex items-center gap-1 bg-[#111118] border border-white/20 rounded-lg px-1.5 py-0.5 shadow-lg z-40">
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResizeOverlay(ov.id, -5);
                          }}
                          className="text-gray-300 hover:text-white font-bold px-1 text-xs cursor-pointer"
                          title="Reducir tamaño"
                        >
                          -
                        </button>
                        <span className="text-[9px] text-gray-400 font-bold">{Math.round(ov.width)}%</span>
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResizeOverlay(ov.id, 5);
                          }}
                          className="text-gray-300 hover:text-white font-bold px-1 text-xs cursor-pointer"
                          title="Aumentar tamaño"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveOverlay(ov.id);
                          }}
                          className="text-red-400 hover:text-red-300 ml-1 p-0.5 cursor-pointer"
                          title="Eliminar firma"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* 2. Capa de Anotaciones de Texto Interactivas (Arrastre suave 1:1 con selección y edición contextual) */}
              {(currentPage.adjustments.annotations || []).map((annot) => {
                const isSelected = selectedAnnotationId === annot.id;
                return (
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
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAnnotationId(annot.id);
                      setSelectedOverlayId(null);
                    }}
                    onPointerDown={(e) => {
                      setSelectedAnnotationId(annot.id);
                      setSelectedOverlayId(null);
                      handlePointerDownElement(annot.id, 'annotation', annot.x, annot.y, e);
                    }}
                    onPointerMove={handlePointerMoveElement}
                    onPointerUp={handlePointerUpElement}
                    className={`absolute touch-none font-bold whitespace-nowrap px-2.5 py-1 rounded-lg flex items-center gap-2 select-none transition-all ${
                      isSelected
                        ? 'cursor-move bg-white/95 border-2 border-dashed border-[#2979FF] shadow-2xl ring-2 ring-[#2979FF]/30 z-30'
                        : 'cursor-pointer bg-white/80 border border-neutral-300 shadow-md hover:border-[#2979FF]/50 z-20'
                    }`}
                  >
                    <span>{annot.text}</span>
                    {isSelected && (
                      <button
                        id={`delete-annot-${annot.id}`}
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveAnnotation(annot.id);
                        }}
                        className="text-red-500 hover:text-red-700 font-bold p-0.5 hover:bg-red-50 rounded cursor-pointer ml-1"
                        title="Eliminar texto"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}

                    {/* Barra flotante contextual de edición sobre el texto seleccionado */}
                    {isSelected && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="absolute -top-9 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-[#111118]/95 border border-white/20 rounded-xl px-2 py-1 shadow-2xl backdrop-blur-md z-40"
                      >
                        <div className="flex items-center gap-1 pr-1 border-r border-white/10">
                          {['#FF0000', '#000000', '#0000FF', '#00AA00', '#FF8F00'].map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => handleUpdateAnnotationColor(annot.id, color)}
                              style={{ backgroundColor: color }}
                              className={`w-3.5 h-3.5 rounded-full border cursor-pointer ${
                                annot.color === color
                                  ? 'border-white scale-125 ring-1 ring-white/60'
                                  : 'border-black/30'
                              }`}
                            />
                          ))}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateAnnotationSize(annot.id, Math.max(12, annot.fontSize - 2))
                            }
                            className="text-gray-300 hover:text-white font-bold px-1 text-[11px] cursor-pointer"
                            title="Reducir tamaño"
                          >
                            A-
                          </button>
                          <span className="text-[9px] text-gray-300 font-bold w-3 text-center">
                            {annot.fontSize}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateAnnotationSize(annot.id, Math.min(36, annot.fontSize + 2))
                            }
                            className="text-gray-300 hover:text-white font-bold px-1 text-[11px] cursor-pointer"
                            title="Aumentar tamaño"
                          >
                            A+
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-20 text-gray-400">No hay páginas capturadas</div>
        )}
      </div>

      {/* Controles de la Pestaña Activa en la barra inferior */}
      <div className="bg-[#1C1C1E] border-t border-[#2C2C2E] px-3.5 py-2.5 shrink-0">
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
          <div className="flex flex-col gap-3 animate-fade-in">
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
                className="px-4 bg-[#2979FF] hover:bg-[#1E6BE6] disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md shadow-[#2979FF]/20"
              >
                <Plus size={14} />
                Añadir
              </button>
            </div>

            {/* Selector contextual de color y tamaño (visible únicamente cuando hay un texto seleccionado) */}
            {selectedAnnotation && (
              <div className="flex items-center justify-between bg-[#2C2C2E]/80 border border-[#3C3C3E] px-3.5 py-2 rounded-xl animate-fade-in">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Color:</span>
                  <div className="flex gap-1.5">
                    {['#FF0000', '#000000', '#0000FF', '#00AA00', '#FF8F00'].map((color) => (
                      <button
                        id={`color-btn-${color.replace('#', '')}`}
                        key={color}
                        type="button"
                        onClick={() => handleUpdateAnnotationColor(selectedAnnotation.id, color)}
                        style={{ backgroundColor: color }}
                        className={`w-5 h-5 rounded-full border cursor-pointer transition-transform ${
                          selectedAnnotation.color === color
                            ? 'border-white scale-125 shadow-md ring-1 ring-white/60'
                            : 'border-black/20 hover:scale-110'
                        }`}
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
                    value={selectedAnnotation.fontSize}
                    onChange={(e) =>
                      handleUpdateAnnotationSize(selectedAnnotation.id, Number(e.target.value))
                    }
                    className="w-16 accent-[#2979FF]"
                  />
                  <span className="text-[10px] text-gray-300 font-bold w-4 text-right">
                    {selectedAnnotation.fontSize}
                  </span>
                </div>
              </div>
            )}
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

        {/* Pestaña: Filtros Profesionales (5 Opciones Directas) */}
        {activeTab === 'filter' && (
          <div className="flex flex-col gap-2.5 animate-fade-in">
            <div className="flex items-center justify-between text-[11px] font-bold text-gray-400 uppercase tracking-wider px-1">
              <span>Filtros de Procesamiento</span>
              {isApplyingFilter && (
                <span className="text-[#2979FF] flex items-center gap-1 text-[10px] font-bold">
                  <Loader2 size={12} className="animate-spin" /> Aplicando...
                </span>
              )}
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              {[
                {
                  id: 'restore' as const,
                  name: 'Sin Arrugas',
                  desc: 'Limpia pliegues',
                  icon: <Sparkles size={16} />,
                },
                {
                  id: 'original' as const,
                  name: 'Original',
                  desc: 'Foto limpia',
                  icon: <Eye size={16} />,
                },
                {
                  id: 'auto' as const,
                  name: 'Auto',
                  desc: 'Equilibrio luz',
                  icon: <Zap size={16} />,
                },
                {
                  id: 'grayscale' as const,
                  name: 'B/N',
                  desc: 'Texto nítido',
                  icon: <Sliders size={16} />,
                },
              ].map((f) => {
                const isActive = (currentPage?.adjustments.filter || 'original') === f.id;
                return (
                  <button
                    key={f.id}
                    id={`filter-btn-${f.id}`}
                    disabled={isApplyingFilter}
                    onClick={() => handleChangeFilterWithMask(f.id)}
                    className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all text-center cursor-pointer ${
                      isActive
                        ? 'bg-[#2979FF]/20 border-[#2979FF] text-[#2979FF] shadow-md shadow-[#2979FF]/20 scale-105'
                        : 'bg-[#2C2C2E] border-[#3C3C3E] text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg mb-1 ${isActive ? 'bg-[#2979FF] text-white' : 'bg-black/30 text-gray-400'}`}>
                      {f.icon}
                    </div>
                    <span className="text-[10px] font-bold leading-tight">{f.name}</span>
                    <span className="text-[8px] text-gray-400 leading-tight truncate max-w-[55px]">{f.desc}</span>
                  </button>
                );
              })}
            </div>
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
        <div className="flex border-t border-white/5 mt-2.5 pt-2 justify-around">
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
