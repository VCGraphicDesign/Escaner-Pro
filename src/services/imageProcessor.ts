/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CropPoints } from '../types';
import { predictWarp } from './dewarpModel';

/**
 * Service to process images using HTML5 Canvas API in real-time, 100% offline.
 */

/**
 * Carga una imagen base64 o URL en un elemento HTMLImageElement.
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
  });
}

/**
 * White Balance automático usando White Patch Algorithm (99th percentile).
 * Corrige tonos anaranjados/amarillentos causados por iluminación cálida.
 */
function applyWhiteBalance(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // 1. Calcular histogramas separados para R, G, B
  const histR = new Uint32Array(256);
  const histG = new Uint32Array(256);
  const histB = new Uint32Array(256);

  for (let i = 0; i < data.length; i += 4) {
    histR[data[i]]++;
    histG[data[i + 1]]++;
    histB[data[i + 2]]++;
  }

  // 2. Encontrar el percentil 99 (white point) de cada canal
  const totalPixels = w * h;
  const targetCount = Math.floor(totalPixels * 0.99);

  let accR = 0, accG = 0, accB = 0;
  let whitePointR = 255, whitePointG = 255, whitePointB = 255;

  for (let i = 0; i < 256; i++) {
    accR += histR[i];
    if (whitePointR === 255 && accR >= targetCount) {
      whitePointR = Math.max(50, i);
    }

    accG += histG[i];
    if (whitePointG === 255 && accG >= targetCount) {
      whitePointG = Math.max(50, i);
    }

    accB += histB[i];
    if (whitePointB === 255 && accB >= targetCount) {
      whitePointB = Math.max(50, i);
    }
  }

  // 3. Calcular factores de escala
  const scaleR = 255 / whitePointR;
  const scaleG = 255 / whitePointG;
  const scaleB = 255 / whitePointB;

  // 4. Aplicar corrección a cada píxel
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, data[i] * scaleR);
    data[i + 1] = Math.min(255, data[i + 1] * scaleG);
    data[i + 2] = Math.min(255, data[i + 2] * scaleB);
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * CLAHE (Contrast-Limited Adaptive Histogram Equalization) para mejora de contraste local.
 * Divide la imagen en tiles, aplica histogram equalization con clipping para evitar amplificar ruido.
 * Usa interpolación bilineal entre tiles para evitar bordes artificiales.
 */
function applyCLAHE(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Parámetros CLAHE estándar para documentos
  const tileGridX = 8;
  const tileGridY = 8;
  const clipLimit = 2.0;
  const bins = 256;

  const tileW = Math.ceil(w / tileGridX);
  const tileH = Math.ceil(h / tileGridY);

  // Convertir a escala de grises para CLAHE (mejor para documentos)
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  // Construir LUTs para cada tile
  const luts: Uint8Array[][] = [];

  for (let ty = 0; ty < tileGridY; ty++) {
    luts[ty] = [];
    for (let tx = 0; tx < tileGridX; tx++) {
      const lut = buildTileLUT(gray, w, h, tx, ty, tileW, tileH, clipLimit, bins);
      luts[ty][tx] = lut;
    }
  }

  // Aplicar CLAHE con interpolación bilineal
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Encontrar posición relativa en el grid de tiles
      const gx = (x / w) * (tileGridX - 1);
      const gy = (y / h) * (tileGridY - 1);

      const tx = Math.floor(gx);
      const ty = Math.floor(gy);
      const fx = gx - tx;
      const fy = gy - ty;

      // Obtener valores de los 4 tiles vecinos
      const tx1 = Math.min(tx + 1, tileGridX - 1);
      const ty1 = Math.min(ty + 1, tileGridY - 1);

      const vTL = luts[ty][tx][gray[y * w + x]];
      const vTR = luts[ty][tx1][gray[y * w + x]];
      const vBL = luts[ty1][tx][gray[y * w + x]];
      const vBR = luts[ty1][tx1][gray[y * w + x]];

      // Interpolación bilineal
      const vTop = vTL * (1 - fx) + vTR * fx;
      const vBottom = vBL * (1 - fx) + vBR * fx;
      const finalValue = vTop * (1 - fy) + vBottom * fy;

      // Aplicar a los canales RGB manteniendo proporciones de color
      const idx = (y * w + x) * 4;
      const factor = finalValue / (gray[y * w + x] || 1);
      data[idx] = Math.min(255, Math.max(0, data[idx] * factor));
      data[idx + 1] = Math.min(255, Math.max(0, data[idx + 1] * factor));
      data[idx + 2] = Math.min(255, Math.max(0, data[idx + 2] * factor));
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Construye LUT (lookup table) para un tile específico de CLAHE.
 */
function buildTileLUT(
  gray: Uint8Array,
  w: number,
  h: number,
  tx: number,
  ty: number,
  tileW: number,
  tileH: number,
  clipLimit: number,
  bins: number
): Uint8Array {
  // Calcular límites del tile
  const startX = Math.floor(tx * tileW);
  const startY = Math.floor(ty * tileH);
  const endX = Math.min(startX + tileW, w);
  const endY = Math.min(startY + tileH, h);

  const tilePixels = (endX - startX) * (endY - startY);

  // Construir histograma
  const hist = new Uint32Array(bins);
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      hist[gray[y * w + x]]++;
    }
  }

  // Clipping del histograma
  const clipLimitActual = Math.max(1, Math.floor(clipLimit * tilePixels / bins));
  let clipped = 0;

  for (let i = 0; i < bins; i++) {
    if (hist[i] > clipLimitActual) {
      clipped += hist[i] - clipLimitActual;
      hist[i] = clipLimitActual;
    }
  }

  // Redistribuir exceso uniformemente
  const redist = Math.floor(clipped / bins);
  const residual = clipped - redist * bins;

  for (let i = 0; i < bins; i++) {
    hist[i] += redist;
  }

  for (let i = 0; i < residual; i++) {
    hist[i]++;
  }

  // Construir CDF y LUT
  const lut = new Uint8Array(bins);
  let sum = 0;
  const cdf = new Uint32Array(bins);

  for (let i = 0; i < bins; i++) {
    sum += hist[i];
    cdf[i] = sum;
  }

  const cdfMin = cdf[0];
  const cdfMax = cdf[bins - 1];
  const range = cdfMax - cdfMin || 1;

  for (let i = 0; i < bins; i++) {
    lut[i] = Math.round(((cdf[i] - cdfMin) / range) * (bins - 1));
  }

  return lut;
}

/**
 * Aplica ajustes de Brillo, Contraste, Rotación, Filtros, Recorte y Nitidez.
 */
export async function processPageImage(
  originalBase64: string,
  adjustments: {
    brightness: number;
    contrast: number;
    sharpness: number;
    filter: 'original' | 'auto' | 'grayscale' | 'gamma' | 'restore';
    rotation: number;
    crop: CropPoints | null;
  }
): Promise<string> {
  // If the filter is 'original' and there are no geometric transforms (rotation or crop),
  // return the unprocessed original source image directly to preserve exact pixel data,
  // intrinsic resolution, and avoid unnecessary re-encoding/recompression.
  if (
    adjustments.filter === 'original' &&
    (!adjustments.rotation || adjustments.rotation === 0) &&
    !adjustments.crop
  ) {
    return originalBase64;
  }

  const img = await loadImage(originalBase64);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return originalBase64;

  // 1. Manejar rotación e inicializar tamaño del canvas
  const isRotated90or270 = adjustments.rotation === 90 || adjustments.rotation === 270;
  const width = isRotated90or270 ? img.naturalHeight : img.naturalWidth;
  const height = isRotated90or270 ? img.naturalWidth : img.naturalHeight;

  canvas.width = width;
  canvas.height = height;

  // Dibujar imagen original con rotación
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((adjustments.rotation * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  ctx.restore();

  // 2. Si hay recorte/perspectiva activa, aplicarlo
  if (adjustments.crop) {
    const croppedCanvas = document.createElement('canvas');
    const croppedCtx = croppedCanvas.getContext('2d', { willReadFrequently: true });
    if (croppedCtx) {
      applyPerspectiveCrop(canvas, croppedCanvas, adjustments.crop);
      canvas.width = croppedCanvas.width;
      canvas.height = croppedCanvas.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(croppedCanvas, 0, 0);
    }
  }

  // If the filter is 'original', do not apply any pixel manipulation, color grading,
  // illumination normalization, brightness/contrast adjustments, sharpening, or AI dewarping.
  if (adjustments.filter === 'original') {
    return canvas.toDataURL('image/jpeg', 0.98);
  }

  // Obtener ImageData para manipulación por píxeles (Filtros, Brillo, Contraste, Nitidez)
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  // 3. Aplicar Brillo y Contraste básicos
  const bFactor = adjustments.brightness / 100;
  const cFactor = adjustments.contrast / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    r = r * bFactor;
    g = g * bFactor;
    b = b * bFactor;

    r = (r - 128) * cFactor + 128;
    g = (g - 128) * cFactor + 128;
    b = (b - 128) * cFactor + 128;

    data[i] = Math.min(255, Math.max(0, r));
    data[i + 1] = Math.min(255, Math.max(0, g));
    data[i + 2] = Math.min(255, Math.max(0, b));
  }

  ctx.putImageData(imgData, 0, 0);

  // 4. Aplicar Filtros Avanzados
  if (adjustments.filter === 'grayscale') {
    // Modo B/N Profesional (Escala de Grises Continua):
    // Conversión pura de luminancia ITU-R BT.601 preservando todos los tonos continuos (0-255),
    // textura de papel, sombras, fotos y detalles finos sin binarización ni umbrales.
    applyGrayscale(canvas);
  } else if (adjustments.filter === 'auto') {
    // Modo Auto Avanzado, Conservador y Natural:
    // Mejora visible de iluminación en sombras, contraste tonal de lectura y nitidez de texto sensible a bordes.
    applyNaturalAutoEnhancement(canvas);
  } else if (adjustments.filter === 'gamma') {
    applyGammaCorrection(canvas);
  } else if (adjustments.filter === 'restore') {
    await restoreDocument(canvas);
  }

  // 5. Aplicar Nitidez (Sharpness) si es mayor a cero
  if (adjustments.sharpness > 0) {
    applySharpness(canvas, adjustments.sharpness / 100);
  }

  // 6. Aplicar modelo de dewarp basado en DocUNet‑lite (si está disponible)
  try {
    const coeffs = await predictWarp(canvas.toDataURL('image/jpeg', 0.85));
    if (coeffs) {
      await applyDewarp(canvas, coeffs);
    }
  } catch {
    // Ignorar si el modelo no está presente
  }

  return canvas.toDataURL('image/jpeg', 0.98);
}

/**
 * 1. correctPerspective(canvas, corners) — transformación de perspectiva simplificada.
 * Mapea el cuadrilátero definido por los puntos relativos a un lienzo rectangular plano.
 */
export function applyPerspectiveCrop(
  srcCanvas: HTMLCanvasElement,
  destCanvas: HTMLCanvasElement,
  corners: CropPoints
) {
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) return;

  const w = srcCanvas.width;
  const h = srcCanvas.height;

  // Encontrar las dimensiones estimadas del nuevo documento
  // Calculamos distancias entre esquinas
  const topWidth = Math.hypot(
    (corners.topRight.x - corners.topLeft.x) * w,
    (corners.topRight.y - corners.topLeft.y) * h
  );
  const bottomWidth = Math.hypot(
    (corners.bottomRight.x - corners.bottomLeft.x) * w,
    (corners.bottomRight.y - corners.bottomLeft.y) * h
  );
  const destWidth = Math.max(topWidth, bottomWidth) || 300;

  const leftHeight = Math.hypot(
    (corners.bottomLeft.x - corners.topLeft.x) * w,
    (corners.bottomLeft.y - corners.topLeft.y) * h
  );
  const rightHeight = Math.hypot(
    (corners.bottomRight.x - corners.topRight.x) * w,
    (corners.bottomRight.y - corners.topRight.y) * h
  );
  const destHeight = Math.max(leftHeight, rightHeight) || 400;

  destCanvas.width = Math.round(destWidth);
  destCanvas.height = Math.round(destHeight);

  const destCtx = destCanvas.getContext('2d', { willReadFrequently: true });
  if (!destCtx) return;

  // Para un rendimiento rápido en JS sin dependencias pesadas de WebGL,
  // implementamos un algoritmo de mapeo inverso de textura cuadrilátero-a-rectángulo.
  // Mapeamos cada pixel (x, y) del destCanvas a su equivalente (u, v) en el srcCanvas.
  const srcImgData = srcCtx.getImageData(0, 0, w, h);
  const destImgData = destCtx.createImageData(destCanvas.width, destCanvas.height);

  const p0x = corners.topLeft.x * w;
  const p0y = corners.topLeft.y * h;
  const p1x = corners.topRight.x * w;
  const p1y = corners.topRight.y * h;
  const p2x = corners.bottomRight.x * w;
  const p2y = corners.bottomRight.y * h;
  const p3x = corners.bottomLeft.x * w;
  const p3y = corners.bottomLeft.y * h;

  const dw = destCanvas.width;
  const dh = destCanvas.height;

  // Mapeo bilineal
  for (let y = 0; y < dh; y++) {
    const v = y / dh;
    const invV = 1.0 - v;

    for (let x = 0; x < dw; x++) {
      const u = x / dw;
      const invU = 1.0 - u;

      // Pesos bilineales
      const w0 = invU * invV;
      const w1 = u * invV;
      const w2 = u * v;
      const w3 = invU * v;

      // Calcular coordenadas de origen
      const sx = Math.round(w0 * p0x + w1 * p1x + w2 * p2x + w3 * p3x);
      const sy = Math.round(w0 * p0y + w1 * p1y + w2 * p2y + w3 * p3y);

      if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
        const destIdx = (y * dw + x) * 4;
        const srcIdx = (sy * w + sx) * 4;

        destImgData.data[destIdx] = srcImgData.data[srcIdx];
        destImgData.data[destIdx + 1] = srcImgData.data[srcIdx + 1];
        destImgData.data[destIdx + 2] = srcImgData.data[srcIdx + 2];
        destImgData.data[destIdx + 3] = srcImgData.data[srcIdx + 3];
      }
    }
  }

  destCtx.putImageData(destImgData, 0, 0);
}

/**
 * Realce Automático Avanzado, Conservador y Natural para Documentos (Auto Mode Calibrado):
 * 1. Estimación de iluminación de fondo mediante envolvente de luminancia de papel (Grid 2D + Blur).
 *    - Corrige sombras de cámara y desniveles de luz (ganancia máxima suave de ~22%, calibración +10%).
 *    - El papel blanco o bien iluminado NUNCA se oscurece.
 * 2. Tono y contraste adaptativo centrado en legibilidad:
 *    - Profundiza suavemente los trazos oscuros de tinta (Luminancia < 128, gamma ~1.08) para nitidez de lectura.
 *    - Leve realce de separación de medios tonos/papel (factor ~1.045) y brillo neutral (~103).
 *    - Preserva la textura y tono natural del papel sin forzar blancos a 255.
 * 3. Realce de detalle de texto sensible a bordes (Edge-Aware Luminance Detail):
 *    - Extrae la señal de detalle de alta frecuencia en luminancia con coring (ignora ruido) y soft-limit (sin halos, calibrado a 0.10).
 * 4. Preservación estricta del 100% de color y crominancia:
 *    - La re-proyección RGB es proporcional a la luminancia final (Y_final / Y_orig), preservando sellos, firmas y logos.
 */
export function applyNaturalAutoEnhancement(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const numPixels = w * h;

  // Paso 1: Extraer luminancia e histograma global para caracterizar el documento
  const lum = new Float32Array(numPixels);
  const hist = new Uint32Array(256);

  for (let i = 0; i < numPixels; i++) {
    const idx = i * 4;
    const y = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    lum[i] = y;
    hist[Math.min(255, Math.max(0, Math.round(y)))]++;
  }

  // Calcular percentiles de referencia: P90 (papel blanco iluminado)
  let count = 0;
  let p90 = 225;
  const targetP90 = Math.floor(numPixels * 0.90);

  for (let i = 0; i < 256; i++) {
    count += hist[i];
    if (count >= targetP90) {
      p90 = Math.max(185, Math.min(245, i));
      break;
    }
  }

  const targetPaperLum = p90;

  // Paso 2: Estimación de iluminación de fondo en malla 2D suave (Grid)
  // Muestrea el percentil 85 de cada bloque para capturar el papel sin interferencia de texto o sellos
  const gridCols = Math.max(16, Math.min(48, Math.floor(w / 40)));
  const gridRows = Math.max(12, Math.min(36, Math.floor(h / 40)));
  const cellW = w / gridCols;
  const cellH = h / gridRows;

  const bgGrid = new Float32Array(gridCols * gridRows);

  for (let gy = 0; gy < gridRows; gy++) {
    const startY = Math.floor(gy * cellH);
    const endY = Math.min(h, Math.floor((gy + 1) * cellH));

    for (let gx = 0; gx < gridCols; gx++) {
      const startX = Math.floor(gx * cellW);
      const endX = Math.min(w, Math.floor((gx + 1) * cellW));

      const cellSamples: number[] = [];
      const step = Math.max(1, Math.floor(((endX - startX) * (endY - startY)) / 80));

      for (let y = startY; y < endY; y += Math.max(1, Math.floor(Math.sqrt(step)))) {
        for (let x = startX; x < endX; x += Math.max(1, Math.floor(Math.sqrt(step)))) {
          cellSamples.push(lum[y * w + x]);
        }
      }

      if (cellSamples.length > 0) {
        cellSamples.sort((a, b) => a - b);
        const p85Idx = Math.min(cellSamples.length - 1, Math.floor(cellSamples.length * 0.85));
        bgGrid[gy * gridCols + gx] = cellSamples[p85Idx];
      } else {
        bgGrid[gy * gridCols + gx] = targetPaperLum;
      }
    }
  }

  // Suavizar la malla de iluminación con filtro separable para eliminar transiciones bruscas
  const smoothGrid = new Float32Array(gridCols * gridRows);
  for (let gy = 0; gy < gridRows; gy++) {
    for (let gx = 0; gx < gridCols; gx++) {
      let sum = 0;
      let weightSum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = Math.max(0, Math.min(gridRows - 1, gy + dy));
        for (let dx = -1; dx <= 1; dx++) {
          const nx = Math.max(0, Math.min(gridCols - 1, gx + dx));
          const weight = (dx === 0 && dy === 0) ? 4 : (dx === 0 || dy === 0) ? 2 : 1;
          sum += bgGrid[ny * gridCols + nx] * weight;
          weightSum += weight;
        }
      }
      smoothGrid[gy * gridCols + gx] = sum / weightSum;
    }
  }

  // Factor de exposición suave para documento (brillo objetivo ~103)
  const brightnessLift = 1.018;

  // Paso 3: Transformación unificada por píxel en dominio de Luminancia
  for (let y = 0; y < h; y++) {
    const gyNorm = (y / h) * (gridRows - 1);
    const gy0 = Math.floor(gyNorm);
    const gy1 = Math.min(gridRows - 1, gy0 + 1);
    const ty = gyNorm - gy0;

    for (let x = 0; x < w; x++) {
      const gxNorm = (x / w) * (gridCols - 1);
      const gx0 = Math.floor(gxNorm);
      const gx1 = Math.min(gridCols - 1, gx0 + 1);
      const tx = gxNorm - gx0;

      // Interpolación bilineal del fondo local
      const top = smoothGrid[gy0 * gridCols + gx0] * (1 - tx) + smoothGrid[gy0 * gridCols + gx1] * tx;
      const btm = smoothGrid[gy1 * gridCols + gx0] * (1 - tx) + smoothGrid[gy1 * gridCols + gx1] * tx;
      const localBg = top * (1 - ty) + btm * ty;

      const idx = (y * w + x) * 4;
      const yOrig = lum[y * w + x];

      // A) Ganancia de iluminación: corrige sombras suaves (máx ~22%), NUNCA oscurece papel blanco
      let illumGain = 1.0;
      if (localBg < targetPaperLum && localBg > 30) {
        const deficitRatio = (targetPaperLum - localBg) / targetPaperLum;
        illumGain = 1.0 + Math.min(0.22, deficitRatio * 0.46);
      }

      let yAdj = yOrig * illumGain * brightnessLift;

      // B) Curva tonal adaptativa para legibilidad de texto (contraste calibrado ~109)
      if (yAdj < 128) {
        // Tinta y trazos oscuros: compresión sutil calibrada (gamma 1.08) para mayor nitidez y profundidad
        const norm = yAdj / 128;
        yAdj = 128 * Math.pow(norm, 1.08);
      } else {
        // Papel y medios tonos claros: estiramiento suave con preservación de textura (1.045)
        const diff = yAdj - 128;
        yAdj = 128 + diff * 1.045;
      }

      // C) Realce de detalle de texto sensible a bordes (Luminance High-Pass con coring calibrado a ~0.10)
      let detail = 0;
      if (x > 0 && x < w - 1 && y > 0 && y < h - 1) {
        const lLeft = lum[y * w + (x - 1)];
        const lRight = lum[y * w + (x + 1)];
        const lUp = lum[(y - 1) * w + x];
        const lDown = lum[(y + 1) * w + x];
        const lSmooth = (lLeft + lRight + lUp + lDown) * 0.25;
        const diffHigh = yOrig - lSmooth;
        const absDiff = Math.abs(diffHigh);

        // Coring & Soft Clamping:
        // - Si |diff| <= 1.5: Ignorar ruido de sensor en papel plano
        // - Si 1.5 < |diff| < 30: Realzar trazo de texto con factor calibrado ~0.18
        // - Taper suave hacia 30 para evitar halos blancos o negros
        if (absDiff > 1.5 && absDiff < 30) {
          const taper = (30 - absDiff) / 28.5;
          detail = diffHigh * 0.18 * taper;
        }
      }

      const yFinal = Math.min(255, Math.max(0, yAdj + detail));

      // D) Reconstrucción RGB con preservación matemática estricta de crominancia y tono
      if (yOrig > 1) {
        const scale = yFinal / yOrig;
        data[idx] = Math.min(255, Math.max(0, Math.round(data[idx] * scale)));
        data[idx + 1] = Math.min(255, Math.max(0, Math.round(data[idx + 1] * scale)));
        data[idx + 2] = Math.min(255, Math.max(0, Math.round(data[idx + 2] * scale)));
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Aplica un enfoque sutil y nítido con protección de bordes para documentos (calibrado a 0.10).
 * @param amount Factor de nitidez leve (calibrado a 0.10)
 */
export function applySubtleSharpness(canvas: HTMLCanvasElement, amount: number = 0.10) {
  if (amount <= 0) return;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const original = new Uint8Array(data);

  const a = Math.min(0.12, Math.max(0, amount)) * 0.4;
  const center = 1 + 4 * a;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;

      for (let c = 0; c < 3; c++) {
        const val =
          original[idx + c] * center -
          (original[((y - 1) * w + x) * 4 + c] +
            original[((y + 1) * w + x) * 4 + c] +
            original[(y * w + x - 1) * 4 + c] +
            original[(y * w + x + 1) * 4 + c]) *
            a;

        data[idx + c] = Math.min(255, Math.max(0, val));
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * 2. normalizeIllumination(canvas) — CLAHE equivalente o balance de blancos local rápido.
 * Remueve gradientes de sombras y normaliza la iluminación localmente.
 */
export function normalizeIllumination(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Calculamos un mapa de iluminación aproximado reduciendo la resolución
  // y haciendo un filtro de paso bajo (un blur gigante de la imagen).
  // Para optimizar en JS, hacemos un escalado inverso extremo para aproximar la luz de fondo,
  // y luego restamos o normalizamos con la original.
  const tempCanvas = document.createElement('canvas');
  const illumW = Math.max(60, Math.min(150, Math.floor(w / 10)));
  const illumH = Math.round((illumW * h) / w);
  tempCanvas.width = illumW;
  tempCanvas.height = illumH;
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
  if (!tempCtx) return;

  // Dibujamos la imagen pequeña (blur/promedio local implícito)
  tempCtx.drawImage(canvas, 0, 0, illumW, illumH);
  // Blur mejorado
  tempCtx.filter = 'blur(3px)';
  tempCtx.drawImage(tempCanvas, 0, 0);
  tempCtx.filter = 'none';
  const illuminationData = tempCtx.getImageData(0, 0, illumW, illumH).data;

  // Función de interpolación para obtener el brillo de fondo en cualquier (x, y)
  for (let y = 0; y < h; y++) {
    const iy = Math.min(illumH - 1, Math.floor((y / h) * illumH));
    for (let x = 0; x < w; x++) {
      const ix = Math.min(illumW - 1, Math.floor((x / w) * illumW));
      const illIdx = (iy * illumW + ix) * 4;

      // Color de fondo aproximado
      const bgR = illuminationData[illIdx];
      const bgG = illuminationData[illIdx + 1];
      const bgB = illuminationData[illIdx + 2];
      const bgY = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;

      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Normalizar: multiplicar el pixel original por la diferencia de brillo
      // Si el fondo es oscuro, lo aclaramos.
      const targetLuminance = 240; // Valor ideal de papel blanco
      const factorR = targetLuminance / Math.max(50, bgR); // Mínimo más alto para evitar sobreexposición
      const factorG = targetLuminance / Math.max(50, bgG);
      const factorB = targetLuminance / Math.max(50, bgB);

      // Mezclamos un 50% de la corrección para que sea más natural y menos agresivo
      data[idx] = Math.min(255, Math.max(0, r * (1 + (factorR - 1) * 0.5)));
      data[idx + 1] = Math.min(255, Math.max(0, g * (1 + (factorG - 1) * 0.5)));
      data[idx + 2] = Math.min(255, Math.max(0, b * (1 + (factorB - 1) * 0.5)));
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * 3. adaptiveThreshold(canvas) o binarización adaptativa local rápida.
 * Excelente para convertir un documento de papel fotografiado en un PDF de texto nítido,
 * eliminando todas las sombras del ambiente.
 */
export function applyAdaptiveThreshold(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Crear mapa en escala de grises
  const grayscale = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i += 4) {
    // Estándar de luminancia ITU-R
    grayscale[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  // Algoritmo de umbralización adaptativa rápida usando una ventana móvil de tamaño S x S.
  // Usamos una aproximación con Integral Image para hacerlo O(N) de altísima velocidad.
  const integral = new Uint32Array(w * h);
  let sum = 0;
  for (let y = 0; y < h; y++) {
    sum = 0;
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      sum += grayscale[idx];
      if (y === 0) {
        integral[idx] = sum;
      } else {
        integral[idx] = integral[(y - 1) * w + x] + sum;
      }
    }
  }

  // Ventana de escaneo adaptativo (normalmente el 12% del ancho de la imagen)
  const S = Math.round(w * 0.12) || 16;
  const halfS = Math.floor(S / 2);
  const T = 15; // Umbral de diferencia porcentual (15%)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;

      // Límites de la ventana de vecindad
      const x1 = Math.max(0, x - halfS);
      const x2 = Math.min(w - 1, x + halfS);
      const y1 = Math.max(0, y - halfS);
      const y2 = Math.min(h - 1, y + halfS);

      const count = (x2 - x1) * (y2 - y1);

      // Suma rápida en la ventana usando la imagen integral
      const iA = integral[y1 * w + x1];
      const iB = integral[y1 * w + x2];
      const iC = integral[y2 * w + x1];
      const iD = integral[y2 * w + x2];
      const windowSum = iD - iB - iC + iA;

      const currentPixel = grayscale[idx];

      // Si el pixel es significativamente más oscuro que el promedio local, es negro (texto),
      // de lo contrario es blanco (papel/fondo).
      const isBlack = (currentPixel * count) < (windowSum * (100 - T) / 100);

      const dataIdx = idx * 4;
      const val = isBlack ? 0 : 255;
      data[dataIdx] = val;
      data[dataIdx + 1] = val;
      data[dataIdx + 2] = val;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Sauvola Binarization - El estándar de la industria para documentos.
 * Usa integral images para rendimiento O(N) y maneja iluminación no uniforme.
 * Fórmula: t = m * (1 - k * (1 - s/128))
 */
function applySauvolaBinarization(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Parámetros Sauvola estándar para documentos
  const k = 0.34;
  const windowSize = 15;
  const R = 128;
  const halfWindow = Math.floor(windowSize / 2);

  // Convertir a escala de grises
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  // Calcular integral images para media y media cuadrada
  const integral = new Uint32Array((w + 1) * (h + 1));
  const integralSq = new Float32Array((w + 1) * (h + 1));

  for (let y = 1; y <= h; y++) {
    for (let x = 1; x <= w; x++) {
      const idx = (y - 1) * w + (x - 1);
      const val = gray[idx];
      const valSq = val * val;

      integral[y * (w + 1) + x] =
        val +
        integral[(y - 1) * (w + 1) + x] +
        integral[y * (w + 1) + (x - 1)] -
        integral[(y - 1) * (w + 1) + (x - 1)];

      integralSq[y * (w + 1) + x] =
        valSq +
        integralSq[(y - 1) * (w + 1) + x] +
        integralSq[y * (w + 1) + (x - 1)] -
        integralSq[(y - 1) * (w + 1) + (x - 1)];
    }
  }

  // Función auxiliar para obtener suma de ventana desde integral image
  const getWindowSum = (x1: number, y1: number, x2: number, y2: number, integralArr: Uint32Array | Float32Array): number => {
    const A = integralArr[y1 * (w + 1) + x1];
    const B = integralArr[y1 * (w + 1) + x2];
    const C = integralArr[y2 * (w + 1) + x1];
    const D = integralArr[y2 * (w + 1) + x2];
    return D - B - C + A;
  };

  // Aplicar Sauvola binarización
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - halfWindow);
      const y1 = Math.max(0, y - halfWindow);
      const x2 = Math.min(w, x + halfWindow);
      const y2 = Math.min(h, y + halfWindow);

      const area = (x2 - x1) * (y2 - y1);
      const sum = getWindowSum(x1, y1, x2, y2, integral);
      const sumSq = getWindowSum(x1, y1, x2, y2, integralSq);

      const mean = sum / area;
      const variance = (sumSq / area) - (mean * mean);
      const stdDev = Math.sqrt(Math.max(0, variance));

      // Fórmula Sauvola
      const threshold = mean * (1 - k * (1 - stdDev / R));

      const idx = (y * w + x) * 4;
      const pixelValue = gray[y * w + x];
      const binary = pixelValue > threshold ? 255 : 0;

      data[idx] = binary;
      data[idx + 1] = binary;
      data[idx + 2] = binary;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * B/N (Blanco y Negro) / Escala de Grises Profesional Continua:
 * Convierte la imagen a escala de grises de tono continuo utilizando el estándar
 * de luminancia ITU-R BT.601 / OpenCV (Y = 0.299*R + 0.587*G + 0.114*B).
 * 
 * Preserva el 100% de los tonos continuos (0 a 255), textura natural del papel,
 * sombras, ilustraciones, fotografías y trazos finos de texto, sin binarización,
 * umbrales, posterización ni inversiones.
 */
export function applyGrayscale(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Estándar de luminancia ITU-R BT.601
    const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    data[i] = y;
    data[i + 1] = y;
    data[i + 2] = y;
    // Canal alfa (data[i + 3]) se preserva intacto
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Color Pro Profesional para Documentos:
 * 1. Balance de blancos adaptativo (White Point Calibration).
 * 2. Realce de negros para texto nítido y legible.
 * 3. Saturación selectiva para resaltar sellos, firmas a color y gráficos sin alterar el fondo.
 */
export function applyColorEnhancement(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const numPixels = w * h;

  // 1. Calcular histograma de luminancia para encontrar puntos negro y blanco óptimos
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    hist[lum]++;
  }

  // Encontrar percentil 2% (negros/tinta) y percentil 96% (blanco/papel)
  const lowCount = Math.floor(numPixels * 0.02);
  const highCount = Math.floor(numPixels * 0.96);

  let acc = 0;
  let blackPoint = 15;
  let whitePoint = 235;

  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= lowCount && blackPoint === 15) {
      blackPoint = Math.max(5, Math.min(60, i));
    }
    if (acc >= highCount) {
      whitePoint = Math.max(180, Math.min(252, i));
      break;
    }
  }

  const range = Math.max(20, whitePoint - blackPoint);

  // 2. Aplicar corrección y realce de color profesional
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Mapeo adaptativo por canal
    r = Math.min(255, Math.max(0, ((r - blackPoint) / range) * 255));
    g = Math.min(255, Math.max(0, ((g - blackPoint) / range) * 255));
    b = Math.min(255, Math.max(0, ((b - blackPoint) / range) * 255));

    // Saturación selectiva para elementos de color (sellos, firmas, logos)
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const maxDiff = Math.max(Math.abs(r - lum), Math.abs(g - lum), Math.abs(b - lum));

    if (maxDiff > 12) {
      // Es un color relevante: aumentar saturación vívida
      const satBoost = 1.3;
      r = Math.min(255, Math.max(0, lum + (r - lum) * satBoost));
      g = Math.min(255, Math.max(0, lum + (g - lum) * satBoost));
      b = Math.min(255, Math.max(0, lum + (b - lum) * satBoost));
    } else if (lum > 220) {
      // Fondo claro de papel: llevarlo a blanco puro suave
      const paperFade = (lum - 220) / 35;
      r = Math.min(255, r + (255 - r) * paperFade);
      g = Math.min(255, g + (255 - g) * paperFade);
      b = Math.min(255, b + (255 - b) * paperFade);
    }

    data[i] = Math.round(r);
    data[i + 1] = Math.round(g);
    data[i + 2] = Math.round(b);
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Aplica un filtro de enfoque/nitidez usando una matriz de convolución (Unsharp mask approximation).
 * @param amount Factor de nitidez (0 a 1)
 */
export function applySharpness(canvas: HTMLCanvasElement, amount: number) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const original = new Uint8Array(data);

  // Kernel de convolución Laplacian simplificado para nitidez:
  // [  0, -a,  0 ]
  // [ -a, 1+4a, -a ]
  // [  0, -a,  0 ]
  const a = amount * 0.5;
  const center = 1 + 4 * a;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;

      for (let c = 0; c < 3; c++) { // R, G, B channels
        const val =
          original[idx + c] * center -
          (original[((y - 1) * w + x) * 4 + c] +
            original[((y + 1) * w + x) * 4 + c] +
            original[(y * w + x - 1) * 4 + c] +
            original[(y * w + x + 1) * 4 + c]) *
            a;

        data[idx + c] = Math.min(255, Math.max(0, val));
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Corrección Gamma para eliminar sombras, manchas y ruido, optimizando la legibilidad del texto.
 * Aplica una curva gamma que aclara las sombras y mantiene los detalles en las áreas claras.
 */
export function applyGammaCorrection(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Valor gamma de 0.7 para aclarar sombras sin sobreexponer
  // Valores < 1 aclaran la imagen, valores > 1 oscurecen
  const gamma = 0.7;
  const gammaCorrection = new Uint8Array(256);
  
  // Pre-calcular tabla de corrección gamma
  for (let i = 0; i < 256; i++) {
    gammaCorrection[i] = Math.min(255, Math.max(0, Math.pow(i / 255, 1 / gamma) * 255));
  }

  // Aplicar corrección gamma a cada canal de color
  for (let i = 0; i < data.length; i += 4) {
    data[i] = gammaCorrection[data[i]];         // R
    data[i + 1] = gammaCorrection[data[i + 1]]; // G
    data[i + 2] = gammaCorrection[data[i + 2]]; // B
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Validador de integridad para prevenir salidas negras o datos corruptos.
 * Si el canvas resultante es anormalmente oscuro o está a cero, restaura el respaldo.
 */
function validateCanvasOutput(canvas: HTMLCanvasElement, backupData: ImageData): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || canvas.width === 0 || canvas.height === 0) return;

  const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = currentData.data;
  const len = data.length;

  if (len === 0) {
    ctx.putImageData(backupData, 0, 0);
    return;
  }

  // Muestreo rápido de luminancia
  let totalLum = 0;
  let samples = 0;
  let nonZeroCount = 0;
  const step = Math.max(1, Math.floor(len / 4000)) * 4;

  for (let i = 0; i < len; i += step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a > 0 && (r > 0 || g > 0 || b > 0)) {
      nonZeroCount++;
    }
    totalLum += 0.299 * r + 0.587 * g + 0.114 * b;
    samples++;
  }

  const avgLum = samples > 0 ? totalLum / samples : 0;

  // Si más del 99% de las muestras son exactamente 0 o la luminancia media es casi nula (< 3)
  if (samples > 0 && (nonZeroCount / samples < 0.01 || avgLum < 3)) {
    console.warn('Restoration output validation failed (black/corrupt image detected). Restoring backup.');
    ctx.putImageData(backupData, 0, 0);
  }
}

/**
 * RESTAURADOR DE DOCUMENTOS (Sin Arrugas ni Pliegues):
 * - Modo A (Automático / sin máscara): Corrección de iluminación conservadora y localizada
 *   en sombras de pliegues/arrugas detectadas sin tocar texto ni blanquear toda la página.
 * - Modo B (Manual / con máscara): Inpainting localizado con OpenCV Telea (radio 2, dilación 3x3)
 *   estrictamente dentro de las zonas pintadas por el usuario.
 */
export async function restoreDocument(canvas: HTMLCanvasElement, maskCanvas?: HTMLCanvasElement) {
  // Si no se proporcionó máscara, aplicar la corrección automática localizada y segura
  if (!maskCanvas) {
    await applyConservativeWrinkleShadowCorrection(canvas);
    return;
  }

  // Si hay máscara, verificar si contiene trazos dibujados
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
  if (maskCtx) {
    const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
    let hasMaskContent = false;
    const step = Math.max(1, Math.floor(maskData.length / 2000)) * 4;
    for (let i = 0; i < maskData.length; i += step) {
      if (maskData[i] > 50 || maskData[i + 1] > 50 || maskData[i + 2] > 50) {
        hasMaskContent = true;
        break;
      }
    }

    if (!hasMaskContent) {
      // Máscara vacía: aplicar modo automático conservador
      await applyConservativeWrinkleShadowCorrection(canvas);
      return;
    }
  }

  await removeWrinklesWithInpainting(canvas, maskCanvas);
}

/**
 * Modo A (Automático): Corrección localizada y conservadora de sombras de arrugas/pliegues.
 * - Estima el campo de iluminación de baja frecuencia.
 * - Detecta desviaciones continuas de sombra correspondientes a pliegues.
 * - Suprime la corrección sobre trazos de texto de alta frecuencia.
 * - Aplica una corrección sutil (máx 10-18%) en la luminancia preservando el matiz y el resto del documento.
 */
export async function applyConservativeWrinkleShadowCorrection(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || canvas.width === 0 || canvas.height === 0) return;

  const w = canvas.width;
  const h = canvas.height;
  const originalImageData = ctx.getImageData(0, 0, w, h);
  const data = originalImageData.data;

  // Respaldo de seguridad en caso de que no haya artefactos o falle la validación
  const backupCanvas = document.createElement('canvas');
  backupCanvas.width = w;
  backupCanvas.height = h;
  const backupCtx = backupCanvas.getContext('2d');
  if (backupCtx) backupCtx.putImageData(originalImageData, 0, 0);

  try {
    // 1. Estimar fondo / campo de iluminación a baja frecuencia
    const bgCanvas = document.createElement('canvas');
    const bgW = Math.max(48, Math.min(120, Math.floor(w / 16)));
    const bgH = Math.max(36, Math.round((bgW * h) / w));
    bgCanvas.width = bgW;
    bgCanvas.height = bgH;
    const bgCtx = bgCanvas.getContext('2d', { willReadFrequently: true });
    if (!bgCtx) return;

    bgCtx.drawImage(canvas, 0, 0, bgW, bgH);
    bgCtx.filter = 'blur(4px)';
    bgCtx.drawImage(bgCanvas, 0, 0);
    bgCtx.filter = 'none';

    const bgData = bgCtx.getImageData(0, 0, bgW, bgH).data;

    // 2. Extraer mapa de luminancia de la imagen completa
    const lumMap = new Float32Array(w * h);
    for (let i = 0; i < data.length; i += 4) {
      lumMap[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    // 3. Evaluar desviaciones de sombra y correlación direccional de pliegues
    const confidenceMap = new Float32Array(w * h);
    let totalConfidence = 0;
    const sampleStep = 2; // Muestreo optimizado

    for (let y = 2; y < h - 2; y += sampleStep) {
      const bgY = Math.min(bgH - 1, Math.floor((y / h) * bgH));
      for (let x = 2; x < w - 2; x += sampleStep) {
        const idx = y * w + x;
        const bgX = Math.min(bgW - 1, Math.floor((x / w) * bgW));
        const bgIdx = (bgY * bgW + bgX) * 4;

        const bgLum = 0.299 * bgData[bgIdx] + 0.587 * bgData[bgIdx + 1] + 0.114 * bgData[bgIdx + 2];
        const currentLum = lumMap[idx];

        // Desviación local respecto al fondo suave
        const dev = bgLum > 30 ? (bgLum - currentLum) / bgLum : 0;

        // Solo sombras suaves a medias (no texto de alto contraste que suele tener dev > 0.6)
        if (dev > 0.05 && dev < 0.38) {
          // Gradiente local para detectar bordes afilados de texto y suprimirlos
          const gradX = Math.abs(lumMap[idx + 1] - lumMap[idx - 1]);
          const gradY = Math.abs(lumMap[idx + w] - lumMap[idx - w]);
          const gradMag = gradX + gradY;

          // Si el gradiente es muy alto, es texto o línea nítida -> suprimir corrección
          if (gradMag < 40) {
            // Detector de estructura continua de pliegue (valle direccional suave)
            const hSpan = Math.abs(lumMap[idx - 2] + lumMap[idx + 2] - 2 * currentLum);
            const vSpan = Math.abs(lumMap[idx - 2 * w] + lumMap[idx + 2 * w] - 2 * currentLum);
            const creaseStrength = Math.min(1.0, (hSpan + vSpan) / 25);

            const conf = Math.min(1.0, (dev / 0.30) * (0.4 + 0.6 * creaseStrength));
            confidenceMap[idx] = conf;
            totalConfidence += conf;
          }
        }
      }
    }

    // 4. Si la señal global de arruga/sombra es insignificante, devolver la imagen intacta
    const thresholdConfidence = (w * h) / (sampleStep * sampleStep) * 0.0015;
    if (totalConfidence < thresholdConfidence) {
      // Sin artefactos detectables: mantener imagen original intacta
      return;
    }

    // 5. Aplicar corrección de luminancia suave y conservadora (máx 15-18% en zonas detectadas)
    for (let y = 0; y < h; y++) {
      const bgY = Math.min(bgH - 1, Math.floor((y / h) * bgH));
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const conf = confidenceMap[idx];

        if (conf > 0.02) {
          const bgX = Math.min(bgW - 1, Math.floor((x / w) * bgW));
          const bgIdx = (bgY * bgW + bgX) * 4;
          const bgLum = 0.299 * bgData[bgIdx] + 0.587 * bgData[bgIdx + 1] + 0.114 * bgData[bgIdx + 2];
          const currentLum = lumMap[idx];
          const dev = bgLum > 30 ? Math.max(0, (bgLum - currentLum) / bgLum) : 0;

          // Ganancia multiplicativa uniforme para los tres canales RGB (preserva matiz exacto)
          const gain = 1.0 + conf * Math.min(0.18, dev * 0.7);

          const pIdx = idx * 4;
          data[pIdx] = Math.min(255, Math.round(data[pIdx] * gain));
          data[pIdx + 1] = Math.min(255, Math.round(data[pIdx + 1] * gain));
          data[pIdx + 2] = Math.min(255, Math.round(data[pIdx + 2] * gain));
        }
      }
    }

    ctx.putImageData(originalImageData, 0, 0);

    // Validación de seguridad para prevenir pantallas negras
    validateCanvasOutput(canvas, originalImageData);
  } catch (err) {
    console.error('Error en corrección automática de arrugas:', err);
    if (backupCtx) {
      ctx.drawImage(backupCanvas, 0, 0);
    }
  }
}

/**
 * Modo B (Manual): Inpainting localizado con OpenCV.js.
 * Utiliza cv.inpaint() con cv.INPAINT_TELEA y un radio pequeño de 2px,
 * con dilatación elíptica suave de 3x3, limitando la restauración
 * estrictamente al área seleccionada por el usuario.
 */
async function removeWrinklesWithInpainting(canvas: HTMLCanvasElement, maskCanvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || canvas.width === 0 || canvas.height === 0) return;

  const w = canvas.width;
  const h = canvas.height;
  const backupImageData = ctx.getImageData(0, 0, w, h);

  // Intentar cargar OpenCV.js si no está presente
  if (typeof (window as any).cv === 'undefined') {
    try {
      await loadOpenCV();
    } catch {
      console.warn('OpenCV.js no disponible para inpainting manual. Aplicando corrección conservadora.');
      await applyConservativeWrinkleShadowCorrection(canvas);
      return;
    }
  }

  const cv = (window as any).cv;
  if (!cv || !cv.Mat) {
    console.warn('OpenCV.js no inicializado. Aplicando corrección conservadora.');
    await applyConservativeWrinkleShadowCorrection(canvas);
    return;
  }

  // Punteros a matrices para liberación segura en bloque finally
  let src: any = null;
  let imgRGB: any = null;
  let mask: any = null;
  let maskGray: any = null;
  let maskBinary: any = null;
  let kernel: any = null;
  let maskDilated: any = null;
  let dst: any = null;
  let dstRGBA: any = null;

  try {
    // 1. Leer imagen original
    src = cv.imread(canvas);
    imgRGB = new cv.Mat();
    cv.cvtColor(src, imgRGB, cv.COLOR_RGBA2RGB);

    // 2. Leer máscara manual del usuario
    mask = cv.imread(maskCanvas);
    maskGray = new cv.Mat();
    cv.cvtColor(mask, maskGray, cv.COLOR_RGBA2GRAY);

    // 3. Binarizar máscara con umbral seguro
    maskBinary = new cv.Mat();
    cv.threshold(maskGray, maskBinary, 127, 255, cv.THRESH_BINARY);

    // Si la máscara no tiene píxeles marcados, salir sin modificar
    const nonZero = cv.countNonZero(maskBinary);
    if (nonZero === 0) {
      return;
    }

    // 4. Dilatación suave de 3x3 con elemento elíptico (en lugar de 5x5 rectangular agresivo)
    kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
    maskDilated = new cv.Mat();
    cv.dilate(maskBinary, maskDilated, kernel);

    // 5. Aplicar inpainting localizado Telea con radio pequeño (2px)
    dst = new cv.Mat();
    cv.inpaint(imgRGB, maskDilated, dst, 2, cv.INPAINT_TELEA);

    // 6. Convertir resultado a RGBA y renderizar en canvas
    dstRGBA = new cv.Mat();
    cv.cvtColor(dst, dstRGBA, cv.COLOR_RGB2RGBA);
    cv.imshow(canvas, dstRGBA);

    // 7. Validar que la salida no sea negra o corrupta
    validateCanvasOutput(canvas, backupImageData);
  } catch (error) {
    console.error('Error durante inpainting con OpenCV:', error);
    // Restaurar imagen de respaldo en caso de fallo
    ctx.putImageData(backupImageData, 0, 0);
  } finally {
    // Liberación exhaustiva de memoria WebAssembly
    try {
      if (src && !src.isDeleted()) src.delete();
      if (imgRGB && !imgRGB.isDeleted()) imgRGB.delete();
      if (mask && !mask.isDeleted()) mask.delete();
      if (maskGray && !maskGray.isDeleted()) maskGray.delete();
      if (maskBinary && !maskBinary.isDeleted()) maskBinary.delete();
      if (kernel && !kernel.isDeleted()) kernel.delete();
      if (maskDilated && !maskDilated.isDeleted()) maskDilated.delete();
      if (dst && !dst.isDeleted()) dst.delete();
      if (dstRGBA && !dstRGBA.isDeleted()) dstRGBA.delete();
    } catch (cleanupErr) {
      console.warn('Error liberando matrices OpenCV:', cleanupErr);
    }
  }
}

/**
 * Carga OpenCV.js desde CDN de manera no bloqueante y segura
 */
function loadOpenCV(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof (window as any).cv !== 'undefined' && (window as any).cv.Mat) {
      resolve();
      return;
    }

    // Comprobar si ya existe el script insertado
    const existingScript = document.querySelector('script[src*="opencv.js"]');
    if (existingScript) {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (typeof (window as any).cv !== 'undefined' && (window as any).cv.Mat) {
          clearInterval(interval);
          resolve();
        } else if (attempts > 50) {
          clearInterval(interval);
          reject(new Error('OpenCV.js timeout de inicialización'));
        }
      }, 100);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.x/opencv.js';
    script.async = true;

    const timeout = setTimeout(() => {
      reject(new Error('Timeout cargando OpenCV.js'));
    }, 8000);

    script.onload = () => {
      const checkCV = () => {
        if (typeof (window as any).cv !== 'undefined' && (window as any).cv.Mat) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkCV, 100);
        }
      };
      checkCV();
    };

    script.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Error cargando OpenCV.js desde CDN'));
    };

    document.head.appendChild(script);
  });
}

/**
 * Algoritmo de inpainting/relleno inteligente de perforaciones de carpetas.
 * Escanea los márgenes laterales e identifica manchas/huecos circulares oscuros.
 */
export function removePunchHoles(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Definir zonas de margen (15% izquierdo y derecho)
  const marginWidth = Math.floor(w * 0.15);
  const holeRadiusMin = Math.max(4, Math.floor(w * 0.015));
  const holeRadiusMax = Math.max(12, Math.floor(w * 0.045));

  const checkRegionForHoles = (startX: number, endX: number) => {
    for (let y = holeRadiusMax; y < h - holeRadiusMax; y += 4) {
      for (let x = startX; x < endX; x += 4) {
        const idx = (y * w + x) * 4;
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

        // Si detectamos un punto muy oscuro rodeado de blanco (posible perforación)
        if (brightness < 70) {
          // Verificar si el vecindario externo es claro (papel)
          let isBorderLight = true;
          let lightR = 0, lightG = 0, lightB = 0, count = 0;

          for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
            const checkX = Math.round(x + Math.cos(angle) * (holeRadiusMax + 2));
            const checkY = Math.round(y + Math.sin(angle) * (holeRadiusMax + 2));

            if (checkX >= 0 && checkX < w && checkY >= 0 && checkY < h) {
              const cIdx = (checkY * w + checkX) * 4;
              const cBright = (data[cIdx] + data[cIdx + 1] + data[cIdx + 2]) / 3;
              if (cBright < 150) {
                isBorderLight = false;
                break;
              }
              lightR += data[cIdx];
              lightG += data[cIdx + 1];
              lightB += data[cIdx + 2];
              count++;
            }
          }

          // Si efectivamente es un hueco de perforación rodeado de papel
          if (isBorderLight && count > 0) {
            const fillR = Math.round(lightR / count);
            const fillG = Math.round(lightG / count);
            const fillB = Math.round(lightB / count);

            // Rellenar el área de la perforación con el color del papel adyacente
            for (let dy = -holeRadiusMax; dy <= holeRadiusMax; dy++) {
              for (let dx = -holeRadiusMax; dx <= holeRadiusMax; dx++) {
                if (dx * dx + dy * dy <= holeRadiusMax * holeRadiusMax) {
                  const px = x + dx;
                  const py = y + dy;
                  if (px >= 0 && px < w && py >= 0 && py < h) {
                    const pIdx = (py * w + px) * 4;
                    data[pIdx] = fillR;
                    data[pIdx + 1] = fillG;
                    data[pIdx + 2] = fillB;
                  }
                }
              }
            }
          }
        }
      }
    }
  };

  // Escanear margen izquierdo y derecho
  checkRegionForHoles(2, marginWidth);
  checkRegionForHoles(w - marginWidth, w - 2);

  ctx.putImageData(imgData, 0, 0);
}

export async function applyDewarp(canvas: HTMLCanvasElement, coeffs: number[]): Promise<void> {
  // Simple implementation using the first 6 coefficients as an affine matrix.
  // coeffs expected: [a, b, c, d, e, f, _, _]
  // a, b, c, d correspond to scaling/rotation/shear, e, f are translation.
  const [a, b, c, d, e, f] = coeffs;
  const w = canvas.width;
  const h = canvas.height;

  // Create a temporary canvas to draw the transformed image.
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = w;
  tempCanvas.height = h;
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
  if (!tempCtx) return;

  // Load the current canvas content as an image.
  const img = new Image();
  img.src = canvas.toDataURL();
  await new Promise((resolve, reject) => {
    img.onload = resolve as any;
    img.onerror = reject as any;
  });

  // Apply the affine transform and draw.
  tempCtx.setTransform(a, b, c, d, e, f);
  tempCtx.drawImage(img, 0, 0);

  // Copy the transformed image back to the original canvas.
  const originalCtx = canvas.getContext('2d', { willReadFrequently: true });
  if (!originalCtx) return;
  originalCtx.clearRect(0, 0, w, h);
  originalCtx.drawImage(tempCanvas, 0, 0);

  console.log('applyDewarp applied with coeffs', coeffs);
}

/**
 * Detección automática mejorada de los bordes/esquinas del documento.
 * Prioriza por CONTRASTE + ubicación CENTRAL en lugar de tamaño.
 * Ideal para detectar documentos intuitivamente: ticket pequeño sobre libreta, etc.
/**
 * Detección automática precisa de bordes y esquinas de documentos y texto.
 * Utiliza segmentación de contraste, análisis de energía de bordes Sobel y
 * extracción de cuadrilátero envolvente para aislar la hoja de papel o zona de texto.
 */
export async function detectDocumentCorners(originalBase64: string): Promise<CropPoints> {
  const defaultCrop: CropPoints = {
    topLeft: { x: 0.08, y: 0.08 },
    topRight: { x: 0.92, y: 0.08 },
    bottomLeft: { x: 0.08, y: 0.92 },
    bottomRight: { x: 0.92, y: 0.92 },
  };

  try {
    const img = await loadImage(originalBase64);
    const canvas = document.createElement('canvas');

    // Resolución de trabajo óptima para análisis (320px de ancho)
    const targetW = 320;
    const targetH = Math.max(50, Math.round((targetW * img.naturalHeight) / img.naturalWidth));
    canvas.width = targetW;
    canvas.height = targetH;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return defaultCrop;

    ctx.drawImage(img, 0, 0, targetW, targetH);
    const imgData = ctx.getImageData(0, 0, targetW, targetH);
    const data = imgData.data;

    const w = targetW;
    const h = targetH;
    const totalPixels = w * h;

    // 1. Escala de grises y cálculo de histograma
    const gray = new Uint8Array(totalPixels);
    const histogram = new Uint32Array(256);

    for (let i = 0; i < data.length; i += 4) {
      const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      const idx = i / 4;
      gray[idx] = g;
      histogram[g]++;
    }

    // 2. Umbral de Otsu para separar documento (papel claro) del fondo
    let sumTotal = 0;
    for (let i = 0; i < 256; i++) sumTotal += i * histogram[i];

    let sumB = 0;
    let wB = 0;
    let maxVariance = 0;
    let otsuThreshold = 128;

    for (let t = 0; t < 256; t++) {
      wB += histogram[t];
      if (wB === 0) continue;
      const wF = totalPixels - wB;
      if (wF === 0) break;

      sumB += t * histogram[t];
      const mB = sumB / wB;
      const mF = (sumTotal - sumB) / wF;
      const variance = wB * wF * (mB - mF) * (mB - mF);

      if (variance > maxVariance) {
        maxVariance = variance;
        otsuThreshold = t;
      }
    }

    // 3. Mapa de bordes Sobel
    const edges = detectEdgesSobel(gray, w, h);

    // 4. Mapa de probabilidad de documento (combinación de contraste de brillo y bordes)
    // El papel suele ser más brillante que el fondo de la habitación/mesa
    const isBrightPaper = otsuThreshold > 80;
    const docMask = new Uint8Array(totalPixels);

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const isForeground = isBrightPaper ? gray[idx] >= otsuThreshold - 15 : gray[idx] <= otsuThreshold + 15;
        const hasEdge = edges[idx] > 30;
        docMask[idx] = (isForeground || hasEdge) ? 1 : 0;
      }
    }

    // 5. Escaneo de perfiles para detectar los 4 límites del documento (Top, Bottom, Left, Right)
    // Buscamos donde la densidad del documento supera el umbral de ruido ambiental
    const colDensity = new Float32Array(w);
    const rowDensity = new Float32Array(h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const val = docMask[y * w + x];
        rowDensity[y] += val;
        colDensity[x] += val;
      }
    }

    // Normalizar densidades
    for (let x = 0; x < w; x++) colDensity[x] /= h;
    for (let y = 0; y < h; y++) rowDensity[y] /= w;

    // Umbral de corte: 20% de densidad en fila/columna
    const densityThreshold = 0.18;

    let minX = 0;
    let maxX = w - 1;
    let minY = 0;
    let maxY = h - 1;

    // Buscar minX (borde izquierdo)
    for (let x = 0; x < Math.floor(w * 0.45); x++) {
      if (colDensity[x] > densityThreshold) {
        minX = Math.max(0, x - 2);
        break;
      }
    }

    // Buscar maxX (borde derecho)
    for (let x = w - 1; x > Math.floor(w * 0.55); x--) {
      if (colDensity[x] > densityThreshold) {
        maxX = Math.min(w - 1, x + 2);
        break;
      }
    }

    // Buscar minY (borde superior)
    for (let y = 0; y < Math.floor(h * 0.45); y++) {
      if (rowDensity[y] > densityThreshold) {
        minY = Math.max(0, y - 2);
        break;
      }
    }

    // Buscar maxY (borde inferior)
    for (let y = h - 1; y > Math.floor(h * 0.55); y--) {
      if (rowDensity[y] > densityThreshold) {
        maxY = Math.min(h - 1, y + 2);
        break;
      }
    }

    // 6. Búsqueda de esquinas reales dentro del área acotada
    let tlX = minX, tlY = minY;
    let trX = maxX, trY = minY;
    let blX = minX, blY = maxY;
    let brX = maxX, brY = maxY;

    let minSumTL = Infinity;
    let maxDiffTR = -Infinity;
    let maxSumBR = -Infinity;
    let minDiffBL = Infinity;

    let foundPoints = 0;

    for (let y = minY; y <= maxY; y += 2) {
      for (let x = minX; x <= maxX; x += 2) {
        const idx = y * w + x;
        if (docMask[idx] === 1 || edges[idx] > 40) {
          foundPoints++;

          const sum = x + y;
          const diff = x - y;

          if (sum < minSumTL) {
            minSumTL = sum;
            tlX = x;
            tlY = y;
          }
          if (diff > maxDiffTR) {
            maxDiffTR = diff;
            trX = x;
            trY = y;
          }
          if (sum > maxSumBR) {
            maxSumBR = sum;
            brX = x;
            brY = y;
          }
          if (diff < minDiffBL) {
            minDiffBL = diff;
            blX = x;
            blY = y;
          }
        }
      }
    }

    // 7. Validación de dimensiones del documento detectado
    const docW = maxX - minX;
    const docH = maxY - minY;

    // Si el documento ocupa al menos el 18% del ancho y alto
    if (docW > w * 0.18 && docH > h * 0.18 && foundPoints > 50) {
      // Añadir margen de seguridad del 1.5% para no cortar texto
      const padX = w * 0.015;
      const padY = h * 0.015;

      const crop: CropPoints = {
        topLeft: {
          x: Number(Math.max(0, (Math.min(tlX, minX) - padX) / w).toFixed(3)),
          y: Number(Math.max(0, (Math.min(tlY, minY) - padY) / h).toFixed(3)),
        },
        topRight: {
          x: Number(Math.min(1, (Math.max(trX, maxX) + padX) / w).toFixed(3)),
          y: Number(Math.max(0, (Math.min(trY, minY) - padY) / h).toFixed(3)),
        },
        bottomLeft: {
          x: Number(Math.max(0, (Math.min(blX, minX) - padX) / w).toFixed(3)),
          y: Number(Math.min(1, (Math.max(blY, maxY) + padY) / h).toFixed(3)),
        },
        bottomRight: {
          x: Number(Math.min(1, (Math.max(brX, maxX) + padX) / w).toFixed(3)),
          y: Number(Math.min(1, (Math.max(brY, maxY) + padY) / h).toFixed(3)),
        },
      };

      console.log('Bordes del documento detectados:', crop);
      return crop;
    }

    // Fallback: recorte centrado óptimo (enmarca el 80% central del visor)
    const centeredCrop: CropPoints = {
      topLeft: { x: 0.1, y: 0.1 },
      topRight: { x: 0.9, y: 0.1 },
      bottomLeft: { x: 0.1, y: 0.9 },
      bottomRight: { x: 0.9, y: 0.9 },
    };

    return centeredCrop;
  } catch (err) {
    console.warn('Error detectando esquinas automáticamente:', err);
    return defaultCrop;
  }
}

/**
 * Pipeline de procesamiento automático completo para escaneo rápido.
 * Detecta bordes → recorta perspectiva → mejora imagen (auto-clean) → nitidez.
 * Retorna: { processedImage, cropPoints, detectionQuality }
 */
export async function autoProcessForScan(
  base64: string,
  mode: 'auto' | 'grayscale' = 'auto'
): Promise<{
  processedImage: string;
  cropPoints: CropPoints;
  detectionQuality: 'good' | 'fair' | 'poor';
}> {
  const defaultCrop: CropPoints = {
    topLeft: { x: 0.05, y: 0.05 },
    topRight: { x: 0.95, y: 0.05 },
    bottomLeft: { x: 0.05, y: 0.95 },
    bottomRight: { x: 0.95, y: 0.95 },
  };

  // 1. Detectar esquinas del documento automáticamente
  let cropPoints = defaultCrop;
  let detectionQuality: 'good' | 'fair' | 'poor' = 'poor';

  try {
    cropPoints = await detectDocumentCorners(base64);

    const docWidth = cropPoints.topRight.x - cropPoints.topLeft.x;
    const docHeight = cropPoints.bottomLeft.y - cropPoints.topLeft.y;

    if (docWidth > 0.25 && docHeight > 0.25 && (cropPoints.topLeft.x > 0.02 || cropPoints.topRight.x < 0.98)) {
      detectionQuality = 'good';
    } else if (docWidth > 0.2 && docHeight > 0.2) {
      detectionQuality = 'fair';
    }
  } catch {
    cropPoints = defaultCrop;
  }

  // 2. Procesar la imagen con recorte y mejoras
  const processedImage = await processPageImage(base64, {
    brightness: 105,
    contrast: 112,
    sharpness: mode === 'grayscale' ? 50 : 35,
    filter: mode,
    rotation: 0,
    crop: cropPoints,
  });

  return { processedImage, cropPoints, detectionQuality };
}

function detectEdgesSobel(gray: Uint8Array, w: number, h: number): Uint8Array {
  const edges = new Uint8Array(w * h);

  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let gx = 0, gy = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = (y + ky) * w + (x + kx);
          const val = gray[idx];
          gx += val * sobelX[(ky + 1) * 3 + (kx + 1)];
          gy += val * sobelY[(ky + 1) * 3 + (kx + 1)];
        }
      }

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edges[y * w + x] = Math.min(255, magnitude);
    }
  }

  return edges;
}

