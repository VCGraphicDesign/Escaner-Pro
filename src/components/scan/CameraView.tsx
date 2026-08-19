/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Camera as CameraIcon, RefreshCw, Upload, Image as ImageIcon, ArrowLeft, Check, Plus, AlertCircle } from 'lucide-react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { createDefaultAdjustments } from '../../services/documentStore';
import { detectDocumentCorners, processPageImage } from '../../services/imageProcessor';
import { ScannedPage } from '../../types';
import LiveCameraModal from './LiveCameraModal';

interface CameraViewProps {
  onBack: () => void;
  onPagesCaptured: (capturedPages: ScannedPage[]) => void;
}

export default function CameraView({ onBack, onPagesCaptured }: CameraViewProps) {
  const [sessionPages, setSessionPages] = useState<ScannedPage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLiveCameraOpen, setIsLiveCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Procesa y agrega una nueva página con detección y recorte automático inmediato
  const addScannedImage = async (base64: string) => {
    setIsLoading(true);
    try {
      const crop = await detectDocumentCorners(base64);
      const adjustments = {
        ...createDefaultAdjustments(),
        crop,
        filter: 'auto' as const,
      };
      const processed = await processPageImage(base64, adjustments);
      const newPage: ScannedPage = {
        id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        originalImage: base64,
        processedImage: processed,
        adjustments,
      };
      setSessionPages((prev) => [...prev, newPage]);
    } catch (err) {
      console.warn('Error en auto-procesamiento de página:', err);
      const newPage: ScannedPage = {
        id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        originalImage: base64,
        processedImage: base64,
        adjustments: createDefaultAdjustments(),
      };
      setSessionPages((prev) => [...prev, newPage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Tomar una foto usando la cámara del sistema
  const takeNativePhoto = async () => {
    // Si estamos en un notebook o navegador web, abrimos el visor de cámara en vivo WebRTC
    if (!Capacitor.isNativePlatform()) {
      setIsLiveCameraOpen(true);
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        correctOrientation: true,
      });

      if (image && image.dataUrl) {
        await addScannedImage(image.dataUrl);
      }
    } catch (err: any) {
      console.warn('Cámara nativa cancelada o no disponible:', err);
      if (err?.message !== 'User cancelled photos app' && err !== 'User cancelled photos app') {
        setIsLiveCameraOpen(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLiveCapture = async (base64Image: string) => {
    setIsLiveCameraOpen(false);
    await addScannedImage(base64Image);
  };

  // Abrir la cámara automáticamente al ingresar a la pantalla de escaneo
  useEffect(() => {
    takeNativePhoto();
  }, []);

  // Carga de archivo desde la galería de fotos
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file: any) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        if (event.target?.result) {
          const base64 = event.target.result as string;
          await addScannedImage(base64);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Confirmar páginas escaneadas y avanzar al editor
  const handleFinishScan = () => {
    if (sessionPages.length > 0) {
      onPagesCaptured(sessionPages);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#09364D] text-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#2C2C2E] bg-[#1C1C1E] z-10">
        <button
          id="btn-scan-back"
          onClick={onBack}
          className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-[#2C2C2E] rounded-xl transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h3 className="text-sm font-semibold tracking-wide text-center uppercase">
          Escanear Documento ({sessionPages.length})
        </h3>
        <button
          id="btn-finish-scan"
          disabled={sessionPages.length === 0}
          onClick={handleFinishScan}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            sessionPages.length > 0
              ? 'bg-[#2979FF] text-white shadow-md shadow-[#2979FF]/25 active:scale-95'
              : 'bg-gray-800 text-gray-500 cursor-not-allowed'
          }`}
        >
          Siguiente
          <Check size={14} />
        </button>
      </div>

      {/* ÁREA PRINCIPAL: Vista de Páginas Capturadas y Botones de Acción */}
      <div className="flex-1 relative flex flex-col items-center justify-center p-6 text-center overflow-y-auto">
        {sessionPages.length > 0 ? (
          <div className="w-full max-w-sm flex flex-col items-center gap-4">
            <h4 className="text-sm font-medium text-gray-300">
              Páginas capturadas ({sessionPages.length})
            </h4>

            {/* Vista previa de las páginas capturadas */}
            <div className="grid grid-cols-2 gap-3 w-full max-h-[50vh] overflow-y-auto p-2 bg-[#1C1C1E] rounded-2xl border border-[#2C2C2E]">
              {sessionPages.map((page, idx) => (
                <div key={page.id} className="relative aspect-[3/4] bg-black rounded-xl overflow-hidden border border-white/10 group">
                  <img
                    src={page.processedImage}
                    className="w-full h-full object-cover"
                    alt={`Página ${idx + 1}`}
                  />
                  <div className="absolute top-2 left-2 bg-[#2979FF] text-white text-xs font-bold px-2 py-0.5 rounded-md shadow">
                    Pág. {idx + 1}
                  </div>
                </div>
              ))}
            </div>

            {/* Botón para tomar otra página */}
            <button
              id="btn-take-another-photo"
              onClick={takeNativePhoto}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-6 bg-[#2979FF] hover:bg-[#2979FF]/90 text-white font-bold rounded-2xl shadow-lg shadow-[#2979FF]/25 active:scale-95 transition-all"
            >
              <Plus size={20} />
              Capturar otra página
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center max-w-sm p-6 text-center">
            <div className="w-20 h-20 bg-[#1C1C1E] border border-[#2C2C2E] rounded-3xl flex items-center justify-center text-[#2979FF] mb-5 shadow-inner">
              <CameraIcon size={40} />
            </div>

            <h4 className="text-lg font-bold mb-2">Listo para escanear</h4>
            <p className="text-xs text-gray-400 mb-6">
              Toma fotos de tus documentos usando la cámara de tu celular o selecciona imágenes de tu galería.
            </p>

            {errorMsg && (
              <div className="w-full mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-xs flex items-center gap-2 text-left">
                <AlertCircle size={16} className="shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              id="btn-[#open-camera]"
              onClick={takeNativePhoto}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2.5 py-4 px-6 bg-[#2979FF] hover:bg-[#2979FF]/90 text-white font-bold rounded-2xl shadow-lg shadow-[#2979FF]/30 active:scale-95 transition-all text-sm mb-3"
            >
              <CameraIcon size={20} />
              {isLoading ? 'Abriendo cámara...' : 'Abrir Cámara para Escanear'}
            </button>

            <button
              id="upload-file-btn"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 px-5 bg-[#1C1C1E] hover:bg-[#2C2C2E] border border-[#3C3C3E] rounded-2xl text-xs font-semibold transition-colors text-gray-300"
            >
              <Upload size={16} className="text-[#2979FF]" />
              Seleccionar desde Galería
            </button>
          </div>
        )}
      </div>

      {/* Modal de Cámara en Vivo WebRTC para Notebook / Web */}
      <LiveCameraModal
        isOpen={isLiveCameraOpen}
        onClose={() => setIsLiveCameraOpen(false)}
        onCapture={handleLiveCapture}
      />

      {/* Input de archivo oculto para la galería */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
