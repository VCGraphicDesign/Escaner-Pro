/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Camera, RefreshCw, Upload, Image as ImageIcon, ArrowLeft, Check, AlertTriangle, Play } from 'lucide-react';
import { createDefaultAdjustments, createDefaultAdjustments as getCleanAdjustments } from '../../services/documentStore';
import { ScannedPage } from '../../types';

interface CameraViewProps {
  onBack: () => void;
  onPagesCaptured: (capturedPages: ScannedPage[]) => void;
}

// Mocks de páginas/documentos reales en alta resolución que el usuario puede elegir si no tiene cámara física
const SAMPLE_MOCKS = [
  {
    name: 'Boleta de Compras',
    url: 'https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?auto=format&fit=crop&q=80&w=600&h=800',
  },
  {
    name: 'Contrato Comercial',
    url: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&q=80&w=600&h=800',
  },
  {
    name: 'Página de Libro Antiguo',
    url: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=600&h=800',
  },
];

export default function CameraView({ onBack, onPagesCaptured }: CameraViewProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [sessionPages, setSessionPages] = useState<ScannedPage[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Intentar iniciar la cámara
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
      } catch (e) {
        // Fallback para cámaras o dispositivos que no soportan restricciones estrictas
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch((e) => console.log('Autoplay play error:', e));
      }
      setCameraActive(true);
    } catch (err: any) {
      console.warn('Cámara no accesible, usando selector de archivos.', err);
      setCameraError(
        'No se pudo acceder a la cámara física (común en entornos iframe o sin permisos). ¡No te preocupes! Puedes subir fotos o usar nuestros documentos de prueba abajo.'
      );
      setCameraActive(false);
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Función de Captura de Foto
  const capturePhoto = () => {
    if (!videoRef.current || !stream) return;

    setIsCapturing(true);
    
    // Crear un canvas para capturar el frame del video
    const canvas = document.createElement('canvas');
    const video = videoRef.current;
    
    // Conservar proporciones nativas del video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Efecto espejo si la cámara es frontal (facetime, etc.), pero por defecto facingMode environment no lo necesita
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg', 0.9);
      
      const newPage: ScannedPage = {
        id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        originalImage: base64,
        processedImage: base64,
        adjustments: createDefaultAdjustments(),
      };
      
      setSessionPages((prev) => [...prev, newPage]);
    }

    // Animación de flash rápido
    setTimeout(() => {
      setIsCapturing(false);
    }, 200);
  };

  // Carga de archivo desde galeria
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file: any) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const base64 = event.target.result as string;
          const newPage: ScannedPage = {
            id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            originalImage: base64,
            processedImage: base64,
            adjustments: createDefaultAdjustments(),
          };
          setSessionPages((prev) => [...prev, newPage]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Importar documento de prueba rápido
  const handleImportSample = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result) {
          const base64 = reader.result as string;
          const newPage: ScannedPage = {
            id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            originalImage: base64,
            processedImage: base64,
            adjustments: createDefaultAdjustments(),
          };
          setSessionPages((prev) => [...prev, newPage]);
        }
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      // Si falla por CORS de Unsplash en el sandbox, cargamos una versión Canvas hecha al vuelo
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 800;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#f5eedc';
        ctx.fillRect(0, 0, 600, 800);
        ctx.fillStyle = '#111';
        ctx.font = 'bold 24px monospace';
        ctx.fillText('CONTRATO DE SERVICIOS', 50, 80);
        ctx.font = '14px monospace';
        ctx.fillText('1. Objeto del acuerdo...', 50, 140);
        ctx.fillText('El prestador se compromete a realizar un', 50, 170);
        ctx.fillText('rediseño completo de la interfaz móvil.', 50, 200);
        ctx.fillText('2. Plazo de entrega: 15 de Julio', 50, 250);
        ctx.strokeRect(20, 20, 560, 760);
        const base64 = canvas.toDataURL('image/jpeg');
        const newPage: ScannedPage = {
          id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          originalImage: base64,
          processedImage: base64,
          adjustments: createDefaultAdjustments(),
        };
        setSessionPages((prev) => [...prev, newPage]);
      }
    }
  };

  // Confirmar y avanzar
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
          Escanear Páginas ({sessionPages.length})
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

      {/* Visor de Cámara o Fallback */}
      <div className="flex-1 relative flex flex-col items-center justify-center overflow-hidden">
        {/* Flash Animation Overlay */}
        {isCapturing && <div className="absolute inset-0 bg-white z-50 animate-flash"></div>}

        {cameraActive ? (
          <div className="relative w-full h-full max-w-lg aspect-[3/4] bg-black flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Guía de encuadre de documento */}
            <div className="absolute inset-8 border-[2px] border-dashed border-white/60 rounded-xl pointer-events-none flex items-center justify-center">
              <div className="w-16 h-16 border-t-2 border-l-2 border-[#2979FF] absolute top-0 left-0 rounded-tl-lg"></div>
              <div className="w-16 h-16 border-t-2 border-r-2 border-[#2979FF] absolute top-0 right-0 rounded-tr-lg"></div>
              <div className="w-16 h-16 border-b-2 border-l-2 border-[#2979FF] absolute bottom-0 left-0 rounded-bl-lg"></div>
              <div className="w-16 h-16 border-b-2 border-r-2 border-[#2979FF] absolute bottom-0 right-0 rounded-br-lg"></div>
              <span className="text-[11px] text-white/70 bg-black/50 px-2.5 py-1 rounded-full backdrop-blur-sm">
                Encuadra el documento aquí
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center max-w-md p-6 text-center">
            <div className="w-16 h-16 bg-[#2C2C2E] border border-white/10 rounded-2xl flex items-center justify-center text-amber-500 mb-4">
              <AlertTriangle size={32} />
            </div>
            <h4 className="text-base font-semibold mb-2">Cámara física no disponible</h4>
            <p className="text-xs text-gray-400 mb-6 px-4">
              {cameraError || 'Activa la cámara o selecciona archivos locales para simular el escaneo.'}
            </p>

            {/* Acciones de Fallback */}
            <div className="flex flex-col gap-3 w-full px-6">
              <button
                id="upload-file-btn"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2.5 py-3 px-5 bg-[#1C1C1E] hover:bg-[#2C2C2E] border border-[#3C3C3E] rounded-xl text-sm font-semibold transition-colors"
              >
                <Upload size={16} className="text-[#2979FF]" />
                Subir foto desde galería
              </button>

              <div className="flex items-center my-2">
                <div className="h-[1px] bg-white/10 flex-grow"></div>
                <span className="text-[10px] text-gray-500 uppercase px-3 tracking-wider">o usa un demo</span>
                <div className="h-[1px] bg-white/10 flex-grow"></div>
              </div>

              {/* Botones de demostración */}
              <div className="grid grid-cols-3 gap-2">
                {SAMPLE_MOCKS.map((sample, idx) => (
                  <button
                    id={`sample-mock-btn-${idx}`}
                    key={idx}
                    onClick={() => handleImportSample(sample.url)}
                    className="p-2 bg-[#1C1C1E] hover:bg-[#2C2C2E] border border-[#3C3C3E] rounded-xl text-center transition-all flex flex-col items-center gap-1.5"
                  >
                    <ImageIcon size={14} className="text-gray-400" />
                    <span className="text-[9px] font-medium leading-tight text-gray-300 break-words line-clamp-2">
                      {sample.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input de archivo oculto */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Controles de cámara inferiores */}
      <div className="bg-[#1C1C1E] border-t border-[#2C2C2E] p-4 flex flex-col gap-3">
        {/* Tira horizontal de páginas ya escaneadas */}
        {sessionPages.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto py-1">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 shrink-0">
              Capturado:
            </span>
            <div className="flex gap-2">
              {sessionPages.map((page, idx) => (
                <div key={page.id} className="relative w-12 h-16 bg-black rounded-md overflow-hidden border border-[#2C2C2E]">
                  <img
                    src={page.processedImage}
                    className="w-full h-full object-cover"
                    alt={`página ${idx + 1}`}
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute top-0 right-0 bg-[#2979FF] text-white text-[9px] w-4 h-4 flex items-center justify-center font-bold rounded-bl-md">
                    {idx + 1}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Botones de Acción */}
        <div className="flex items-center justify-between px-6">
          {/* Botón Galería rápido */}
          <button
            id="quick-gallery-btn"
            onClick={() => fileInputRef.current?.click()}
            className="p-3 text-gray-400 hover:text-white hover:bg-[#2C2C2E] rounded-xl transition-colors"
            title="Importar imagen"
          >
            <Upload size={20} />
          </button>

          {/* Botón Disparador Principal */}
          <button
            id="shutter-capture-btn"
            disabled={!cameraActive}
            onClick={capturePhoto}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
              cameraActive
                ? 'bg-white p-1 hover:scale-105 active:scale-95'
                : 'bg-gray-800 p-1 cursor-not-allowed opacity-50'
            }`}
          >
            <div className={`w-full h-full rounded-full border-2 ${cameraActive ? 'border-black bg-white' : 'border-gray-900 bg-gray-800'} flex items-center justify-center`}>
              <div className="w-4 h-4 rounded-full bg-[#2979FF]"></div>
            </div>
          </button>

          {/* Reintentar iniciar cámara */}
          <button
            id="refresh-camera-btn"
            onClick={startCamera}
            className="p-3 text-gray-400 hover:text-white hover:bg-[#2C2C2E] rounded-xl transition-colors"
            title="Recargar cámara"
          >
            <RefreshCw size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
