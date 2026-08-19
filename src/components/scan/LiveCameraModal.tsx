/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  X,
  RotateCcw,
  Sparkles,
  AlertCircle,
  Loader2,
  Maximize2,
  Scan,
} from 'lucide-react';

interface LiveCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (base64Image: string) => void;
}

export default function LiveCameraModal({ isOpen, onClose, onCapture }: LiveCameraModalProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Detener el stream de cámara actual
  const stopStream = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  // Iniciar la cámara seleccionada
  const startCamera = useCallback(
    async (deviceId?: string) => {
      setIsLoading(true);
      setErrorMsg(null);

      // Detener stream previo
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Tu navegador no soporta acceso directo a la cámara WebRTC.');
        }

        const constraints: MediaStreamConstraints = {
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        setStream(mediaStream);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          await videoRef.current.play();
        }

        // Obtener lista de cámaras disponibles
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === 'videoinput');
        setCameras(videoDevices);

        // Identificar la cámara activa
        const activeTrack = mediaStream.getVideoTracks()[0];
        const activeSettings = activeTrack?.getSettings();
        if (activeSettings?.deviceId) {
          setSelectedCameraId(activeSettings.deviceId);
        } else if (deviceId) {
          setSelectedCameraId(deviceId);
        } else if (videoDevices.length > 0) {
          setSelectedCameraId(videoDevices[0].deviceId);
        }

        setIsLoading(false);
      } catch (err: any) {
        console.error('Error accediendo a la cámara:', err);
        setIsLoading(false);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setErrorMsg('Permiso de cámara denegado. Por favor permite el acceso a la cámara en los permisos de tu navegador.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setErrorMsg('No se encontró ninguna cámara conectada a este dispositivo.');
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          setErrorMsg('La cámara está en uso por otra aplicación. Ciérrala e intenta de nuevo.');
        } else {
          setErrorMsg(err.message || 'No se pudo iniciar la cámara.');
        }
      }
    },
    [stream]
  );

  // Al abrir el modal, iniciar la cámara
  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopStream();
    }
    return () => {
      stopStream();
    };
  }, [isOpen]);

  // Cambiar entre cámaras disponibles
  const handleSwitchCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex((c) => c.deviceId === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCamera = cameras[nextIndex];
    setSelectedCameraId(nextCamera.deviceId);
    startCamera(nextCamera.deviceId);
  };

  // Capturar fotograma en alta resolución
  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    // Efecto de flash visual
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 200);

    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Dibujar el fotograma del video en el canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Obtener la imagen en alta calidad
    const base64 = canvas.toDataURL('image/jpeg', 0.95);

    // Enviar la captura al componente padre
    onCapture(base64);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-between select-none overflow-hidden animate-fade-in">
      {/* 1. Barra Superior con controles */}
      <div className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent z-20">
        <button
          onClick={() => {
            stopStream();
            onClose();
          }}
          className="p-2 text-white bg-white/10 hover:bg-white/20 active:scale-95 rounded-full backdrop-blur-md transition-all"
          title="Cerrar cámara"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-1.5 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full border border-white/10">
          <Scan size={14} className="text-[#2979FF]" />
          <span className="text-xs font-semibold tracking-wide text-white">Cámara en Vivo</span>
        </div>

        {cameras.length > 1 ? (
          <button
            onClick={handleSwitchCamera}
            className="p-2 text-white bg-white/10 hover:bg-white/20 active:scale-95 rounded-full backdrop-blur-md transition-all flex items-center gap-1 text-xs font-bold"
            title="Cambiar de cámara"
          >
            <RotateCcw size={18} />
          </button>
        ) : (
          <div className="w-9" />
        )}
      </div>

      {/* 2. Visor de Cámara en Tiempo Real con Guía de Documento */}
      <div className="relative w-full flex-1 flex items-center justify-center bg-black overflow-hidden">
        {/* Elemento de Video WebRTC */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-contain transition-opacity duration-300 ${
            isLoading ? 'opacity-0' : 'opacity-100'
          }`}
        />

        {/* Efecto Flash de Obturación */}
        {isFlashing && (
          <div className="absolute inset-0 bg-white pointer-events-none z-30 transition-opacity duration-150" />
        )}

        {/* Loading Spinner */}
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[#2979FF] bg-black/90 z-20">
            <Loader2 size={36} className="animate-spin" />
            <span className="text-xs font-semibold text-gray-300">Iniciando cámara...</span>
          </div>
        )}

        {/* Mensaje de Error / Permiso */}
        {errorMsg && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-black/95 z-30">
            <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-3">
              <AlertCircle size={28} />
            </div>
            <h4 className="text-sm font-bold text-white mb-2">No se pudo acceder a la cámara</h4>
            <p className="text-xs text-gray-400 max-w-xs mb-5 leading-relaxed">{errorMsg}</p>
            <button
              onClick={() => startCamera(selectedCameraId)}
              className="px-5 py-2.5 bg-[#2979FF] hover:bg-[#2979FF]/90 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-lg"
            >
              Reintentar acceso
            </button>
          </div>
        )}

        {/* Guía Visual para encuadrar el Documento */}
        {!isLoading && !errorMsg && (
          <div className="absolute inset-6 pointer-events-none flex flex-col items-center justify-center z-10">
            <div className="w-full max-w-sm aspect-[3/4] border-2 border-dashed border-[#2979FF]/60 rounded-3xl relative flex items-center justify-center shadow-[0_0_50px_rgba(41,121,255,0.15)]">
              {/* 4 Esquinas destacadas */}
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-[#2979FF] rounded-tl-xl" />
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-[#2979FF] rounded-tr-xl" />
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-[#2979FF] rounded-bl-xl" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-[#2979FF] rounded-br-xl" />

              <span className="text-[11px] font-semibold text-white/80 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                Alinea el documento aquí
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 3. Barra Inferior con Botón de Disparo / Captura */}
      <div className="w-full pb-8 pt-4 px-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex items-center justify-center z-20">
        <button
          onClick={handleCapture}
          disabled={isLoading || !!errorMsg}
          className={`relative group w-20 h-20 rounded-full border-4 border-white/80 p-1 flex items-center justify-center shadow-2xl transition-all ${
            isLoading || !!errorMsg
              ? 'opacity-40 cursor-not-allowed'
              : 'hover:scale-105 active:scale-90 cursor-pointer shadow-[#2979FF]/40'
          }`}
          title="Tomar foto del documento"
        >
          {/* Círculo interno disparador */}
          <div className="w-full h-full rounded-full bg-[#2979FF] group-hover:bg-[#2979FF]/90 transition-all flex items-center justify-center text-white shadow-inner">
            <Camera size={26} />
          </div>
        </button>
      </div>

      {/* Canvas oculto para procesar el fotograma */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
