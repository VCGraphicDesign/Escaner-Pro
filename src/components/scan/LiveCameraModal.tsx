/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  X,
  RotateCcw,
  AlertCircle,
  Loader2,
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

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === 'videoinput');
        setCameras(videoDevices);

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
          setErrorMsg('Permiso de cámara denegado. Permite el acceso en la barra de direcciones de tu navegador.');
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

  // Capturar fotograma en máxima resolución nítida
  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    // Efecto de flash visual
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 200);

    // 1. Dibujar fotograma en máxima resolución
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = video.videoWidth;
    fullCanvas.height = video.videoHeight;
    const fullCtx = fullCanvas.getContext('2d', { willReadFrequently: true });
    if (!fullCtx) return;

    fullCtx.drawImage(video, 0, 0, fullCanvas.width, fullCanvas.height);

    // 2. Exportar la imagen en alta calidad
    const base64Image = fullCanvas.toDataURL('image/jpeg', 0.95);

    // 3. Detener stream y enviar la imagen capturada
    stopStream();
    onCapture(base64Image);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-between select-none overflow-hidden animate-fade-in">
      {/* 1. Barra Superior */}
      <div className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/90 to-transparent z-20">
        <button
          onClick={() => {
            stopStream();
            onClose();
          }}
          className="p-2 text-white bg-white/10 hover:bg-white/20 active:scale-95 rounded-full backdrop-blur-md transition-all cursor-pointer"
          title="Cerrar cámara"
        >
          <X size={20} />
        </button>

        {/* Indicador limpio de encuadre */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md bg-white/10 border border-white/15 text-white">
          <Scan size={14} className="text-[#2979FF]" />
          <span className="text-xs font-semibold tracking-wide">Cámara Lista</span>
        </div>

        {cameras.length > 1 ? (
          <button
            onClick={handleSwitchCamera}
            className="p-2 text-white bg-white/10 hover:bg-white/20 active:scale-95 rounded-full backdrop-blur-md transition-all flex items-center gap-1 text-xs font-bold cursor-pointer"
            title="Cambiar de cámara"
          >
            <RotateCcw size={18} />
          </button>
        ) : (
          <div className="w-9" />
        )}
      </div>

      {/* 2. Visor de Cámara con Marco de Encuadre Fijo y Elegante */}
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

        {/* Guía de Encuadre fija (sin predicciones que salten o bailen) */}
        {!isLoading && !errorMsg && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-8 z-10">
            <div className="relative w-full max-w-md aspect-[3/4] border-2 border-white/40 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] flex flex-col justify-between p-3">
              {/* 4 esquinas acentuadas */}
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-[#2979FF] rounded-tl-xl -mt-0.5 -ml-0.5" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-[#2979FF] rounded-tr-xl -mt-0.5 -mr-0.5" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-[#2979FF] rounded-bl-xl -mb-0.5 -ml-0.5" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-[#2979FF] rounded-br-xl -mb-0.5 -mr-0.5" />

              {/* Guía de centro */}
              <div className="w-full flex justify-center">
                <span className="text-[11px] font-medium text-white/80 bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">
                  Centra el documento o texto aquí
                </span>
              </div>
            </div>
          </div>
        )}

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
              className="px-5 py-2.5 bg-[#2979FF] hover:bg-[#2979FF]/90 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-lg cursor-pointer"
            >
              Reintentar acceso
            </button>
          </div>
        )}
      </div>

      {/* 3. Barra Inferior con Botón de Disparo Limpio */}
      <div className="w-full pb-8 pt-4 px-6 bg-gradient-to-t from-black/95 via-black/70 to-transparent flex flex-col items-center gap-3 z-20">
        <p className="text-[11px] text-gray-300 font-medium">
          Presiona el botón para tomar la foto
        </p>

        <button
          onClick={handleCapture}
          disabled={isLoading || !!errorMsg}
          className={`relative group w-20 h-20 rounded-full border-4 border-white/90 p-1 flex items-center justify-center shadow-2xl shadow-[#2979FF]/40 transition-all ${
            isLoading || !!errorMsg
              ? 'opacity-40 cursor-not-allowed'
              : 'hover:scale-105 active:scale-95 cursor-pointer'
          }`}
          title="Tomar foto"
        >
          {/* Círculo interno disparador */}
          <div className="w-full h-full rounded-full bg-[#2979FF] group-hover:bg-[#1E6BE6] transition-all flex items-center justify-center text-white shadow-inner">
            <Camera size={28} className="text-white" />
          </div>
        </button>
      </div>
    </div>
  );
}
