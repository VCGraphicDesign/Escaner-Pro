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
 * Detecta el cuadrilátero del documento en tiempo real usando:
 * 1. GaussianBlur + Canny para bordes limpios
 * 2. findContours con RETR_EXTERNAL (solo contornos externos)
 * 3. convexHull + approxPolyDP iterativo para colapsar a 4 esquinas exactas
 * 4. minAreaRect como fallback cuando approxPolyDP no converge a 4 puntos
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

    // 1. Escala de grises + Suavizado Gaussiano para reducir ruido
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    // 2. Canny con umbral automático proporcional al contraste de la imagen
    const mean = cv.mean(blurred);
    const meanVal = mean[0];
    const cannyLow = Math.max(15, meanVal * 0.3);
    const cannyHigh = Math.min(220, meanVal * 0.8);
    edgeMap = new cv.Mat();
    cv.Canny(blurred, edgeMap, cannyLow, cannyHigh);

    // 3. Dilatar bordes para cerrar gaps y conectar contornos
    const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    dilated = new cv.Mat();
    cv.dilate(edgeMap, dilated, kernel);
    kernel.delete();

    // 4. Encontrar contornos externos
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const minArea = totalArea * 0.05;
    const maxArea = totalArea * 0.97;

    let bestQuad: { x: number; y: number }[] | null = null;
    let bestArea = 0;

    for (let i = 0; i < contours.size(); ++i) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);

      if (area < minArea || area > maxArea) {
        cnt.delete();
        continue;
      }

      // 5. Aplicar convexHull primero para eliminar concavidades
      hull = new cv.Mat();
      cv.convexHull(cnt, hull, false, true);

      const hullArea = cv.contourArea(hull);
      if (hullArea < minArea) {
        cnt.delete();
        hull.delete();
        hull = null;
        continue;
      }

      // 6. approxPolyDP iterativo: reducir epsilon hasta obtener exactamente 4 puntos
      const peri = cv.arcLength(hull, true);
      let quad: { x: number; y: number }[] | null = null;

      for (let epsilonMult = 0.01; epsilonMult <= 0.12; epsilonMult += 0.01) {
        approx = new cv.Mat();
        cv.approxPolyDP(hull, approx, epsilonMult * peri, true);

        if (approx.rows === 4) {
          const pts: { x: number; y: number }[] = [];
          for (let r = 0; r < 4; r++) {
            pts.push({
              x: approx.data32S[r * 2] / W,
              y: approx.data32S[r * 2 + 1] / H,
            });
          }
          quad = pts;
          approx.delete();
          approx = null;
          break;
        }
        approx.delete();
        approx = null;
      }

      // 7. Fallback: si approxPolyDP nunca converge a 4, usar minAreaRect (bounding rotated rect)
      if (!quad && hull) {
        const rRect = cv.minAreaRect(hull);
        const rectPts = cv.RotatedRect.points(rRect);
        quad = [
          { x: rectPts[0].x / W, y: rectPts[0].y / H },
          { x: rectPts[1].x / W, y: rectPts[1].y / H },
          { x: rectPts[2].x / W, y: rectPts[2].y / H },
          { x: rectPts[3].x / W, y: rectPts[3].y / H },
        ];
      }

      if (quad && hullArea > bestArea) {
        bestArea = hullArea;
        bestQuad = quad;
      }

      cnt.delete();
      if (hull) { hull.delete(); hull = null; }
    }

    if (bestQuad) {
      // Asegurar que los puntos están dentro del rango [0.01, 0.99]
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

