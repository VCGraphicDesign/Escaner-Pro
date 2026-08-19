/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CropPoints } from '../types';

declare global {
  interface Window {
    cv: any;
  }
}

/**
 * Ordena 4 puntos en: Top-Left, Top-Right, Bottom-Right, Bottom-Left
 */
function sortQuad(pts: { x: number; y: number }[]): CropPoints {
  const sorted = [...pts].sort((a, b) => a.y - b.y);
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = sorted.slice(2, 4).sort((a, b) => a.x - b.x);
  return {
    topLeft: top[0],
    topRight: top[1],
    bottomRight: bottom[1],
    bottomLeft: bottom[0],
  };
}

/**
 * Valida que las 4 esquinas forman un cuadrilátero razonable (no degenerado).
 * Verifica: aspecto razonable (no demasiado estrecho) y tamaño mínimo.
 */
function isValidQuad(pts: { x: number; y: number }[]): boolean {
  if (pts.length !== 4) return false;

  // Calcular bounding box normalizado
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);

  // El documento debe ocupar al menos 20% del ancho Y del alto
  if (w < 0.20 || h < 0.20) return false;

  // Aspect ratio razonable: entre 0.3 (muy vertical) y 3.0 (muy horizontal)
  const aspect = w / h;
  if (aspect < 0.30 || aspect > 3.0) return false;

  return true;
}

/**
 * Detecta el cuadrilátero del documento en tiempo real.
 *
 * Pipeline:
 * 1. GaussianBlur → reduce ruido
 * 2. Canny con umbrales fijos conservadores → detecta solo bordes fuertes
 * 3. Dilate → cierra huecos en bordes
 * 4. findContours RETR_EXTERNAL → solo contornos exteriores
 * 5. Para cada contorno grande: convexHull + approxPolyDP iterativo
 * 6. Validar que el quad resultante tenga dimensiones y aspecto razonables
 * 7. Sin fallback minAreaRect (evita falsos positivos en el fondo)
 */
export function detectOpenCVCorners(sampleCanvas: HTMLCanvasElement): CropPoints | null {
  const cv = window.cv;
  if (!cv || !cv.Mat || !cv.imread || !cv.Canny || !cv.findContours) {
    return null;
  }

  let src: any = null;
  let gray: any = null;
  let blurred: any = null;
  let edgeMap: any = null;
  let dilated: any = null;
  let hull: any = null;
  let approx: any = null;
  let contours: any = null;
  let hierarchy: any = null;

  try {
    src = cv.imread(sampleCanvas);
    const W = sampleCanvas.width;
    const H = sampleCanvas.height;
    const totalArea = W * H;

    // 1. Escala de grises
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // 2. Suavizado Gaussiano para eliminar ruido de textura
    blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(7, 7), 0);

    // 3. Canny con umbrales fijos conservadores (evita detectar ruido de fondo)
    edgeMap = new cv.Mat();
    cv.Canny(blurred, edgeMap, 30, 90);

    // 4. Dilatar para cerrar gaps en los bordes del papel
    const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    dilated = new cv.Mat();
    cv.dilate(edgeMap, dilated, kernel);
    kernel.delete();

    // 5. Solo contornos externos (evita ruido interior de texto/imágenes)
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // Un documento debe ocupar entre 15% y 95% del área total
    const minArea = totalArea * 0.15;
    const maxArea = totalArea * 0.95;

    let bestQuad: { x: number; y: number }[] | null = null;
    let bestArea = 0;

    for (let i = 0; i < contours.size(); ++i) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);

      if (area < minArea || area > maxArea) {
        cnt.delete();
        continue;
      }

      // 6. convexHull para eliminar concavidades del contorno
      hull = new cv.Mat();
      cv.convexHull(cnt, hull, false, true);
      const hullArea = cv.contourArea(hull);

      if (hullArea < minArea) {
        cnt.delete();
        hull.delete();
        hull = null;
        continue;
      }

      // 7. approxPolyDP iterativo hasta obtener exactamente 4 esquinas
      const peri = cv.arcLength(hull, true);
      let quad: { x: number; y: number }[] | null = null;

      for (let epsMult = 0.02; epsMult <= 0.15; epsMult += 0.01) {
        approx = new cv.Mat();
        cv.approxPolyDP(hull, approx, epsMult * peri, true);

        if (approx.rows === 4) {
          const pts: { x: number; y: number }[] = [];
          for (let r = 0; r < 4; r++) {
            pts.push({
              x: approx.data32S[r * 2] / W,
              y: approx.data32S[r * 2 + 1] / H,
            });
          }
          // 8. Validar que el quad tenga tamaño y aspecto razonables
          if (isValidQuad(pts)) {
            quad = pts;
          }
          approx.delete();
          approx = null;
          break;
        }
        approx.delete();
        approx = null;
      }

      // Sin fallback a minAreaRect: preferimos no detectar a detectar mal

      if (quad && hullArea > bestArea) {
        bestArea = hullArea;
        bestQuad = quad;
      }

      cnt.delete();
      if (hull) { hull.delete(); hull = null; }
    }

    if (bestQuad) {
      const clamped = bestQuad.map(p => ({
        x: Math.max(0.01, Math.min(0.99, p.x)),
        y: Math.max(0.01, Math.min(0.99, p.y)),
      }));
      return sortQuad(clamped);
    }

    return null;
  } catch {
    return null;
  } finally {
    if (src) src.delete();
    if (gray) gray.delete();
    if (blurred) blurred.delete();
    if (edgeMap) edgeMap.delete();
    if (dilated) dilated.delete();
    if (hull) hull.delete();
    if (approx) approx.delete();
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
  }
}
