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
  AlertCircle,
  XCircle,
  RefreshCw,
  Trash2,
  Plus,
  Download,
  Loader2,
  ScanLine,
  Wand2,
} from 'lucide-react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { autoProcessForScan } from '../../services/imageProcessor';
import { quickExportPDF } from '../../services/pdfGenerator';

type ScanMode = 'auto' | 'grayscale' | 'enhanced';
type PageStatus = 'pending' | 'processing' | 'done' | 'error';
type DetectionQuality = 'good' | 'fair' | 'poor';

interface ScannedQuickPage {
  id: string;
  originalBase64: string;
  processedBase64: string | null;
  detectionQuality: DetectionQuality;
  status: PageStatus;
}

interface QuickScanViewProps {
  onBack: () => void;
  onSavedToEditor: (pages: Array<{ id: string; originalImage: string; processedImage: string }>) => void;
}

const QUALITY_LABEL: Record<DetectionQuality, { label: string; color: string; icon: React.ReactNode }> = {
  good: { label: 'Bordes detectados', color: 'text-emerald-400', icon: <CheckCircle2 size={11} /> },
  fair: { label: 'Deteccion parcial', color: 'text-amber-400', icon: <AlertCircle size={11} /> },
  poor: { label: 'Sin deteccion', color: 'text-red-400', icon: <XCircle size={11} /> },
};

const MODE_OPTIONS: { value: ScanMode; label: string; desc: string }[] = [
  { value: 'auto', label: 'Auto', desc: 'Iluminacion + color' },
  { value: 'grayscale', label: 'B/N', desc: 'Texto nitido' },
  { value: 'enhanced', label: 'Color Pro', desc: 'Contraste vivido' },
];

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processImage = useCallback(async (pageId: string, base64: string, mode: ScanMode) => {
    setPages((prev) =>
      prev.map((p) => (p.id === pageId ? { ...p, status: 'processing' } : p))
    );
    try {
      const result = await autoProcessForScan(base64, mode);
      setPages((prev) =>
        prev.map((p) =>
          p.id === pageId
            ? { ...p, processedBase64: result.processedImage, detectionQuality: result.detectionQuality, status: 'done' }
            : p
        )
      );
    } catch (err) {
      console.error('Error al procesar pagina:', err);
      setPages((prev) =>
        prev.map((p) =>
          p.id === pageId ? { ...p, status: 'error', processedBase64: base64 } : p
        )
      );
    }
  }, []);

  const addAndProcessImage = useCallback(async (base64: string, mode: ScanMode) => {
    const id = `qpage_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newPage: ScannedQuickPage = {
      id,
      originalBase64: base64,
      processedBase64: null,
      detectionQuality: 'poor',
      status: 'pending',
    };
    setPages((prev) => [...prev, newPage]);
    await processImage(id, base64, mode);
  }, [processImage]);

  const takePhoto = async () => {
    setIsCapturing(true);
    try {
      const image = await Camera.getPhoto({
        quality: 92,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        correctOrientation: true,
      });
      if (image?.dataUrl) {
        await addAndProcessImage(image.dataUrl, scanMode);
      }
    } catch (err: any) {
      if (err?.message !== 'User cancelled photos app' && err !== 'User cancelled photos app') {
        console.warn('Camara no disponible:', err);
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    e.target.value = '';
    const readFile = (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    const base64List = await Promise.all(Array.from(files).map(readFile));
    await Promise.all(base64List.map((b64) => addAndProcessImage(b64, scanMode)));
  };

  const retryPage = async (pageId: string) => {
    const page = pages.find((p) => p.id === pageId);
    if (!page) return;
    await processImage(pageId, page.originalBase64, scanMode);
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
  const processingCount = pages.filter((p) => p.status === 'processing').length;
  const canExport = doneCount > 0 && processingCount === 0;

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
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.05em' }}>Escaneo Rapido</span>
          </div>
          <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 500 }}>Deteccion automatica · PDF directo</span>
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

      {/* SELECTOR DE MODO */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#111118', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <ScanLine size={13} style={{ color: '#6b7280', flexShrink: 0 }} />
        <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0 }}>Modo:</span>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setScanMode(opt.value)}
              style={{
                flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '6px 12px', borderRadius: 12, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                border: scanMode === opt.value ? '1px solid rgba(124,92,252,0.5)' : '1px solid rgba(255,255,255,0.05)',
                background: scanMode === opt.value ? 'rgba(124,92,252,0.2)' : 'rgba(255,255,255,0.05)',
                color: scanMode === opt.value ? '#A388FF' : '#6b7280',
                transition: 'all 0.15s',
              }}
            >
              <span>{opt.label}</span>
              <span style={{ fontWeight: 400, fontSize: 9, color: scanMode === opt.value ? 'rgba(163,136,255,0.7)' : '#374151' }}>{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* AREA PRINCIPAL */}
      <div style={{ flex: 1, overflowY: 'auto', padding: pages.length > 0 ? '16px 16px 140px' : '16px' }}>
        {pages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80%', gap: 24, textAlign: 'center', padding: '32px 24px' }}>
            <div style={{ position: 'relative' }}>
              <div style={{ width: 96, height: 96, borderRadius: 28, background: 'linear-gradient(135deg, rgba(124,92,252,0.15), rgba(91,141,239,0.15))', border: '1px solid rgba(124,92,252,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Wand2 size={40} style={{ color: '#7C5CFC' }} />
              </div>
              <div style={{ position: 'absolute', bottom: -8, right: -8, width: 32, height: 32, background: '#7C5CFC', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(124,92,252,0.5)' }}>
                <Zap size={14} style={{ color: 'white' }} />
              </div>
            </div>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Escaneo con IA Automatica</h3>
              <p style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.6, maxWidth: 280 }}>
                Toma una foto o carga imagenes desde la galeria. El sistema detectara los bordes del documento, corregira la perspectiva y mejorara la calidad automaticamente.
              </p>
            </div>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 280 }}>
              <button
                onClick={takePhoto}
                disabled={isCapturing}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '16px', background: 'linear-gradient(135deg, #7C5CFC, #5B8DEF)', color: 'white', fontWeight: 700, borderRadius: 18, border: 'none', cursor: isCapturing ? 'not-allowed' : 'pointer', fontSize: 14, boxShadow: '0 8px 20px rgba(124,92,252,0.35)' }}
              >
                {isCapturing ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <CameraIcon size={18} />}
                {isCapturing ? 'Abriendo camara...' : 'Escanear con Camara'}
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, color: '#d1d5db', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
              >
                <Upload size={15} style={{ color: '#7C5CFC' }} />
                Cargar desde Galeria / ADF (lote)
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, width: '100%', maxWidth: 280, marginTop: 8 }}>
              {[
                { icon: '🔍', label: 'Deteccion\nde bordes' },
                { icon: '✂️', label: 'Recorte\nautomatico' },
                { icon: '✨', label: 'Mejora\nde imagen' },
              ].map((f) => (
                <div key={f.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 14, padding: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{f.icon}</div>
                  <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 500, lineHeight: 1.3, whiteSpace: 'pre-line' }}>{f.label}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            {/* Stats */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '0 4px' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {pages.length} {pages.length === 1 ? 'pagina' : 'paginas'}
              </span>
              {processingCount > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#7C5CFC', fontWeight: 600 }}>
                  <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
                  Procesando {processingCount}...
                </span>
              )}
              {doneCount > 0 && processingCount === 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#34d399', fontWeight: 600 }}>
                  <CheckCircle2 size={10} />
                  {doneCount} lista{doneCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Grid de paginas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {pages.map((page, idx) => {
                const quality = QUALITY_LABEL[page.detectionQuality];
                return (
                  <div
                    key={page.id}
                    style={{ position: 'relative', aspectRatio: '3/4', background: '#111118', borderRadius: 18, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    {/* Imagen */}
                    {page.processedBase64 ? (
                      <img src={page.processedBase64} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={`Pagina ${idx + 1}`} />
                    ) : page.originalBase64 ? (
                      <img src={page.originalBase64} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.3 }} alt={`Original ${idx + 1}`} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FileText size={32} style={{ color: '#374151' }} />
                      </div>
                    )}

                    {/* Overlay procesando */}
                    {page.status === 'processing' && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <div style={{ position: 'relative', width: 48, height: 48 }}>
                          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(124,92,252,0.2)', borderTop: '2px solid #7C5CFC', animation: 'spin 0.8s linear infinite' }} />
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Wand2 size={16} style={{ color: '#7C5CFC' }} />
                          </div>
                        </div>
                        <span style={{ fontSize: 9, color: '#A388FF', fontWeight: 600, letterSpacing: '0.05em' }}>Procesando...</span>
                        <span style={{ fontSize: 8, color: 'rgba(163,136,255,0.6)' }}>Detectando bordes</span>
                      </div>
                    )}

                    {/* Overlay error */}
                    {page.status === 'error' && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(127,29,29,0.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <XCircle size={24} style={{ color: '#f87171' }} />
                        <span style={{ fontSize: 9, color: '#fca5a5', fontWeight: 600 }}>Error</span>
                        <button onClick={() => retryPage(page.id)} style={{ fontSize: 9, background: 'rgba(239,68,68,0.3)', padding: '4px 8px', borderRadius: 8, color: '#fecaca', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                          Reintentar
                        </button>
                      </div>
                    )}

                    {/* Badge numero */}
                    <div style={{ position: 'absolute', top: 8, left: 8, background: '#7C5CFC', color: 'white', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                      {idx + 1}
                    </div>

                    {/* Badge calidad */}
                    {page.status === 'done' && (
                      <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', padding: '2px 6px', borderRadius: 8 }}>
                        <span style={{ color: page.detectionQuality === 'good' ? '#34d399' : page.detectionQuality === 'fair' ? '#fbbf24' : '#f87171', display: 'flex' }}>
                          {quality.icon}
                        </span>
                        <span style={{ fontSize: 8, fontWeight: 600, color: page.detectionQuality === 'good' ? '#34d399' : page.detectionQuality === 'fair' ? '#fbbf24' : '#f87171' }}>
                          {quality.label}
                        </span>
                      </div>
                    )}

                    {/* Acciones */}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8, display: 'flex', gap: 6, background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', paddingTop: 24 }}>
                      <button
                        onClick={() => retryPage(page.id)}
                        disabled={page.status === 'processing'}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'rgba(124,92,252,0.75)', color: 'white', padding: '6px', borderRadius: 10, fontSize: 9, fontWeight: 700, border: 'none', cursor: page.status === 'processing' ? 'not-allowed' : 'pointer', opacity: page.status === 'processing' ? 0.4 : 1 }}
                      >
                        <RefreshCw size={9} />
                        Re-procesar
                      </button>
                      <button
                        onClick={() => removePage(page.id)}
                        style={{ padding: 6, background: 'rgba(239,68,68,0.7)', borderRadius: 10, color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Celda añadir */}
              <button
                onClick={takePhoto}
                disabled={isCapturing || processingCount > 0}
                style={{ aspectRatio: '3/4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 18, color: '#6b7280', cursor: (isCapturing || processingCount > 0) ? 'not-allowed' : 'pointer', opacity: (isCapturing || processingCount > 0) ? 0.4 : 1, transition: 'all 0.15s' }}
              >
                {isCapturing ? <Loader2 size={22} style={{ color: '#7C5CFC', animation: 'spin 1s linear infinite' }} /> : <Plus size={22} />}
                <span style={{ fontSize: 10, fontWeight: 600 }}>{isCapturing ? 'Abriendo...' : 'Anadir pagina'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* BARRA INFERIOR */}
      {pages.length > 0 && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(17,17,24,0.97)', backdropFilter: 'blur(20px)', borderTop: '1px solid rgba(255,255,255,0.05)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, zIndex: 30 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={takePhoto} disabled={isCapturing || processingCount > 0} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, fontSize: 12, fontWeight: 600, color: '#e5e7eb', cursor: (isCapturing || processingCount > 0) ? 'not-allowed' : 'pointer', opacity: (isCapturing || processingCount > 0) ? 0.5 : 1 }}>
              {isCapturing ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <CameraIcon size={15} />}
              Otra foto
            </button>
            <button onClick={() => fileInputRef.current?.click()} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, fontSize: 12, fontWeight: 600, color: '#e5e7eb', cursor: 'pointer' }}>
              <Upload size={15} />
              Cargar mas
            </button>
            {doneCount > 0 && (
              <button onClick={handleSendToEditor} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, fontSize: 12, fontWeight: 600, color: '#d1d5db', cursor: 'pointer' }} title="Enviar al editor completo">
                <FileText size={15} />
                Editor
              </button>
            )}
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
              <><Download size={18} /> Guardar como PDF ({doneCount} {doneCount === 1 ? 'pagina' : 'paginas'})</>
            )}
          </button>
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
              Se guardara como <span style={{ color: '#d1d5db', fontFamily: 'monospace' }}>{pdfName}.pdf</span>
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

      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileChange} style={{ display: 'none' }} />
    </div>
  );
}
