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
