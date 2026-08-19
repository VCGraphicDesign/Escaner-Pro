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
 * Ordena un conjunto de 4 puntos en (Top-Left, Top-Right, Bottom-Right, Bottom-Left)
 */
function sortQuadrilateralCorners(pts: { x: number; y: number }[]): CropPoints {
  const sortedBySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const topLeft = sortedBySum[0];
  const bottomRight = sortedBySum[3];

  const remaining = [sortedBySum[1], sortedBySum[2]];
  const sortedByDiff = remaining.sort((a, b) => a.y - a.x - (b.y - b.x));
  const topRight = sortedByDiff[0];
  const bottomLeft = sortedByDiff[1];

  return { topLeft, topRight, bottomRight, bottomLeft };
}

/**
 * Detecta dinámicamente el cuadrilátero real del documento usando OpenCV.js (Canny + findContours + approxPolyDP)
 */
export function detectOpenCVCorners(sampleCanvas: HTMLCanvasElement): CropPoints | null {
  const cv = window.cv;
  if (!cv || !cv.Mat || !cv.imread) {
    return null;
  }

  let src: any = null;
  let gray: any = null;
  let blurred: any = null;
  let edges: any = null;
  let dilated: any = null;
  let contours: any = null;
  let hierarchy: any = null;

  try {
    src = cv.imread(sampleCanvas);
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    edges = new cv.Mat();
    cv.Canny(blurred, edges, 50, 150);

    const M = cv.Mat.ones(3, 3, cv.CV_8U);
    dilated = new cv.Mat();
    cv.dilate(edges, dilated, M);
    M.delete();

    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const totalArea = sampleCanvas.width * sampleCanvas.height;
    let maxArea = totalArea * 0.08; // Área mínima requerida (8% del lienzo)
    let bestQuad: { x: number; y: number }[] | null = null;

    for (let i = 0; i < contours.size(); ++i) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);

      if (area > maxArea && area < totalArea * 0.96) {
        const peri = cv.arcLength(cnt, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          maxArea = area;
          const pts: { x: number; y: number }[] = [];
          for (let r = 0; r < 4; r++) {
            pts.push({
              x: approx.data32S[r * 2] / sampleCanvas.width,
              y: approx.data32S[r * 2 + 1] / sampleCanvas.height,
            });
          }
          bestQuad = pts;
        }
        approx.delete();
      }
      cnt.delete();
    }

    if (bestQuad) {
      return sortQuadrilateralCorners(bestQuad);
    }
    return null;
  } catch (e) {
    console.warn('OpenCV processing notice:', e);
    return null;
  } finally {
    if (src) src.delete();
    if (gray) gray.delete();
    if (blurred) blurred.delete();
    if (edges) edges.delete();
    if (dilated) dilated.delete();
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
  }
}
