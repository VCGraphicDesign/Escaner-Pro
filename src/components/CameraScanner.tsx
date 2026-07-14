import React, { useRef, useState, useEffect } from 'react';
import { RefreshCw, Upload, X } from 'lucide-react';


interface CameraScannerProps {
  onCapture: (imageBase64: string) => void;
  onCancel: () => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ onCapture, onCancel }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string>('');
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load list of cameras and initialize
  useEffect(() => {
    let active = true;
    const getCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((device) => device.kind === 'videoinput');
        if (active) {
          setCameras(videoDevices);

          if (videoDevices.length > 0) {
            // Prefer rear camera if available
            const environmentCamera = videoDevices.find(
              (d) => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment')
            );
            setActiveCameraId(environmentCamera?.deviceId || videoDevices[0].deviceId);
          }
        }
      } catch (err) {
        console.error('Error listing cameras:', err);
      }
    };

    getCameras();

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Handle active camera streaming
  useEffect(() => {
    let active = true;

    const startStream = async (deviceId: string) => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      try {
        const constraints: MediaStreamConstraints = {
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            : { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (active) {
          streamRef.current = mediaStream;
          if (videoRef.current) {
            videoRef.current.srcObject = mediaStream;
          }
          setHasError(false);
        } else {
          mediaStream.getTracks().forEach((track) => track.stop());
        }
      } catch (err) {
        console.error('Error starting video stream:', err);
        // Try fallback to standard front/environment resolution
        try {
          const mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
          });
          if (active) {
            streamRef.current = mediaStream;
            if (videoRef.current) {
              videoRef.current.srcObject = mediaStream;
            }
            setHasError(false);
          } else {
            mediaStream.getTracks().forEach((track) => track.stop());
          }
        } catch {
          if (active) {
            setHasError(true);
            setErrorMsg('No se pudo acceder a la cámara. Por favor suba un archivo o revise los permisos de su navegador.');
          }
        }
      }
    };

    if (activeCameraId) {
      startStream(activeCameraId);
    }

    return () => {
      active = false;
    };
  }, [activeCameraId]);

  // Flip Front/Back Camera
  const toggleCamera = () => {
    if (cameras.length < 2) return;
    const currentIndex = cameras.findIndex((c) => c.deviceId === activeCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    setActiveCameraId(cameras[nextIndex].deviceId);
  };

  // Capture image frame
  const takeSnapshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    
    // Create offscreen canvas with same dimensions as video source
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Draw frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      onCapture(dataUrl);
    }
  };

  // Handle uploaded files
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        onCapture(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const triggerUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="camera-viewport flex-1 flex flex-col relative bg-slate-950 overflow-hidden">
      {/* Video Viewport */}
      {!hasError ? (
        <div className="relative flex-1 w-full h-full flex items-center justify-center bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover max-h-[80vh] md:max-h-full"
          />
          
          {/* Scanning Box Guide Overlay */}
          <div className="absolute inset-0 border-[40px] border-slate-950/70 pointer-events-none flex items-center justify-center">
            <div className="w-[85vw] max-w-[420px] h-[55vh] max-h-[600px] border-2 border-dashed border-cyan-400 rounded-lg relative shadow-[0_0_20px_rgba(34,211,238,0.2)]">
              {/* Corner brackets representation */}
              <div className="absolute -top-1.5 -left-1.5 w-6 h-6 border-t-4 border-l-4 border-cyan-400 rounded-tl-md"></div>
              <div className="absolute -top-1.5 -right-1.5 w-6 h-6 border-t-4 border-r-4 border-cyan-400 rounded-tr-md"></div>
              <div className="absolute -bottom-1.5 -left-1.5 w-6 h-6 border-b-4 border-l-4 border-cyan-400 rounded-bl-md"></div>
              <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 border-b-4 border-r-4 border-cyan-400 rounded-br-md"></div>
              <p className="absolute bottom-4 left-0 right-0 text-center text-xs text-cyan-200 font-medium tracking-wide uppercase bg-slate-950/60 py-1.5 px-3 rounded-full mx-auto w-fit backdrop-blur-md">
                Alinea el documento aquí
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-900 border-2 border-dashed border-slate-700 m-4 rounded-xl">
          <Upload className="w-16 h-16 text-slate-500 mb-4 animate-bounce" />
          <h3 className="text-xl font-semibold text-slate-200 mb-2">Escaneo de archivos local</h3>
          <p className="text-slate-400 max-w-sm mb-6 text-sm">{errorMsg}</p>
          <button
            onClick={triggerUploadClick}
            className="btn btn-primary px-6 py-3 flex items-center justify-center gap-2"
          >
            <Upload className="w-5 h-5" />
            Seleccionar documento de la galería
          </button>
        </div>
      )}

      {/* Invisible inputs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*"
        className="hidden"
      />

      {/* Control bar */}
      <div className="camera-controls w-full bg-slate-900/90 backdrop-blur-md border-t border-slate-800 p-6 flex items-center justify-between z-10">
        <button
          onClick={onCancel}
          className="btn btn-secondary p-3 rounded-full flex items-center justify-center text-slate-400 hover:text-white"
          title="Cancelar"
        >
          <X className="w-6 h-6" />
        </button>

        {!hasError && (
          <button
            onClick={takeSnapshot}
            className="w-16 h-16 rounded-full bg-white border-4 border-slate-400 shadow-[0_0_15px_rgba(255,255,255,0.4)] flex items-center justify-center transform active:scale-95 transition-all"
            title="Capturar foto"
          >
            <div className="w-8 h-8 rounded-full bg-slate-950"></div>
          </button>
        )}

        <div className="flex gap-3">
          {!hasError && cameras.length > 1 && (
            <button
              onClick={toggleCamera}
              className="btn btn-secondary p-3 rounded-full flex items-center justify-center text-slate-300 hover:text-white"
              title="Cambiar Cámara"
            >
              <RefreshCw className="w-6 h-6" />
            </button>
          )}

          <button
            onClick={triggerUploadClick}
            className="btn btn-secondary p-3 rounded-full flex items-center justify-center text-slate-300 hover:text-white"
            title="Subir archivo"
          >
            <Upload className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};
