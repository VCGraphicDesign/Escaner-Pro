/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DocumentItem, ScannedPage, PageAdjustment } from '../types';

const STORAGE_KEY = 'escaner_pro_documents';

/**
 * Genera una plantilla de página de ejemplo usando Canvas para que la app tenga contenido inicial.
 */
function createSamplePageCanvas(title: string, date: string, items: string[]): string {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 800;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Fondo color papel antiguo con textura sutil
  ctx.fillStyle = '#fbf9f5';
  ctx.fillRect(0, 0, 600, 800);

  // Bordes simulados de papel escaneado levemente rotado / con sombras
  ctx.strokeStyle = '#d7d0c5';
  ctx.lineWidth = 1;
  ctx.strokeRect(4, 4, 592, 792);

  // Sombra simulada (para probar el adaptiveThreshold)
  const grad = ctx.createLinearGradient(0, 0, 600, 800);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.7, 'rgba(0,0,0,0.02)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)'); // Sombra gris en la esquina inferior derecha
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 600, 800);

  // Logo / Encabezado
  ctx.font = 'bold 22px "Courier New", Courier, monospace';
  ctx.fillStyle = '#222222';
  ctx.fillText('RECETA / DOCUMENTO DE EJEMPLO', 40, 60);

  ctx.font = '14px "Courier New", Courier, monospace';
  ctx.fillStyle = '#555555';
  ctx.fillText(`Fecha: ${date}`, 40, 90);
  ctx.fillText('ID de Escaneo: ESC-99234A', 40, 110);

  // Línea divisoria
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, 130);
  ctx.lineTo(560, 130);
  ctx.stroke();

  // Texto simulado (Items)
  ctx.font = '16px "Courier New", Courier, monospace';
  ctx.fillStyle = '#111111';
  let y = 180;
  items.forEach((item, index) => {
    ctx.fillText(`${index + 1}. ${item}`, 45, y);
    y += 40;
  });

  // Pie de página de documento
  ctx.font = 'italic 12px "Courier New", Courier, monospace';
  ctx.fillStyle = '#888888';
  ctx.fillText('Escáner Pro - Procesamiento de Imagen Local en el Dispositivo', 40, 750);

  return canvas.toDataURL('image/jpeg');
}

/**
 * Genera ajustes predeterminados para una página.
 */
export function createDefaultAdjustments(): PageAdjustment {
  return {
    brightness: 100,
    contrast: 100,
    sharpness: 0,
    filter: 'original',
    rotation: 0,
    crop: null,
    annotations: [],
  };
}

/**
 * Inicializa y obtiene los documentos desde localStorage.
 */
export function getDocuments(): DocumentItem[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error cargando documentos', e);
  }

  // Crear datos de ejemplo la primera vez
  const sampleDocs = createSampleDocuments();
  saveAllDocuments(sampleDocs);
  return sampleDocs;
}

/**
 * Guarda un documento individual (nuevo o editado).
 */
export function saveDocument(doc: DocumentItem): void {
  const docs = getDocuments();
  const index = docs.findIndex((d) => d.id === doc.id);
  if (index >= 0) {
    docs[index] = doc;
  } else {
    docs.unshift(doc);
  }
  saveAllDocuments(docs);
}

/**
 * Guarda la lista completa de documentos en localStorage.
 */
export function saveAllDocuments(docs: DocumentItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
  } catch (e) {
    console.error('Error guardando en localStorage', e);
  }
}

/**
 * Elimina un documento por ID.
 */
export function deleteDocument(id: string): void {
  const docs = getDocuments();
  const filtered = docs.filter((d) => d.id !== id);
  saveAllDocuments(filtered);
}

/**
 * Duplica un documento.
 */
export function duplicateDocument(id: string): DocumentItem | null {
  const docs = getDocuments();
  const original = docs.find((d) => d.id === id);
  if (!original) return null;

  const duplicate: DocumentItem = {
    ...original,
    id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: `${original.name} (Copia)`,
    createdAt: new Date().toISOString(),
    // Duplicar páginas con IDs frescos
    pages: original.pages.map((p) => ({
      ...p,
      id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      adjustments: JSON.parse(JSON.stringify(p.adjustments)), // Clonación profunda de ajustes
    })),
  };

  docs.unshift(duplicate);
  saveAllDocuments(docs);
  return duplicate;
}

/**
 * Renombra un documento.
 */
export function renameDocument(id: string, newName: string): void {
  const docs = getDocuments();
  const doc = docs.find((d) => d.id === id);
  if (doc) {
    doc.name = newName.trim();
    saveAllDocuments(docs);
  }
}

/**
 * Crea documentos de prueba iniciales con canvas generados al vuelo.
 */
function createSampleDocuments(): DocumentItem[] {
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

  const sample1Image = createSamplePageCanvas('RECETA MÈDICA', dateStr, [
    'Paracetamol 500mg - 1 comp cada 8 hrs',
    'Ibuprofeno 400mg - 1 comp cada 12 hrs con comida',
    'Amoxicilina 500mg - Suspender en 7 días',
    'Reposo absoluto por 3 días continuos',
    'Control médico en un mes con exámenes'
  ]);

  const sample2Image1 = createSamplePageCanvas('APUNTES DE MATEMÁTICAS', dateStr, [
    'Teorema de Pitágoras: a^2 + b^2 = c^2',
    'Integrales definidas: Área bajo la curva',
    'Derivadas comunes: d/dx(x^n) = n*x^(n-1)',
    'Logaritmos base 10: log(ab) = log(a) + log(b)'
  ]);

  const sample2Image2 = createSamplePageCanvas('FORMULARIO DE ÁLGEBRA', dateStr, [
    'Ecuación cuadrática: x = [-b +- sqrt(b^2 - 4ac)] / 2a',
    'Matrices determinantes: det(A) = ad - bc',
    'Números complejos: z = a + bi (i^2 = -1)',
    'Factorización: (a^2 - b^2) = (a - b)(a + b)'
  ]);

  return [
    {
      id: 'doc_sample_1',
      name: 'Receta Médica Farmacia',
      createdAt: new Date(now.getTime() - 2 * 3600000).toISOString(), // hace 2 horas
      pages: [
        {
          id: 'page_s1_1',
          originalImage: sample1Image,
          processedImage: sample1Image,
          adjustments: createDefaultAdjustments(),
        },
      ],
    },
    {
      id: 'doc_sample_2',
      name: 'Apuntes de Matemáticas Clase',
      createdAt: new Date(now.getTime() - 24 * 3600000).toISOString(), // ayer
      pages: [
        {
          id: 'page_s2_1',
          originalImage: sample2Image1,
          processedImage: sample2Image1,
          adjustments: createDefaultAdjustments(),
        },
        {
          id: 'page_s2_2',
          originalImage: sample2Image2,
          processedImage: sample2Image2,
          adjustments: createDefaultAdjustments(),
        },
      ],
    },
  ];
}
