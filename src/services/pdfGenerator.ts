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
 * Genera y guarda / descarga un archivo PDF de alta calidad a partir de las imágenes procesadas.
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
  });

  const targetWidth = 210;
  const targetHeight = 297;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const imageBase64 = page.processedImage;

    // Si no es la primera página, añadir una nueva página al PDF
    if (i > 0) {
      pdf.addPage('a4', 'portrait');
    }

    // Agregar la imagen ajustándose al tamaño de la página A4
    pdf.addImage(
      imageBase64,
      'JPEG',
      0,
      0,
      targetWidth,
      targetHeight,
      undefined,
      'FAST'
    );
  }

  const finalName = documentName.endsWith('.pdf') ? documentName : `${documentName}.pdf`;

  // Si estamos en un dispositivo móvil nativo (Android/iOS)
  if (Capacitor.isNativePlatform()) {
    try {
      // 1. Obtener la cadena Base64 del PDF generado
      const pdfDataUri = pdf.output('datauristring');
      const base64Data = pdfDataUri.split(',')[1];

      // 2. Escribir el archivo PDF directamente en la memoria del dispositivo
      const savedFile = await Filesystem.writeFile({
        path: finalName,
        data: base64Data,
        directory: Directory.Documents,
        recursive: true,
      });

      // 3. Abrir la ventana nativa del celular para Guardar / Compartir el PDF
      await Share.share({
        title: documentName,
        text: `Documento PDF generado con Escáner Pro: ${documentName}`,
        url: savedFile.uri,
        dialogTitle: 'Guardar o Compartir PDF',
      });
    } catch (err) {
      console.error('Error al guardar o compartir PDF nativo:', err);
      // Fallback a descarga web estándar
      pdf.save(finalName);
    }
  } else {
    // Entorno Web Browser convencional (PC)
    pdf.save(finalName);
  }
}

/**
 * Exportación rápida a PDF desde imágenes base64 directas (sin ScannedPage).
 * Preserva la proporción de aspecto de cada imagen ajustándola al tamaño de página A4.
 * Ideal para el flujo de Escaneo Rápido donde las imágenes ya fueron procesadas.
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
  });

  const A4_W = 210;
  const A4_H = 297;
  const MARGIN = 5; // mm de margen

  for (let i = 0; i < processedImages.length; i++) {
    const base64 = processedImages[i];

    if (i > 0) {
      pdf.addPage('a4', 'portrait');
    }

    // Detectar dimensiones de la imagen para preservar aspecto
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const imgW = img.naturalWidth;
        const imgH = img.naturalHeight;
        const aspectRatio = imgW / imgH;

        // Calcular dimensiones respetando los márgenes
        const maxW = A4_W - MARGIN * 2;
        const maxH = A4_H - MARGIN * 2;

        let destW = maxW;
        let destH = destW / aspectRatio;

        if (destH > maxH) {
          destH = maxH;
          destW = destH * aspectRatio;
        }

        const offsetX = MARGIN + (maxW - destW) / 2;
        const offsetY = MARGIN + (maxH - destH) / 2;

        pdf.addImage(base64, 'JPEG', offsetX, offsetY, destW, destH, undefined, 'FAST');
        resolve();
      };
      img.onerror = () => {
        // Fallback: imagen a pantalla completa
        pdf.addImage(base64, 'JPEG', 0, 0, A4_W, A4_H, undefined, 'FAST');
        resolve();
      };
      img.src = base64;
    });
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
