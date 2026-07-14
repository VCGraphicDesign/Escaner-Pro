/**
 * Página de escaneo - Vista de cámara
 */

import { CameraScanner } from '../components/scan/CameraView';

interface ScanPageProps {
  onCapture: (base64: string) => void;
  onCancel: () => void;
}

export function ScanPage({ onCapture, onCancel }: ScanPageProps) {
  return (
    <CameraScanner
      onCapture={onCapture}
      onCancel={onCancel}
    />
  );
}
