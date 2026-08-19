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
 * Aplica ajustes de Brillo, Contraste, Rotación, Filtros, Recorte y Nitidez.
 */
export async function processPageImage(
  originalBase64: string,
  adjustments: {
    brightness: number;
    contrast: number;
    sharpness: number;
    filter: 'original' | 'auto' | 'grayscale' | 'enhanced' | 'gamma' | 'restore';
    rotation: number;
    crop: CropPoints | null;
  }
): Promise<string> {
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
    applyGrayscale(canvas);
  } else if (adjustments.filter === 'enhanced') {
    applyColorEnhancement(canvas);
  } else if (adjustments.filter === 'auto') {
    normalizeIllumination(canvas);
    applyColorEnhancement(canvas);
  } else if (adjustments.filter === 'gamma') {
    applyGammaCorrection(canvas);
  } else if (adjustments.filter === 'restore') {
    restoreDocument(canvas);
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

  return canvas.toDataURL('image/jpeg', 0.85);
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
 * Escala de grises simple.
 */
export function applyGrayscale(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Color mejorado (Aumenta saturación y estira el contraste).
 */
export function applyColorEnhancement(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Estirar el contraste (negros más negros, blancos más blancos)
    r = (r - 128) * 1.25 + 128;
    g = (g - 128) * 1.25 + 128;
    b = (b - 128) * 1.25 + 128;

    // Aumentar la saturación de color
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * 1.35;
    g = gray + (g - gray) * 1.35;
    b = gray + (b - gray) * 1.35;

    data[i] = Math.min(255, Math.max(0, r));
    data[i + 1] = Math.min(255, Math.max(0, g));
    data[i + 2] = Math.min(255, Math.max(0, b));
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
 * RESTAURADOR PRINCIPAL DE DOCUMENTOS
 * Elimina arrugas, sombras de doblado y perforaciones de carpetas en una sola pasada.
 */
export function restoreDocument(canvas: HTMLCanvasElement) {
  removeWrinklesAndShadows(canvas);
  removePunchHoles(canvas);
}

/**
 * Algoritmo de eliminación de arrugas, pliegues y sombras.
 * Utiliza igualación morfológica de fondo con umbralización adaptativa suave Bradley/Sauvola.
 * Convierte cualquier fondo de papel arrugado/sombreado en blanco puro sin degradar el texto.
 */
export function removeWrinklesAndShadows(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // 1. Crear mapa de iluminación creando una versión suavizada de baja frecuencia (Background Surface)
  const bgCanvas = document.createElement('canvas');
  const bgW = Math.max(60, Math.min(150, Math.floor(w / 10))); // Resolución más alta para mejor precisión
  const bgH = Math.round((bgW * h) / w);
  bgCanvas.width = bgW;
  bgCanvas.height = bgH;
  const bgCtx = bgCanvas.getContext('2d', { willReadFrequently: true });
  if (!bgCtx) return;

  // Dibujar a baja resolución con suavizado
  bgCtx.drawImage(canvas, 0, 0, bgW, bgH);
  // Aplicar paso de desenfoque adicional en el lienzo pequeñito para eliminar textura local del papel
  bgCtx.filter = 'blur(2px)';
  bgCtx.drawImage(bgCanvas, 0, 0);
  bgCtx.filter = 'none';

  const bgData = bgCtx.getImageData(0, 0, bgW, bgH).data;

  // 2. Procesamiento Adaptativo Píxel por Píxel (Sauvola & Soft Surface Flattening)
  for (let y = 0; y < h; y++) {
    const bgY = Math.min(bgH - 1, Math.floor((y / h) * bgH));
    for (let x = 0; x < w; x++) {
      const bgX = Math.min(bgW - 1, Math.floor((x / w) * bgW));
      const bgIdx = (bgY * bgW + bgX) * 4;

      // Color de la luz de fondo estimada en esta región del documento
      const bgR = bgData[bgIdx] || 200;
      const bgG = bgData[bgIdx + 1] || 200;
      const bgB = bgData[bgIdx + 2] || 200;
      const bgLuminance = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;

      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

      // Umbral adaptativo: si el píxel está cerca o por encima de la luz del papel local
      const thresholdOffset = 35; // Aumentado para ser menos agresivo y preservar más detalles
      const paperThreshold = bgLuminance - thresholdOffset;

      if (luminance >= paperThreshold) {
        // Es papel/fondo con sombra o arruga -> Aclarar suavemente en lugar de blanco puro
        const blendFactor = Math.min(1, (luminance - paperThreshold) / 30); // Transición suave
        data[idx] = Math.floor(r + (255 - r) * blendFactor * 0.8);
        data[idx + 1] = Math.floor(g + (255 - g) * blendFactor * 0.8);
        data[idx + 2] = Math.floor(b + (255 - b) * blendFactor * 0.8);
      } else {
        // Es texto/tinta -> Conservar color oscuro con ligero contraste
        const factor = Math.max(0.7, luminance / paperThreshold);
        const enhancedVal = Math.floor(factor * 0.95 * 255);

        // Mantener tono original pero con mejor contraste
        data[idx] = Math.min(r, enhancedVal);
        data[idx + 1] = Math.min(g, enhancedVal);
        data[idx + 2] = Math.min(b, enhancedVal);
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
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
  mode: 'auto' | 'grayscale' | 'enhanced' = 'auto'
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

