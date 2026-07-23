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
  const ctx = canvas.getContext('2d');
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
    const croppedCtx = croppedCanvas.getContext('2d');
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
    console.log('Dewarp coefficients:', coeffs);
    await applyDewarp(canvas, coeffs);
  } catch (e) {
    console.warn('Modelo de dewarp no disponible:', e);
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
  const srcCtx = srcCanvas.getContext('2d');
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

  const destCtx = destCanvas.getContext('2d');
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
  const ctx = canvas.getContext('2d');
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
  const tempCtx = tempCanvas.getContext('2d');
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
  const ctx = canvas.getContext('2d');
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
  const ctx = canvas.getContext('2d');
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
  const ctx = canvas.getContext('2d');
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
  const ctx = canvas.getContext('2d');
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
  const ctx = canvas.getContext('2d');
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
  const ctx = canvas.getContext('2d');
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
  const bgCtx = bgCanvas.getContext('2d');
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
  const ctx = canvas.getContext('2d');
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
  const tempCtx = tempCanvas.getContext('2d');
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
  const originalCtx = canvas.getContext('2d');
  if (!originalCtx) return;
  originalCtx.clearRect(0, 0, w, h);
  originalCtx.drawImage(tempCanvas, 0, 0);

  console.log('applyDewarp applied with coeffs', coeffs);
}

/**
 * Aplica Filtro Gaussiano para reducir ruido.
 * @param canvas Canvas de entrada
 * @param radius Radio del kernel (típicamente 1-3)
 */
function applyGaussianBlur(canvas: HTMLCanvasElement, radius: number = 1): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const output = new Uint8ClampedArray(data);

  const sigma = radius / 2;
  const kernelSize = Math.ceil(6 * sigma);
  const kernel: number[] = [];

  // Generar kernel Gaussiano
  let sum = 0;
  for (let i = -kernelSize; i <= kernelSize; i++) {
    const val = Math.exp(-((i * i) / (2 * sigma * sigma))) / (Math.sqrt(2 * Math.PI) * sigma);
    kernel.push(val);
    sum += val;
  }

  // Normalizar kernel
  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= sum;
  }

  const halfKernel = Math.floor(kernel.length / 2);

  // Aplicar blur horizontal
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < kernel.length; i++) {
        const xx = Math.min(w - 1, Math.max(0, x + i - halfKernel));
        const idx = (y * w + xx) * 4;
        r += data[idx] * kernel[i];
        g += data[idx + 1] * kernel[i];
        b += data[idx + 2] * kernel[i];
      }
      const outIdx = (y * w + x) * 4;
      output[outIdx] = r;
      output[outIdx + 1] = g;
      output[outIdx + 2] = b;
    }
  }

  // Copiar resultado intermedio
  data.set(output);
  ctx.putImageData(imgData, 0, 0);
}

/**
 * Aplica Canny Edge Detection para detectar bordes del documento.
 * @param canvas Canvas con la imagen en escala de grises
 * @returns Canvas con bordes detectados
 */
function applySobel(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext('2d');
  if (!ctx) return new Uint8Array();

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const edges = new Uint8Array(w * h);

  // Kernels de Sobel
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let gx = 0, gy = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * w + (x + kx)) * 4;
          const gray = data[idx]; // Ya está en escala de grises
          gx += gray * sobelX[(ky + 1) * 3 + (kx + 1)];
          gy += gray * sobelY[(ky + 1) * 3 + (kx + 1)];
        }
      }

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edges[y * w + x] = Math.min(255, magnitude);
    }
  }

  return edges;
}

/**
 * Umbralización binaria simple.
 * @param edges Array de bordes
 * @param threshold Valor umbral (0-255)
 * @returns Array binario
 */
function threshold(edges: Uint8Array, threshold: number): Uint8Array {
  const binary = new Uint8Array(edges.length);
  for (let i = 0; i < edges.length; i++) {
    binary[i] = edges[i] > threshold ? 255 : 0;
  }
  return binary;
}

/**
 * Encontrar contornos usando flood fill / análisis conectado.
 * Retorna lista de contornos (cada contorno es un array de puntos).
 */
function findContours(binary: Uint8Array, width: number, height: number): Array<Array<{ x: number; y: number }>> {
  const visited = new Uint8Array(binary.length);
  const contours: Array<Array<{ x: number; y: number }>> = [];

  for (let i = 0; i < binary.length; i++) {
    if (binary[i] > 0 && !visited[i]) {
      const y = Math.floor(i / width);
      const x = i % width;
      const contour = traceContour(binary, width, height, x, y, visited);
      if (contour.length > 10) { // Filtrar contornos muy pequeños
        contours.push(contour);
      }
    }
  }

  return contours;
}

/**
 * Traza un contorno usando vecindad 8-conectada.
 */
function traceContour(
  binary: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  visited: Uint8Array
): Array<{ x: number; y: number }> {
  const contour: Array<{ x: number; y: number }> = [];
  const stack = [{ x: startX, y: startY }];

  const directions = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 1, dy: 1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: -1, dy: -1 },
  ];

  while (stack.length > 0) {
    const point = stack.pop();
    if (!point) break;

    const idx = point.y * width + point.x;
    if (visited[idx]) continue;

    visited[idx] = 1;
    contour.push(point);

    for (const dir of directions) {
      const nx = point.x + dir.dx;
      const ny = point.y + dir.dy;

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nIdx = ny * width + nx;
        if (binary[nIdx] > 0 && !visited[nIdx]) {
          stack.push({ x: nx, y: ny });
        }
      }
    }
  }

  return contour;
}

/**
 * Algoritmo Douglas-Peucker para simplificar un contorno a un polígono.
 * @param contour Array de puntos del contorno
 * @param epsilon Tolerancia de aproximación
 * @returns Array simplificado de puntos
 */
function douglasPeucker(
  contour: Array<{ x: number; y: number }>,
  epsilon: number
): Array<{ x: number; y: number }> {
  if (contour.length < 3) return contour;

  let maxDist = 0;
  let maxIdx = 0;

  // Encontrar el punto más lejano de la línea entre el primer y último punto
  const start = contour[0];
  const end = contour[contour.length - 1];

  for (let i = 1; i < contour.length - 1; i++) {
    const dist = pointToLineDistance(contour[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(contour.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(contour.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  } else {
    return [start, end];
  }
}

/**
 * Calcula la distancia perpendicular de un punto a una línea.
 */
function pointToLineDistance(
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number }
): number {
  const num = Math.abs(
    (lineEnd.y - lineStart.y) * point.x -
    (lineEnd.x - lineStart.x) * point.y +
    lineEnd.x * lineStart.y -
    lineEnd.y * lineStart.x
  );
  const den = Math.sqrt(
    (lineEnd.y - lineStart.y) ** 2 +
    (lineEnd.x - lineStart.x) ** 2
  );
  return den === 0 ? num : num / den;
}

/**
 * Calcula el área de un polígono usando la fórmula de Shoelace.
 */
function polygonArea(polygon: Array<{ x: number; y: number }>): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(area) / 2;
}

/**
 * Ordena los 4 puntos de esquina en el orden: TL, TR, BR, BL.
 */
function orderCornerPoints(
  points: Array<{ x: number; y: number }>
): Array<{ x: number; y: number }> {
  if (points.length !== 4) return points;

  // Calcular el centroide
  const cx = points.reduce((sum, p) => sum + p.x, 0) / 4;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / 4;

  // Ordenar por ángulo respecto al centroide
  points.sort((a, b) => {
    const angleA = Math.atan2(a.y - cy, a.x - cx);
    const angleB = Math.atan2(b.y - cy, b.x - cx);
    return angleA - angleB;
  });

  return points;
}

/**
 * Detección automática mejorada de los bordes/esquinas del documento (estilo CamScanner).
 * Utiliza Canny Edge Detection + Contour Detection + Douglas-Peucker Algorithm.
 * Detecta automáticamente las 4 esquinas del documento con alta precisión.
 */
export async function detectDocumentCorners(originalBase64: string): Promise<CropPoints> {
  const defaultCrop: CropPoints = {
    topLeft: { x: 0.05, y: 0.05 },
    topRight: { x: 0.95, y: 0.05 },
    bottomLeft: { x: 0.05, y: 0.95 },
    bottomRight: { x: 0.95, y: 0.95 },
  };

  try {
    const img = await loadImage(originalBase64);
    const canvas = document.createElement('canvas');
    
    // Usar resolución óptima para detección rápida pero precisa
    const targetDim = 400;
    const scale = Math.min(1, targetDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(50, Math.round(img.naturalWidth * scale));
    const h = Math.max(50, Math.round(img.naturalHeight * scale));
    
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) return defaultCrop;

    // Dibujar imagen y convertir a escala de grises
    ctx.drawImage(img, 0, 0, w, h);
    let imgData = ctx.getImageData(0, 0, w, h);
    let data = imgData.data;

    // Paso 1: Convertir a escala de grises
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }
    ctx.putImageData(imgData, 0, 0);

    // Paso 2: Aplicar Gaussian Blur para reducir ruido
    applyGaussianBlur(canvas, 2);

    // Paso 3: Aplicar Sobel Edge Detection
    const edges = applySobel(canvas);

    // Paso 4: Umbralizar los bordes (binarizar)
    const threshold_value = 100;
    const binary = threshold(edges, threshold_value);

    // Paso 5: Encontrar contornos
    const contours = findContours(binary, w, h);

    if (contours.length === 0) {
      console.warn('No contours found, using default crop');
      return defaultCrop;
    }

    // Paso 6: Filtrar contornos válidos (grandes, similares a documentos)
    let bestQuadrilateral: Array<{ x: number; y: number }> | null = null;
    let bestArea = 0;

    for (const contour of contours) {
      // Simplificar contorno usando Douglas-Peucker
      const epsilon = 0.02 * contour.length;
      const simplified = douglasPeucker(contour, epsilon);

      // Buscar un cuadrilátero (4 puntos)
      if (simplified.length === 4) {
        const area = polygonArea(simplified);
        const minArea = (w * h) * 0.1; // Mínimo 10% del área total
        const maxArea = (w * h) * 0.95; // Máximo 95% del área total

        if (area > minArea && area < maxArea && area > bestArea) {
          bestQuadrilateral = simplified;
          bestArea = area;
        }
      }
    }

    if (!bestQuadrilateral) {
      console.warn('No valid quadrilateral found, using default crop');
      return defaultCrop;
    }

    // Paso 7: Ordenar puntos correctamente (TL, TR, BR, BL)
    bestQuadrilateral = orderCornerPoints(bestQuadrilateral);

    // Paso 8: Convertir de píxeles a coordenadas relativas (0-1)
    const crop: CropPoints = {
      topLeft: { x: Math.max(0, Math.min(1, bestQuadrilateral[0].x / w)), y: Math.max(0, Math.min(1, bestQuadrilateral[0].y / h)) },
      topRight: { x: Math.max(0, Math.min(1, bestQuadrilateral[1].x / w)), y: Math.max(0, Math.min(1, bestQuadrilateral[1].y / h)) },
      bottomRight: { x: Math.max(0, Math.min(1, bestQuadrilateral[2].x / w)), y: Math.max(0, Math.min(1, bestQuadrilateral[2].y / h)) },
      bottomLeft: { x: Math.max(0, Math.min(1, bestQuadrilateral[3].x / w)), y: Math.max(0, Math.min(1, bestQuadrilateral[3].y / h)) },
    };

    // Validar que los puntos sean sensatos (no estén demasiado juntos)
    const minSpacing = 0.15;
    if (
      Math.abs(crop.topRight.x - crop.topLeft.x) < minSpacing ||
      Math.abs(crop.bottomLeft.y - crop.topLeft.y) < minSpacing
    ) {
      console.warn('Detected corners too close, using default crop');
      return defaultCrop;
    }

    console.log('Document corners detected:', crop);
    return crop;
  } catch (err) {
    console.warn('Error detectando esquinas automáticamente:', err);
    return defaultCrop;
  }
}
