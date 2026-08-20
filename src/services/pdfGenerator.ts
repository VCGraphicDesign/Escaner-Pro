/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import { ScannedPage } from '../types';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Carga una imagen base64 de forma asíncrona para obtener sus dimensiones nativas.
 */
function loadImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth || 210, height: img.naturalHeight || 297 });
    };
    img.onerror = () => {
      resolve({ width: 210, height: 297 });
    };
    img.src = src;
  });
}

/**
 * Genera y guarda / descarga un archivo PDF de ultra-alta calidad a partir de las páginas procesadas.
 * Funciona offline en la web y dispositivos móviles nativos (Android/iOS).
 */
export async function generatePDF(
  documentName: string,
  pages: ScannedPage[]
): Promise<void> {
  if (pages.length === 0) return;

  // Formato A4 estándar en mm: 210 x 297
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const A4_W = 210;
  const A4_H = 297;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const imageBase64 = page.processedImage;

    if (i > 0) {
      pdf.addPage('a4', 'portrait');
    }

    const { width: imgW, height: imgH } = await loadImageDimensions(imageBase64);
    const aspectRatio = imgW / imgH;

    let destW = A4_W;
    let destH = destW / aspectRatio;

    if (destH > A4_H) {
      destH = A4_H;
      destW = destH * aspectRatio;
    }

    const offsetX = (A4_W - destW) / 2;
    const offsetY = (A4_H - destH) / 2;

    // Usar 'SLOW' para máxima nitidez sin submuestreo de crominancia agresivo
    pdf.addImage(
      imageBase64,
      'JPEG',
      offsetX,
      offsetY,
      destW,
      destH,
      undefined,
      'SLOW'
    );
  }

  const finalName = documentName.endsWith('.pdf') ? documentName : `${documentName}.pdf`;

  if (Capacitor.isNativePlatform()) {
    try {
      const pdfDataUri = pdf.output('datauristring');
      const base64Data = pdfDataUri.split(',')[1];

      const savedFile = await Filesystem.writeFile({
        path: finalName,
        data: base64Data,
        directory: Directory.Documents,
        recursive: true,
      });

      await Share.share({
        title: documentName,
        text: `Documento PDF generado con Escáner Pro: ${documentName}`,
        url: savedFile.uri,
        dialogTitle: 'Guardar o Compartir PDF',
      });
    } catch (err) {
      console.error('Error al guardar o compartir PDF nativo:', err);
      pdf.save(finalName);
    }
  } else {
    pdf.save(finalName);
  }
}

/**
 * Exportación rápida a PDF desde imágenes base64 directas con máxima calidad y resolución.
 */
export async function quickExportPDF(
  documentName: string,
  processedImages: string[]
): Promise<void> {
  if (processedImages.length === 0) return;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const A4_W = 210;
  const A4_H = 297;

  for (let i = 0; i < processedImages.length; i++) {
    const base64 = processedImages[i];

    if (i > 0) {
      pdf.addPage('a4', 'portrait');
    }

    const { width: imgW, height: imgH } = await loadImageDimensions(base64);
    const aspectRatio = imgW / imgH;

    let destW = A4_W;
    let destH = destW / aspectRatio;

    if (destH > A4_H) {
      destH = A4_H;
      destW = destH * aspectRatio;
    }

    const offsetX = (A4_W - destW) / 2;
    const offsetY = (A4_H - destH) / 2;

    pdf.addImage(base64, 'JPEG', offsetX, offsetY, destW, destH, undefined, 'SLOW');
  }

  const finalName = documentName.endsWith('.pdf') ? documentName : `${documentName}.pdf`;

  if (Capacitor.isNativePlatform()) {
    try {
      const pdfDataUri = pdf.output('datauristring');
      const base64Data = pdfDataUri.split(',')[1];
      const savedFile = await Filesystem.writeFile({
        path: finalName,
        data: base64Data,
        directory: Directory.Documents,
        recursive: true,
      });
      await Share.share({
        title: documentName,
        text: `Documento PDF generado con Escáner Pro: ${documentName}`,
        url: savedFile.uri,
        dialogTitle: 'Guardar o Compartir PDF',
      });
    } catch (err) {
      console.error('Error al guardar o compartir PDF nativo:', err);
      pdf.save(finalName);
    }
  } else {
    pdf.save(finalName);
  }
}
