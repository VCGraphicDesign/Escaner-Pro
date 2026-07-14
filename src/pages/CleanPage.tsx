/**
 * Página de limpieza - Recorte y filtros de imagen
 */

import { PerspectiveCropper } from '../components/clean/CropTool';

interface CleanPageProps {
  imageSrc: string;
  onCropComplete: (cropPoints: { x: number; y: number }[]) => void;
  onCancel: () => void;
}

export function CleanPage({ imageSrc, onCropComplete, onCancel }: CleanPageProps) {
  return (
    <PerspectiveCropper
      imageSrc={imageSrc}
      onCropComplete={onCropComplete}
      onCancel={onCancel}
    />
  );
}
