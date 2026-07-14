/**
 * Servicio para gestión de archivos
 * En móvil usa Capacitor Filesystem, en web usa descargas directas
 */

import { logger } from '../utils/logger';

/**
 * Guarda un archivo en el dispositivo
 */
export async function saveFile(
  data: Blob | string,
  filename: string,
  mimeType: string
): Promise<string> {
  try {
    return await saveFileWeb(data, filename, mimeType);
  } catch (error) {
    logger.error('Error guardando archivo', error);
    throw error;
  }
}

/**
 * Guarda archivo en web mediante descarga
 */
async function saveFileWeb(
  data: Blob | string,
  filename: string,
  mimeType: string
): Promise<string> {
  try {
    let blob: Blob;

    if (typeof data === 'string') {
      blob = base64ToBlob(data, mimeType);
    } else {
      blob = data;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    logger.info('Archivo descargado en web', filename);
    return filename;
  } catch (error) {
    logger.error('Error descargando archivo en web', error);
    throw error;
  }
}

/**
 * Convierte base64 a Blob
 */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteString = atob(base64.split(',')[1]);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8Array = new Uint8Array(arrayBuffer);

  for (let i = 0; i < byteString.length; i++) {
    uint8Array[i] = byteString.charCodeAt(i);
  }

  return new Blob([uint8Array], { type: mimeType });
}
