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
  // Ordenar por coordenada Y para separar los 2 superiores de los 2 inferiores
  const sortedByY = [...pts].sort((a, b) => a.y - b.y);
  const top = sortedByY.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = sortedByY.slice(2, 4).sort((a, b) => a.x - b.x);

  return {
    topLeft: top[0],
    topRight: top[1],
    bottomRight: bottom[1],
    bottomLeft: bottom[0],
  };
}

/**
 * Encuentra las 4 esquinas extremas de cualquier contorno de N puntos
 * usando proyección en diagonales (TopLeft = min(x+y), BottomRight = max(x+y), etc.)
 */
function extract4Extremes(pts: { x: number; y: number }[]): { x: number; y: number }[] | null {
  if (pts.length < 4) return null;

  let tl = pts[0], tr = pts[0], br = pts[0], bl = pts[0];
  let minSum = Infinity, maxSum = -Infinity;
  let minDiff = Infinity, maxDiff = -Infinity;

  for (const p of pts) {
    const sum = p.x + p.y;
    const diff = p.y - p.x;

    if (sum < minSum) { minSum = sum; tl = p; }
    if (sum > maxSum) { maxSum = sum; br = p; }
    if (diff < minDiff) { minDiff = diff; tr = p; }
    if (diff > maxDiff) { maxDiff = diff; bl = p; }
  }

  // Verificar que los 4 puntos sean distintos y formen un área no despreciable
  const distinct = new Set([`${tl.x},${tl.y}`, `${tr.x},${tr.y}`, `${br.x},${br.y}`, `${bl.x},${bl.y}`]);
  if (distinct.size < 4) return null;

  return [tl, tr, br, bl];
}

/**
 * Valida que las 4 esquinas forman un cuadrilátero razonable
 */
function isValidQuad(pts: { x: number; y: number }[]): boolean {
  if (pts.length !== 4) return false;

  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);

  // Debe ocupar al menos 12% del ancho y 12% del alto
  if (w < 0.12 || h < 0.12) return false;

  // Aspect ratio entre 0.25 y 4.0
  const aspect = w / h;
  if (aspect < 0.25 || aspect > 4.0) return false;

  return true;
}

/**
 * Detecta el cuadrilátero del documento en tiempo real usando OpenCV.js.
 * Utiliza dos canales complementarios:
 * 1. Binarización Otsu + Morphological Close (ideal para páginas de texto, hojas claras y recibos)
 * 2. Canny Edge Detection (ideal para bordes con contraste directo)
 */
export function detectOpenCVCorners(sampleCanvas: HTMLCanvasElement): CropPoints | null {
  const cv = window.cv;
  if (!cv || !cv.Mat || !cv.imread || !cv.findContours) {
    return null;
  }

  const W = sampleCanvas.width;
  const H = sampleCanvas.height;
  const totalArea = W * H;
  const minArea = totalArea * 0.08;
  const maxArea = totalArea * 0.98;

  let src: any = null;
  let gray: any = null;
  let blurred: any = null;
  let binary: any = null;
  let morphClose: any = null;
  let cannyEdges: any = null;
  let contoursBin: any = null;
  let hierBin: any = null;
  let contoursCanny: any = null;
  let hierCanny: any = null;

  try {
    src = cv.imread(sampleCanvas);
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    // ==========================================
    // CANAL 1: Binarización Otsu + Morphological Close
    // Fusiona texto y fondo de hoja en una sola masa sólida
    // ==========================================
    binary = new cv.Mat();
    cv.threshold(blurred, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);

    const closeKernel = cv.Mat.ones(5, 5, cv.CV_8U);
    morphClose = new cv.Mat();
    cv.morphologyEx(binary, morphClose, cv.MORPH_CLOSE, closeKernel);
    closeKernel.delete();

    // ==========================================
    // CANAL 2: Canny Edge Detection
    // ==========================================
    cannyEdges = new cv.Mat();
    cv.Canny(blurred, cannyEdges, 30, 100);
    const dilateKernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(cannyEdges, cannyEdges, dilateKernel);
    dilateKernel.delete();

    // Evaluar contornos de ambos canales
    const candidates: { quad: { x: number; y: number }[]; area: number }[] = [];

    // Función auxiliar para procesar un vector de contornos
    const processContours = (contoursMatVec: any) => {
      for (let i = 0; i < contoursMatVec.size(); ++i) {
        const cnt = contoursMatVec.get(i);
        const area = cv.contourArea(cnt);

        if (area >= minArea && area <= maxArea) {
          const hull = new cv.Mat();
          cv.convexHull(cnt, hull, false, true);
          const hullArea = cv.contourArea(hull);

          if (hullArea >= minArea) {
            const peri = cv.arcLength(hull, true);
            let foundQuad: { x: number; y: number }[] | null = null;

            // Paso A: Probar approxPolyDP iterativo
            for (let epsMult = 0.015; epsMult <= 0.12; epsMult += 0.01) {
              const approx = new cv.Mat();
              cv.approxPolyDP(hull, approx, epsMult * peri, true);

              if (approx.rows === 4) {
                const pts: { x: number; y: number }[] = [];
                for (let r = 0; r < 4; r++) {
                  pts.push({
                    x: approx.data32S[r * 2] / W,
                    y: approx.data32S[r * 2 + 1] / H,
                  });
                }
                if (isValidQuad(pts)) {
                  foundQuad = pts;
                }
                approx.delete();
                break;
              }
              approx.delete();
            }

            // Paso B: Si approxPolyDP no devolvió 4, extraer 4 extremos por diagonales
            if (!foundQuad && hull.rows >= 4) {
              const allHullPts: { x: number; y: number }[] = [];
              for (let r = 0; r < hull.rows; r++) {
                allHullPts.push({
                  x: hull.data32S[r * 2] / W,
                  y: hull.data32S[r * 2 + 1] / H,
                });
              }
              const extremes = extract4Extremes(allHullPts);
              if (extremes && isValidQuad(extremes)) {
                foundQuad = extremes;
              }
            }

            if (foundQuad) {
              candidates.push({ quad: foundQuad, area: hullArea });
            }
          }
          hull.delete();
        }
        cnt.delete();
      }
    };

    // Procesar contornos de Canal 1 (Otsu Morph)
    contoursBin = new cv.MatVector();
    hierBin = new cv.Mat();
    cv.findContours(morphClose, contoursBin, hierBin, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    processContours(contoursBin);

    // Procesar contornos de Canal 2 (Canny Edges)
    contoursCanny = new cv.MatVector();
    hierCanny = new cv.Mat();
    cv.findContours(cannyEdges, contoursCanny, hierCanny, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    processContours(contoursCanny);

    if (candidates.length > 0) {
      // Elegir el cuadrilátero con mayor área sólida detectada
      candidates.sort((a, b) => b.area - a.area);
      const best = candidates[0].quad;

      const clamped = best.map(p => ({
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
    if (binary) binary.delete();
    if (morphClose) morphClose.delete();
    if (cannyEdges) cannyEdges.delete();
    if (contoursBin) contoursBin.delete();
    if (hierBin) hierBin.delete();
    if (contoursCanny) contoursCanny.delete();
    if (hierCanny) hierCanny.delete();
  }
}
