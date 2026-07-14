/**
 * Servicio para generar PDFs usando jspdf
 */

import jsPDF from 'jspdf';

export interface PDFOptions {
  format: 'a4' | 'letter';
  orientation: 'portrait' | 'landscape';
  quality: number;
}

/**
 * Genera un PDF a partir de imágenes base64
 */
export async function generatePDF(
  images: string[],
  _filename: string,
  options: PDFOptions = { format: 'a4', orientation: 'portrait', quality: 0.9 }
): Promise<Blob> {
  const pdf = new jsPDF({
    orientation: options.orientation,
    unit: 'mm',
    format: options.format,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < images.length; i++) {
    if (i > 0) {
      pdf.addPage();
    }

    const img = await loadImage(images[i]);
    
    // Calcular dimensiones para mantener aspect ratio
    const imgRatio = img.width / img.height;
    const pageRatio = pageWidth / pageHeight;

    let finalWidth, finalHeight;

    if (imgRatio > pageRatio) {
      finalWidth = pageWidth;
      finalHeight = pageWidth / imgRatio;
    } else {
      finalHeight = pageHeight;
      finalWidth = pageHeight * imgRatio;
    }

    const x = (pageWidth - finalWidth) / 2;
    const y = (pageHeight - finalHeight) / 2;

    pdf.addImage(images[i], 'JPEG', x, y, finalWidth, finalHeight);
  }

  return pdf.output('blob');
}

/**
 * Carga una imagen base64 y retorna sus dimensiones
 */
function loadImage(base64: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = reject;
    img.src = base64;
  });
}

/**
 * Descarga un PDF en el navegador
 */
export function downloadPDF(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
