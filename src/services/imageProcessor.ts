/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CropPoints } from '../types';

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
    filter: 'original' | 'auto' | 'bw' | 'grayscale' | 'enhanced' | 'gamma';
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
      // Para simplificar y mantener alto rendimiento offline,
      // realizamos un recorte basado en la bounding box del polígono de recorte.
      // Opcionalmente podemos aplicar transformación perspectiva homográfica en el canvas.
      // Implementamos una transformación perspectiva simplificada (bilinear approximation)
      // para cumplir con `correctPerspective(canvas, corners)`
      applyPerspectiveCrop(canvas, croppedCanvas, adjustments.crop);
      // Reemplazar canvas principal con el recortado
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
  // Brillo: factor (0.5 a 1.5)
  // Contraste: factor (0.5 a 1.5)
  const bFactor = adjustments.brightness / 100;
  const cFactor = adjustments.contrast / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Aplicar brillo
    r = r * bFactor;
    g = g * bFactor;
    b = b * bFactor;

    // Aplicar contraste (alrededor del valor medio 128)
    r = (r - 128) * cFactor + 128;
    g = (g - 128) * cFactor + 128;
    b = (b - 128) * cFactor + 128;

    // Limitar valores entre 0 y 255
    data[i] = Math.min(255, Math.max(0, r));
    data[i + 1] = Math.min(255, Math.max(0, g));
    data[i + 2] = Math.min(255, Math.max(0, b));
  }

  ctx.putImageData(imgData, 0, 0);

  // 4. Aplicar Filtros Avanzados
  if (adjustments.filter === 'grayscale') {
    applyGrayscale(canvas);
  } else if (adjustments.filter === 'bw') {
    applyAdaptiveThreshold(canvas);
  } else if (adjustments.filter === 'enhanced') {
    applyColorEnhancement(canvas);
  } else if (adjustments.filter === 'auto') {
    // Combinación de iluminación balanceada y mejora de bordes
    normalizeIllumination(canvas);
    applyColorEnhancement(canvas);
  } else if (adjustments.filter === 'gamma') {
    // Corrección gamma para eliminar sombras, manchas y ruido
    applyGammaCorrection(canvas);
  }

  // 5. Aplicar Nitidez (Sharpness) si es mayor a cero
  if (adjustments.sharpness > 0) {
    applySharpness(canvas, adjustments.sharpness / 100);
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
  tempCanvas.width = 40;
  tempCanvas.height = 40;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return;

  // Dibujamos la imagen pequeña (blur/promedio local implícito)
  tempCtx.drawImage(canvas, 0, 0, 40, 40);
  // Blur
  tempCtx.globalAlpha = 0.5;
  tempCtx.drawImage(tempCanvas, 1, 1);
  tempCtx.drawImage(tempCanvas, -1, -1);
  const illuminationData = tempCtx.getImageData(0, 0, 40, 40).data;

  // Función de interpolación para obtener el brillo de fondo en cualquier (x, y)
  for (let y = 0; y < h; y++) {
    const iy = Math.floor((y / h) * 40);
    for (let x = 0; x < w; x++) {
      const ix = Math.floor((x / w) * 40);
      const illIdx = (iy * 40 + ix) * 4;

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
      const targetLuminance = 230; // Valor ideal de papel blanco
      const factorR = targetLuminance / Math.max(10, bgR);
      const factorG = targetLuminance / Math.max(10, bgG);
      const factorB = targetLuminance / Math.max(10, bgB);

      // Mezclamos un 70% de la corrección para que sea natural
      data[idx] = Math.min(255, Math.max(0, r * (1 + (factorR - 1) * 0.7)));
      data[idx + 1] = Math.min(255, Math.max(0, g * (1 + (factorG - 1) * 0.7)));
      data[idx + 2] = Math.min(255, Math.max(0, b * (1 + (factorB - 1) * 0.7)));
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
