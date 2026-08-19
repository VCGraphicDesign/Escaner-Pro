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
  Scan,
  CheckCircle2,
  Zap,
} from 'lucide-react';
import { CropPoints } from '../../types';
import { applyPerspectiveCrop } from '../../services/imageProcessor';
import { detectOpenCVCorners } from '../../services/opencvDetector';

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
  const [hasDetectedDoc, setHasDetectedDoc] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Coordenadas suavizadas del documento detectado en tiempo real
  const currentCropRef = useRef<CropPoints>({
    topLeft: { x: 0.1, y: 0.1 },
    topRight: { x: 0.9, y: 0.1 },
    bottomRight: { x: 0.9, y: 0.9 },
    bottomLeft: { x: 0.1, y: 0.9 },
  });

  // Detener el stream de cámara actual
  const stopStream = useCallback(() => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
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

  // Bucle de Visión por Computadora en Tiempo Real
  const runLiveEdgeDetection = useCallback(() => {
    const video = videoRef.current;
    const overlay = overlayCanvasRef.current;
    const sampleCanvas = sampleCanvasRef.current;

    if (!video || !overlay || !sampleCanvas || video.readyState < 2 || video.videoWidth === 0) {
      animFrameIdRef.current = requestAnimationFrame(runLiveEdgeDetection);
      return;
    }

    // 1. Sincronizar tamaño del canvas overlay con el elemento de video en pantalla
    const rect = video.getBoundingClientRect();
    if (overlay.width !== rect.width || overlay.height !== rect.height) {
      overlay.width = rect.width;
      overlay.height = rect.height;
    }

    const overlayCtx = overlay.getContext('2d', { willReadFrequently: true });
    if (!overlayCtx) {
      animFrameIdRef.current = requestAnimationFrame(runLiveEdgeDetection);
      return;
    }

    // 2. Muestrear el fotograma en baja resolución para detección ultrarrápida (30+ FPS)
    const sampleW = 200;
    const sampleH = Math.max(30, Math.round((sampleW * video.videoHeight) / video.videoWidth));
    if (sampleCanvas.width !== sampleW || sampleCanvas.height !== sampleH) {
      sampleCanvas.width = sampleW;
      sampleCanvas.height = sampleH;
    }

    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!sampleCtx) {
      animFrameIdRef.current = requestAnimationFrame(runLiveEdgeDetection);
      return;
    }

    sampleCtx.drawImage(video, 0, 0, sampleW, sampleH);
    const imgData = sampleCtx.getImageData(0, 0, sampleW, sampleH);
    const data = imgData.data;

    // 3. Detección de Bordes con OpenCV.js (Canny + findContours + approxPolyDP)
    const openCVCrop = detectOpenCVCorners(sampleCanvas);
    let targetCrop: CropPoints;
    let isDetected = false;

    if (openCVCrop) {
      targetCrop = openCVCrop;
      isDetected = true;
      setHasDetectedDoc(true);
    } else {
      // Fallback a gradientes Sobel si OpenCV.js aún se está descargando
      const totalPixels = sampleW * sampleH;
      const gray = new Uint8Array(totalPixels);
      for (let i = 0; i < data.length; i += 4) {
        gray[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      }

      const colEdges = new Uint32Array(sampleW);
      const rowEdges = new Uint32Array(sampleH);

      for (let y = 1; y < sampleH - 1; y++) {
        for (let x = 1; x < sampleW - 1; x++) {
          const idx = y * sampleW + x;
          const gx = Math.abs(gray[idx + 1] - gray[idx - 1]);
          const gy = Math.abs(gray[idx + sampleW] - gray[idx - sampleW]);
          const mag = gx + gy;
          if (mag > 24) {
            colEdges[x]++;
            rowEdges[y]++;
          }
        }
      }

      let maxColEdge = 0;
      for (let x = 0; x < sampleW; x++) if (colEdges[x] > maxColEdge) maxColEdge = colEdges[x];
      let maxRowEdge = 0;
      for (let y = 0; y < sampleH; y++) if (rowEdges[y] > maxRowEdge) maxRowEdge = rowEdges[y];

      const colThresh = Math.max(2, maxColEdge * 0.14);
      const rowThresh = Math.max(2, maxRowEdge * 0.14);

      let minX = 0, maxX = sampleW - 1, minY = 0, maxY = sampleH - 1;

      for (let x = 0; x < Math.floor(sampleW * 0.45); x++) {
        if (colEdges[x] >= colThresh) { minX = Math.max(0, x - 1); break; }
      }
      for (let x = sampleW - 1; x > Math.floor(sampleW * 0.55); x--) {
        if (colEdges[x] >= colThresh) { maxX = Math.min(sampleW - 1, x + 1); break; }
      }
      for (let y = 0; y < Math.floor(sampleH * 0.45); y++) {
        if (rowEdges[y] >= rowThresh) { minY = Math.max(0, y - 1); break; }
      }
      for (let y = sampleH - 1; y > Math.floor(sampleH * 0.55); y--) {
        if (rowEdges[y] >= rowThresh) { maxY = Math.min(sampleH - 1, y + 1); break; }
      }

      const docWidth = maxX - minX;
      const docHeight = maxY - minY;
      isDetected = docWidth > sampleW * 0.18 && docHeight > sampleH * 0.18 && docWidth < sampleW * 0.94 && docHeight < sampleH * 0.94;

      if (isDetected) {
        targetCrop = {
          topLeft: { x: Math.max(0.01, minX / sampleW), y: Math.max(0.01, minY / sampleH) },
          topRight: { x: Math.min(0.99, maxX / sampleW), y: Math.max(0.01, minY / sampleH) },
          bottomRight: { x: Math.min(0.99, maxX / sampleW), y: Math.min(0.99, maxY / sampleH) },
          bottomLeft: { x: Math.max(0.01, minX / sampleW), y: Math.min(0.99, maxY / sampleH) },
        };
        setHasDetectedDoc(true);
      } else {
        targetCrop = {
          topLeft: { x: 0.15, y: 0.15 },
          topRight: { x: 0.85, y: 0.15 },
          bottomRight: { x: 0.85, y: 0.85 },
          bottomLeft: { x: 0.15, y: 0.85 },
        };
        setHasDetectedDoc(false);
      }
    }

    // 4. Suavizado temporal exponencial (EMA) para eliminar temblores
    const alpha = 0.55;
    const cur = currentCropRef.current;
    cur.topLeft.x = cur.topLeft.x * (1 - alpha) + targetCrop.topLeft.x * alpha;
    cur.topLeft.y = cur.topLeft.y * (1 - alpha) + targetCrop.topLeft.y * alpha;
    cur.topRight.x = cur.topRight.x * (1 - alpha) + targetCrop.topRight.x * alpha;
    cur.topRight.y = cur.topRight.y * (1 - alpha) + targetCrop.topRight.y * alpha;
    cur.bottomRight.x = cur.bottomRight.x * (1 - alpha) + targetCrop.bottomRight.x * alpha;
    cur.bottomRight.y = cur.bottomRight.y * (1 - alpha) + targetCrop.bottomRight.y * alpha;
    cur.bottomLeft.x = cur.bottomLeft.x * (1 - alpha) + targetCrop.bottomLeft.x * alpha;
    cur.bottomLeft.y = cur.bottomLeft.y * (1 - alpha) + targetCrop.bottomLeft.y * alpha;

    // 5. Dibujar el Polígono Iluminado en Tiempo Real sobre el Video
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

    const ow = overlay.width;
    const oh = overlay.height;

    const p0 = { x: cur.topLeft.x * ow, y: cur.topLeft.y * oh };
    const p1 = { x: cur.topRight.x * ow, y: cur.topRight.y * oh };
    const p2 = { x: cur.bottomRight.x * ow, y: cur.bottomRight.y * oh };
    const p3 = { x: cur.bottomLeft.x * ow, y: cur.bottomLeft.y * oh };

    // Sombra oscura exterior para enfocar el documento
    overlayCtx.save();
    overlayCtx.beginPath();
    overlayCtx.rect(0, 0, ow, oh);
    overlayCtx.moveTo(p0.x, p0.y);
    overlayCtx.lineTo(p3.x, p3.y);
    overlayCtx.lineTo(p2.x, p2.y);
    overlayCtx.lineTo(p1.x, p1.y);
    overlayCtx.closePath();
    overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    overlayCtx.fill();

    // Relleno iluminado del documento
    overlayCtx.beginPath();
    overlayCtx.moveTo(p0.x, p0.y);
    overlayCtx.lineTo(p1.x, p1.y);
    overlayCtx.lineTo(p2.x, p2.y);
    overlayCtx.lineTo(p3.x, p3.y);
    overlayCtx.closePath();

    const glowColor = isDetected ? '#00E676' : '#2979FF';
    overlayCtx.fillStyle = isDetected ? 'rgba(0, 230, 118, 0.12)' : 'rgba(41, 121, 255, 0.08)';
    overlayCtx.fill();

    // Borde brillante
    overlayCtx.lineWidth = isDetected ? 3 : 2;
    overlayCtx.strokeStyle = glowColor;
    overlayCtx.shadowColor = glowColor;
    overlayCtx.shadowBlur = isDetected ? 14 : 6;
    overlayCtx.stroke();
    overlayCtx.restore();

    // 4 Esquinas Circulares con Mangos de Ajuste
    [p0, p1, p2, p3].forEach((pt) => {
      overlayCtx.save();
      overlayCtx.beginPath();
      overlayCtx.arc(pt.x, pt.y, isDetected ? 8 : 6, 0, Math.PI * 2);
      overlayCtx.fillStyle = '#FFFFFF';
      overlayCtx.shadowColor = glowColor;
      overlayCtx.shadowBlur = 10;
      overlayCtx.fill();
      overlayCtx.lineWidth = 2.5;
      overlayCtx.strokeStyle = glowColor;
      overlayCtx.stroke();
      overlayCtx.restore();
    });

    animFrameIdRef.current = requestAnimationFrame(runLiveEdgeDetection);
  }, []);

  // Iniciar la detección en cuanto el video comience
  useEffect(() => {
    if (isOpen && !isLoading) {
      animFrameIdRef.current = requestAnimationFrame(runLiveEdgeDetection);
    }
    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
    };
  }, [isOpen, isLoading, runLiveEdgeDetection]);

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

  // Capturar fotograma en alta resolución y recortar según los bordes detectados en vivo
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

    // 2. Aplicar el recorte de perspectiva usando las esquinas detectadas en tiempo real
    const cropCoords = currentCropRef.current;
    const croppedCanvas = document.createElement('canvas');
    applyPerspectiveCrop(fullCanvas, croppedCanvas, cropCoords);

    // 3. Exportar la imagen ya recortada y aplanada
    const croppedBase64 = croppedCanvas.toDataURL('image/jpeg', 0.95);

    // 4. Enviar la imagen recortada
    onCapture(croppedBase64);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-between select-none overflow-hidden animate-fade-in">
      {/* 1. Barra Superior con controles y estado de detección */}
      <div className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/90 to-transparent z-20">
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

        {/* Badge en vivo de estado de detección */}
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md border transition-all duration-300 ${
            hasDetectedDoc
              ? 'bg-[#00E676]/20 border-[#00E676]/50 text-[#00E676]'
              : 'bg-white/10 border-white/10 text-white'
          }`}
        >
          {hasDetectedDoc ? (
            <>
              <CheckCircle2 size={13} className="animate-pulse" />
              <span className="text-xs font-bold tracking-wide">Documento Detectado</span>
            </>
          ) : (
            <>
              <Scan size={13} className="text-[#2979FF]" />
              <span className="text-xs font-semibold tracking-wide">Buscando bordes...</span>
            </>
          )}
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

      {/* 2. Visor de Cámara con Canvas Overlay de Detección de Bordes en Tiempo Real */}
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

        {/* Canvas Overlay donde se dibuja el polígono de selección en tiempo real */}
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
        />

        {/* Efecto Flash de Obturación */}
        {isFlashing && (
          <div className="absolute inset-0 bg-white pointer-events-none z-30 transition-opacity duration-150" />
        )}

        {/* Loading Spinner */}
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[#2979FF] bg-black/90 z-20">
            <Loader2 size={36} className="animate-spin" />
            <span className="text-xs font-semibold text-gray-300">Iniciando cámara inteligente...</span>
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
      </div>

      {/* 3. Barra Inferior con Botón de Disparo / Captura */}
      <div className="w-full pb-8 pt-4 px-6 bg-gradient-to-t from-black/95 via-black/70 to-transparent flex flex-col items-center gap-3 z-20">
        <p className="text-[11px] text-gray-400 font-medium">
          {hasDetectedDoc
            ? '✨ Bordes fijados. Presiona para recortar y escanear'
            : 'Enfoca el documento sobre una superficie plana'}
        </p>

        <button
          onClick={handleCapture}
          disabled={isLoading || !!errorMsg}
          className={`relative group w-20 h-20 rounded-full border-4 p-1 flex items-center justify-center shadow-2xl transition-all ${
            hasDetectedDoc
              ? 'border-[#00E676] shadow-[#00E676]/40 scale-105'
              : 'border-white/80 shadow-[#2979FF]/30'
          } ${
            isLoading || !!errorMsg
              ? 'opacity-40 cursor-not-allowed'
              : 'hover:scale-110 active:scale-90 cursor-pointer'
          }`}
          title="Capturar y recortar documento"
        >
          {/* Círculo interno disparador */}
          <div
            className={`w-full h-full rounded-full transition-all flex items-center justify-center text-white shadow-inner ${
              hasDetectedDoc ? 'bg-[#00E676]' : 'bg-[#2979FF] group-hover:bg-[#2979FF]/90'
            }`}
          >
            <Camera size={26} className={hasDetectedDoc ? 'text-black' : 'text-white'} />
          </div>
        </button>
      </div>

      {/* Canvas oculto para muestreo de fotogramas */}
      <canvas ref={sampleCanvasRef} className="hidden" />
    </div>
  );
}
