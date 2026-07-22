/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DocumentItem, ScannedPage, PageAdjustment } from '../types';

const STORAGE_KEY = 'escaner_pro_documents';

// Removed createSamplePageCanvas as it's no longer used
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

  // Retornar lista vacía si no hay documentos guardados
  return [];
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

