/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import { ScannedPage } from '../types';

/**
 * Genera y descarga un archivo PDF de alta calidad a partir de las imágenes procesadas.
 * Funciona offline en la web y móvil.
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

  // Descargar el archivo PDF directamente en el navegador
  const finalName = documentName.endsWith('.pdf') ? documentName : `${documentName}.pdf`;
  pdf.save(finalName);
}
