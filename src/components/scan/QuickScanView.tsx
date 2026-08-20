/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  Camera as CameraIcon,
  FileText,
  Upload,
  Zap,
  CheckCircle2,
  Trash2,
  Plus,
  Download,
  Loader2,
  Crop,
  Check,
  X,
  Maximize2,
} from 'lucide-react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { processPageImage } from '../../services/imageProcessor';
import { quickExportPDF } from '../../services/pdfGenerator';
import { CropPoints } from '../../types';
import LiveCameraModal from './LiveCameraModal';
import CropTool from '../clean/CropTool';

type ScanMode = 'auto' | 'grayscale' | 'enhanced';
type PageStatus = 'pending' | 'processing' | 'done' | 'error';

interface ScannedQuickPage {
  id: string;
  originalBase64: string;
  processedBase64: string | null;
  status: PageStatus;
}

interface QuickScanViewProps {
  onBack: () => void;
  onSavedToEditor: (pages: Array<{ id: string; originalImage: string; processedImage: string }>) => void;
}

const DEFAULT_CROP: CropPoints = {
  topLeft: { x: 0.05, y: 0.05 },
  topRight: { x: 0.95, y: 0.05 },
  bottomRight: { x: 0.95, y: 0.95 },
  bottomLeft: { x: 0.05, y: 0.95 },
};

export default function QuickScanView({ onBack, onSavedToEditor }: QuickScanViewProps) {
  const [pages, setPages] = useState<ScannedQuickPage[]>([]);
  const [scanMode, setScanMode] = useState<ScanMode>('auto');
  const [isCapturing, setIsCapturing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [pdfName, setPdfName] = useState(() => {
    const now = new Date();
    return `Escaneo_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  });
  const [showNameInput, setShowNameInput] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [isLiveCameraOpen, setIsLiveCameraOpen] = useState(false);

  // Estados para el Recorte Inmediato (Directo al capturar o subir)
  const [pendingCropImage, setPendingCropImage] = useState<string | null>(null);
  const [currentCropPoints, setCurrentCropPoints] = useState<CropPoints>(DEFAULT_CROP);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [imageQueue, setImageQueue] = useState<string[]>([]);
  const [isProcessingCrop, setIsProcessingCrop] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Iniciar flujo de recorte inmediato para una imagen
  const openImmediateCrop = (base64Image: string, pageIdToEdit: string | null = null) => {
    setPendingCropImage(base64Image);
    setCurrentCropPoints(DEFAULT_CROP);
    setEditingPageId(pageIdToEdit);
  };

  // Confirmar y aplicar recorte a la imagen actual
  const handleConfirmCrop = async (useFullImage: boolean = false) => {
    if (!pendingCropImage) return;
    setIsProcessingCrop(true);

    try {
      const cropToApply = useFullImage ? null : currentCropPoints;
      const processedImage = await processPageImage(pendingCropImage, {
        brightness: 105,
        contrast: 112,
        sharpness: scanMode === 'grayscale' ? 50 : 35,
        filter: scanMode,
        rotation: 0,
        crop: cropToApply,
      });

      if (editingPageId) {
        // Re-ajustando página existente
        setPages((prev) =>
          prev.map((p) =>
            p.id === editingPageId
              ? { ...p, processedBase64: processedImage, status: 'done' }
              : p
          )
        );
      } else {
        // Nueva página escaneada
        const newPage: ScannedQuickPage = {
          id: `qpage_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          originalBase64: pendingCropImage,
          processedBase64: processedImage,
          status: 'done',
        };
        setPages((prev) => [...prev, newPage]);
      }

      // Si quedan imágenes en cola, abrir la siguiente
      if (imageQueue.length > 0) {
        const nextImage = imageQueue[0];
        setImageQueue((prev) => prev.slice(1));
        setPendingCropImage(nextImage);
        setCurrentCropPoints(DEFAULT_CROP);
        setEditingPageId(null);
      } else {
        setPendingCropImage(null);
        setEditingPageId(null);
      }
    } catch (err) {
      console.error('Error aplicando recorte:', err);
    } finally {
      setIsProcessingCrop(false);
    }
  };

  // Cancelar el recorte actual
  const handleCancelCrop = () => {
    if (imageQueue.length > 0) {
      const nextImage = imageQueue[0];
      setImageQueue((prev) => prev.slice(1));
      setPendingCropImage(nextImage);
      setCurrentCropPoints(DEFAULT_CROP);
      setEditingPageId(null);
    } else {
      setPendingCropImage(null);
      setEditingPageId(null);
    }
  };

  const takePhoto = async () => {
    if (!Capacitor.isNativePlatform()) {
      setIsLiveCameraOpen(true);
      return;
    }

    setIsCapturing(true);
    try {
      const image = await Camera.getPhoto({
        quality: 95,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        correctOrientation: true,
      });
      if (image?.dataUrl) {
        openImmediateCrop(image.dataUrl);
      }
    } catch (err: any) {
      if (err?.message !== 'User cancelled photos app' && err !== 'User cancelled photos app') {
        console.warn('Cámara nativa no disponible, abriendo cámara web:', err);
        setIsLiveCameraOpen(true);
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const handleLiveCapture = (base64Image: string) => {
    setIsLiveCameraOpen(false);
    // Abrir recorte inmediatamente al tomar la foto
    openImmediateCrop(base64Image);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileArray: File[] = Array.from(files);
    e.target.value = '';

    const loadedImages: string[] = [];
    for (const file of fileArray) {
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        if (base64) {
          loadedImages.push(base64);
        }
      } catch (err) {
        console.error('Error cargando archivo:', err);
      }
    }

    if (loadedImages.length > 0) {
      // Iniciar recorte de la primera imagen inmediatamente y encolar las restantes
      const first = loadedImages[0];
      const rest = loadedImages.slice(1);
      setImageQueue(rest);
      openImmediateCrop(first);
    }
  };

  const removePage = (pageId: string) => {
    setPages((prev) => prev.filter((p) => p.id !== pageId));
  };

  const handleExportPDF = async () => {
    const readyPages = pages.filter((p) => p.status === 'done' && p.processedBase64);
    if (readyPages.length === 0) return;
    setIsExporting(true);
    try {
      await quickExportPDF(pdfName, readyPages.map((p) => p.processedBase64!));
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (err) {
      console.error('Error exportando PDF:', err);
      alert('Error al generar el PDF: ' + err);
    } finally {
      setIsExporting(false);
      setShowNameInput(false);
    }
  };

  const handleSendToEditor = () => {
    const readyPages = pages.filter((p) => p.status === 'done' && p.processedBase64);
    onSavedToEditor(
      readyPages.map((p) => ({
        id: p.id,
        originalImage: p.originalBase64,
        processedImage: p.processedBase64!,
      }))
    );
  };

  const doneCount = pages.filter((p) => p.status === 'done').length;
  const canExport = doneCount > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0A0A0F', color: 'white', overflow: 'hidden', position: 'relative' }}>
      {/* HEADER */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#111118', borderBottom: '1px solid rgba(255,255,255,0.05)', zIndex: 20 }}>
        <button onClick={onBack} style={{ padding: 8, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 12 }}>
          <ArrowLeft size={20} />
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={14} style={{ color: '#7C5CFC' }} />
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.05em' }}>Escaneo Rápido</span>
          </div>
          <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 500 }}>Recorte directo · PDF unificado</span>
        </div>
        <button
          disabled={!canExport}
          onClick={() => setShowNameInput(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
            borderRadius: 12, fontSize: 12, fontWeight: 700, border: 'none', cursor: canExport ? 'pointer' : 'not-allowed',
            background: canExport ? 'linear-gradient(135deg, #7C5CFC, #5B8DEF)' : 'rgba(255,255,255,0.05)',
            color: canExport ? 'white' : '#4b5563',
            boxShadow: canExport ? '0 4px 15px rgba(124,92,252,0.3)' : 'none',
          }}
        >
          <Download size={13} />
          PDF
        </button>
      </div>

      {/* AREA PRINCIPAL */}
      <div style={{ flex: 1, overflowY: 'auto', padding: pages.length > 0 ? '16px 16px 140px' : '16px' }}>
        {pages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80%', gap: 24, textAlign: 'center', padding: '32px 24px' }}>
            <div style={{ width: 96, height: 96, borderRadius: 28, background: 'linear-gradient(135deg, rgba(124,92,252,0.15), rgba(91,141,239,0.15))', border: '1px solid rgba(124,92,252,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Crop size={40} style={{ color: '#7C5CFC' }} />
            </div>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Escanear Documento</h3>
              <p style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.6, maxWidth: 280 }}>
                Toma una foto o sube una imagen de tu galería para recortar y mejorar la página con control total.
              </p>
            </div>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 280 }}>
              <button
                onClick={takePhoto}
                disabled={isCapturing}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '16px', background: 'linear-gradient(135deg, #7C5CFC, #5B8DEF)', color: 'white', fontWeight: 700, borderRadius: 18, border: 'none', cursor: isCapturing ? 'not-allowed' : 'pointer', fontSize: 14, boxShadow: '0 8px 20px rgba(124,92,252,0.35)' }}
              >
                {isCapturing ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <CameraIcon size={18} />}
                {isCapturing ? 'Abriendo cámara...' : 'Escanear con Cámara'}
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, color: '#d1d5db', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
              >
                <Upload size={15} style={{ color: '#7C5CFC' }} />
                Cargar desde galería
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Stats */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '0 4px' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {pages.length} {pages.length === 1 ? 'página' : 'páginas'} escaneada{pages.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Grid de páginas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {pages.map((page, idx) => (
                <div
                  key={page.id}
                  style={{ position: 'relative', aspectRatio: '3/4', background: '#111118', borderRadius: 18, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  {/* Imagen */}
                  {page.processedBase64 ? (
                    <img src={page.processedBase64} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={`Página ${idx + 1}`} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileText size={32} style={{ color: '#374151' }} />
                    </div>
                  )}

                  {/* Badge número */}
                  <div style={{ position: 'absolute', top: 8, left: 8, background: '#7C5CFC', color: 'white', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                    {idx + 1}
                  </div>

                  {/* Acciones directas sobre la página */}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8, display: 'flex', gap: 6, background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)', paddingTop: 24 }}>
                    <button
                      onClick={() => openImmediateCrop(page.originalBase64, page.id)}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: '#2979FF', color: 'white', padding: '6px', borderRadius: 10, fontSize: 10, fontWeight: 700, border: 'none', cursor: 'pointer' }}
                      title="Re-ajustar recorte"
                    >
                      <Crop size={11} />
                      Recortar
                    </button>
                    <button
                      onClick={() => removePage(page.id)}
                      style={{ padding: 6, background: 'rgba(239,68,68,0.8)', borderRadius: 10, color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Eliminar página"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}

              {/* Celda añadir más */}
              <button
                onClick={takePhoto}
                disabled={isCapturing}
                style={{ aspectRatio: '3/4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 18, color: '#6b7280', cursor: isCapturing ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}
              >
                {isCapturing ? <Loader2 size={22} style={{ color: '#7C5CFC', animation: 'spin 1s linear infinite' }} /> : <Plus size={22} />}
                <span style={{ fontSize: 10, fontWeight: 600 }}>{isCapturing ? 'Abriendo...' : 'Añadir página'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* BARRA INFERIOR */}
      {pages.length > 0 && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(17,17,24,0.97)', backdropFilter: 'blur(20px)', borderTop: '1px solid rgba(255,255,255,0.05)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, zIndex: 30 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={takePhoto} disabled={isCapturing} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, fontSize: 12, fontWeight: 600, color: '#e5e7eb', cursor: isCapturing ? 'not-allowed' : 'pointer' }}>
              {isCapturing ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <CameraIcon size={15} />}
              Otra foto
            </button>
            <button onClick={() => fileInputRef.current?.click()} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, fontSize: 12, fontWeight: 600, color: '#e5e7eb', cursor: 'pointer' }}>
              <Upload size={15} />
              Galería
            </button>
            <button onClick={handleSendToEditor} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, fontSize: 12, fontWeight: 600, color: '#d1d5db', cursor: 'pointer' }} title="Enviar al editor avanzado">
              <FileText size={15} />
              Editor
            </button>
          </div>

          <button
            disabled={!canExport || isExporting}
            onClick={() => setShowNameInput(true)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: 16, borderRadius: 18, fontSize: 14, fontWeight: 700, border: 'none',
              cursor: (canExport && !isExporting) ? 'pointer' : 'not-allowed',
              background: exportSuccess
                ? '#10b981'
                : (canExport && !isExporting)
                  ? 'linear-gradient(135deg, #7C5CFC, #5B8DEF)'
                  : 'rgba(255,255,255,0.05)',
              color: (canExport || exportSuccess) ? 'white' : '#4b5563',
              boxShadow: (canExport && !isExporting && !exportSuccess) ? '0 6px 20px rgba(124,92,252,0.35)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            {isExporting ? (
              <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Generando PDF...</>
            ) : exportSuccess ? (
              <><CheckCircle2 size={18} /> PDF guardado exitosamente</>
            ) : (
              <><Download size={18} /> Guardar como PDF ({doneCount} {doneCount === 1 ? 'página' : 'páginas'})</>
            )}
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL DE RECORTE INMEDIATO (4 LÍNEAS COMPLETAS + 4 ESQUINAS) */}
      {/* ======================================================== */}
      {pendingCropImage && (
        <div className="fixed inset-0 z-50 bg-[#09090D] flex flex-col justify-between select-none animate-fade-in">
          {/* Header del Recorte */}
          <div className="w-full flex items-center justify-between px-4 py-3 bg-[#111118] border-b border-white/10 shrink-0">
            <button
              onClick={handleCancelCrop}
              className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-all cursor-pointer"
              title="Cancelar"
            >
              <X size={20} />
            </button>

            <div className="flex flex-col items-center">
              <span className="text-sm font-bold text-white">Ajustar Recorte</span>
              <span className="text-[10px] text-gray-400">Arrastra las líneas o esquinas</span>
            </div>

            <button
              onClick={() => handleConfirmCrop(true)}
              className="flex items-center gap-1 text-xs font-semibold text-[#2979FF] hover:text-[#5B8DEF] px-3 py-1.5 rounded-lg hover:bg-[#2979FF]/10 transition-all cursor-pointer"
              title="Usar imagen completa sin recortar"
            >
              <Maximize2 size={13} />
              Completa
            </button>
          </div>

          {/* Visor interactivo de recorte con 8 controles */}
          <div className="flex-1 w-full h-full p-2 flex items-center justify-center overflow-hidden">
            <CropTool
              imageUrl={pendingCropImage}
              cropPoints={currentCropPoints}
              onChange={(newPoints) => setCurrentCropPoints(newPoints)}
            />
          </div>

          {/* Barra inferior de confirmación de recorte */}
          <div className="w-full p-4 bg-[#111118] border-t border-white/10 flex items-center gap-3 shrink-0">
            <button
              onClick={handleCancelCrop}
              className="flex-1 py-3.5 px-4 rounded-xl text-xs font-semibold text-gray-300 bg-white/5 hover:bg-white/10 active:scale-95 transition-all cursor-pointer border border-white/10"
            >
              Cancelar
            </button>

            <button
              onClick={() => handleConfirmCrop(false)}
              disabled={isProcessingCrop}
              className="flex-[2] py-3.5 px-4 rounded-xl text-xs font-bold text-white bg-[#2979FF] hover:bg-[#1E6BE6] active:scale-95 transition-all cursor-pointer shadow-lg shadow-[#2979FF]/30 flex items-center justify-center gap-2"
            >
              {isProcessingCrop ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Check size={16} />
              )}
              {isProcessingCrop ? 'Procesando...' : 'Confirmar Recorte'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Nombre del PDF */}
      {showNameInput && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50, padding: '16px 16px 32px' }}>
          <div style={{ width: '100%', maxWidth: 360, background: '#1A1A26', borderRadius: 28, padding: 20, border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={18} style={{ color: '#7C5CFC' }} />
              <h4 style={{ fontSize: 14, fontWeight: 700 }}>Nombre del documento</h4>
            </div>
            <input
              type="text"
              value={pdfName}
              onChange={(e) => setPdfName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && pdfName.trim() && handleExportPDF()}
              style={{ width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, fontSize: 14, color: 'white', outline: 'none', boxSizing: 'border-box' }}
              placeholder="Nombre del PDF..."
              autoFocus
            />
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: -8, paddingLeft: 4 }}>
              Se guardará como <span style={{ color: '#d1d5db', fontFamily: 'monospace' }}>{pdfName}.pdf</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowNameInput(false)} style={{ flex: 1, padding: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 14, fontSize: 12, fontWeight: 600, color: '#9ca3af', border: 'none', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                disabled={!pdfName.trim() || isExporting}
                onClick={handleExportPDF}
                style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, background: (!pdfName.trim() || isExporting) ? 'rgba(124,92,252,0.3)' : 'linear-gradient(135deg, #7C5CFC, #5B8DEF)', borderRadius: 14, fontSize: 12, fontWeight: 700, color: 'white', border: 'none', cursor: (!pdfName.trim() || isExporting) ? 'not-allowed' : 'pointer' }}
              >
                {isExporting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />}
                {isExporting ? 'Generando...' : 'Guardar PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS animations inline */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Modal de Cámara Web */}
      <LiveCameraModal
        isOpen={isLiveCameraOpen}
        onClose={() => setIsLiveCameraOpen(false)}
        onCapture={handleLiveCapture}
      />

      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileChange} style={{ display: 'none' }} />
    </div>
  );
}
