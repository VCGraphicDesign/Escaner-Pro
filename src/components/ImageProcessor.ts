// Image processing algorithms in pure TypeScript/Canvas for high performance document scanning

// Solve system of linear equations A * x = B using Gaussian elimination
function solveGaussian(A: number[][], B: number[]): number[] {
  const n = B.length;
  for (let i = 0; i < n; i++) {
    // Search for maximum in this column
    let maxEl = Math.abs(A[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > maxEl) {
        maxEl = Math.abs(A[k][i]);
        maxRow = k;
      }
    }

    // Swap maximum row with current row
    const tempA = A[maxRow];
    A[maxRow] = A[i];
    A[i] = tempA;

    const tempB = B[maxRow];
    B[maxRow] = B[i];
    B[i] = tempB;

    // Make all rows below this one 0 in current column
    for (let k = i + 1; k < n; k++) {
      const c = -A[k][i] / A[i][i];
      for (let j = i; j < n; j++) {
        if (i === j) {
          A[k][j] = 0;
        } else {
          A[k][j] += c * A[i][j];
        }
      }
      B[k] += c * B[i];
    }
  }

  // Solve equation Ax=B for an upper triangular matrix
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = B[i] / A[i][i];
    for (let k = i - 1; k >= 0; k--) {
      B[k] -= A[k][i] * x[i];
    }
  }
  return x;
}

// Compute the Homography coefficients converting Target coordinates (x,y) to Source coordinates (u,v)
// Source points are: srcPoints = [{x, y}, ...] (the crop corners in the original image pixels)
// Target points are: dstPoints = [{x, y}, ...] (the layout corners of the final rectangular viewport: (0,0), (W,0), (W,H), (0,H))
export function getHomographyMatrix(
  src: { x: number; y: number }[],
  dst: { x: number; y: number }[]
): number[] {
  const A: number[][] = [];
  const B: number[] = [];

  for (let i = 0; i < 4; i++) {
    const x = dst[i].x;
    const y = dst[i].y;
    const u = src[i].x;
    const v = src[i].y;

    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    B.push(u);

    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    B.push(v);
  }

  const h = solveGaussian(A, B);
  return [...h, 1.0]; // h8 = 1.0
}

// Apply homography transformation to crop and warp image
export function warpPerspective(
  sourceImgData: ImageData,
  destWidth: number,
  destHeight: number,
  srcNormalizedPoints: { x: number; y: number }[] // 4 normalized points inside [0, 1]
): ImageData {
  const srcWidth = sourceImgData.width;
  const srcHeight = sourceImgData.height;

  // 1. Map normalized points to source pixel coordinates
  const srcPoints = srcNormalizedPoints.map((p) => ({
    x: p.x * srcWidth,
    y: p.y * srcHeight,
  }));

  // 2. Define corners in target image
  const dstPoints = [
    { x: 0, y: 0 },
    { x: destWidth, y: 0 },
    { x: destWidth, y: destHeight },
    { x: 0, y: destHeight },
  ];

  // 3. Get backward projection Homography matrix (dst -> src)
  const h = getHomographyMatrix(srcPoints, dstPoints);

  const destImgData = new ImageData(destWidth, destHeight);
  const srcPixels = sourceImgData.data;
  const destPixels = destImgData.data;

  // 4. Warp pixels using bilinear interpolation
  for (let y = 0; y < destHeight; y++) {
    for (let x = 0; x < destWidth; x++) {
      // Projected coordinates in source image
      const denominator = h[6] * x + h[7] * y + 1.0;
      const u = (h[0] * x + h[1] * y + h[2]) / denominator;
      const v = (h[3] * x + h[4] * y + h[5]) / denominator;

      const destIdx = (y * destWidth + x) * 4;

      if (u >= 0 && u < srcWidth - 1 && v >= 0 && v < srcHeight - 1) {
        // Bilinear interpolation
        const u0 = Math.floor(u);
        const u1 = u0 + 1;
        const v0 = Math.floor(v);
        const v1 = v0 + 1;

        const du = u - u0;
        const dv = v - v0;

        const idx00 = (v0 * srcWidth + u0) * 4;
        const idx10 = (v0 * srcWidth + u1) * 4;
        const idx01 = (v1 * srcWidth + u0) * 4;
        const idx11 = (v1 * srcWidth + u1) * 4;

        for (let channel = 0; channel < 4; channel++) {
          const w00 = (1 - du) * (1 - dv);
          const w10 = du * (1 - dv);
          const w01 = (1 - du) * dv;
          const w11 = du * dv;

          destPixels[destIdx + channel] = Math.round(
            srcPixels[idx00 + channel] * w00 +
              srcPixels[idx10 + channel] * w10 +
              srcPixels[idx01 + channel] * w01 +
              srcPixels[idx11 + channel] * w11
          );
        }
      } else {
        // Background color (out of bounds)
        destPixels[destIdx] = 255;     // R
        destPixels[destIdx + 1] = 255; // G
        destPixels[destIdx + 2] = 255; // B
        destPixels[destIdx + 3] = 255; // A
      }
    }
  }

  return destImgData;
}

// Helper to build 2D array representation of grayscale values
function getGrayscalePixels(imgData: ImageData): Uint8ClampedArray {
  const pixels = imgData.data;
  const len = pixels.length / 4;
  const gray = new Uint8ClampedArray(len);
  for (let i = 0; i < len; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    // standard relative luminance weights
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return gray;
}

// Fast vertical & horizontal box blur
// Radius should be large to extract local illumination background (e.g. 15-40px)
function boxBlurGrayscale(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(gray.length);
  const temp = new Uint8ClampedArray(gray.length);

  // Horizontal blur pass
  for (let y = 0; y < height; y++) {
    let windowSum = 0;
    const rowOffset = y * width;

    // Initialize window
    for (let x = -radius; x <= radius; x++) {
      const px = Math.min(width - 1, Math.max(0, x));
      windowSum += gray[rowOffset + px];
    }

    for (let x = 0; x < width; x++) {
      temp[rowOffset + x] = windowSum / (radius * 2 + 1);

      // Slide window
      const leftX = Math.max(0, x - radius);
      const rightX = Math.min(width - 1, x + radius + 1);
      windowSum += gray[rowOffset + rightX] - gray[rowOffset + leftX];
    }
  }

  // Vertical blur pass
  for (let x = 0; x < width; x++) {
    let windowSum = 0;

    // Initialize window
    for (let y = -radius; y <= radius; y++) {
      const py = Math.min(height - 1, Math.max(0, y));
      windowSum += temp[py * width + x];
    }

    for (let y = 0; y < height; y++) {
      output[y * width + x] = windowSum / (radius * 2 + 1);

      // Slide window
      const topY = Math.max(0, y - radius);
      const bottomY = Math.min(height - 1, y + radius + 1);
      windowSum += temp[bottomY * width + x] - temp[topY * width + x];
    }
  }

  return output;
}

// Shadow Removal (Lighting Normalization)
// Divide the original grayscale pixels by the blurred background reference to flattish the paper white.
export function removeShadows(imgData: ImageData, blurRadius = 25): ImageData {
  const w = imgData.width;
  const h = imgData.height;
  const pixels = imgData.data;

  // Get grayscale
  const gray = getGrayscalePixels(imgData);

  // Get blurred background lighting
  const background = boxBlurGrayscale(gray, w, h, blurRadius);

  const output = new ImageData(w, h);
  const outPixels = output.data;

  for (let idx = 0; idx < pixels.length; idx += 4) {
    const grayIdx = idx / 4;
    const bgVal = background[grayIdx] || 1; // avoid / 0

    // Ratio scale
    for (let c = 0; c < 3; c++) {
      const origVal = pixels[idx + c];
      // Formula: (origVal / background) * 240
      // We clip to [0, 255]
      const corrected = Math.min(255, Math.max(0, Math.round((origVal / bgVal) * 235)));
      outPixels[idx + c] = corrected;
    }
    outPixels[idx + 3] = pixels[idx + 3]; // keep alpha
  }

  return output;
}

// Build Integral Image (Summed Area Table) for adaptive binarization in O(1) time complexity per pixel
function buildIntegralImage(gray: Uint8ClampedArray, w: number, h: number): Int32Array {
  const integral = new Int32Array(w * h);

  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    const offset = y * w;
    for (let x = 0; x < w; x++) {
      rowSum += gray[offset + x];
      if (y === 0) {
        integral[offset + x] = rowSum;
      } else {
        integral[offset + x] = integral[offset - w + x] + rowSum;
      }
    }
  }

  return integral;
}

// Fast Adaptive Thresholding (Adaptive Binarization similar to opencv's adaptiveThreshold)
// WindowSize is local check range (e.g. 15-30px)
// C is value to subtract from local mean (usually 5 to 15) to remove gray noise
export function adaptiveBinarization(
  imgData: ImageData,
  windowSize = 25,
  C = 10
): ImageData {
  const w = imgData.width;
  const h = imgData.height;
  const output = new ImageData(w, h);
  const outPixels = output.data;

  const gray = getGrayscalePixels(imgData);
  const integral = buildIntegralImage(gray, w, h);
  const radius = Math.floor(windowSize / 2);

  for (let y = 0; y < h; y++) {
    const rowOffset = y * w;
    for (let x = 0; x < w; x++) {
      const idx = (rowOffset + x) * 4;

      // Define bounding rectangle of neighborhood window
      const x1 = Math.max(0, x - radius);
      const x2 = Math.min(w - 1, x + radius);
      const y1 = Math.max(0, y - radius);
      const y2 = Math.min(h - 1, y + radius);

      // Area size of neighborhood window
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);

      // Compute sum in window using integral image
      // Sum = Int(x2, y2) - Int(x1-1, y2) - Int(x2, y1-1) + Int(x1-1, y1-1)
      let sum = integral[y2 * w + x2];
      if (x1 > 0) sum -= integral[y2 * w + (x1 - 1)];
      if (y1 > 0) sum -= integral[(y1 - 1) * w + x2];
      if (x1 > 0 && y1 > 0) sum += integral[(y1 - 1) * w + (x1 - 1)];

      const localMean = sum / count;
      const val = gray[rowOffset + x];

      // Binarize
      const bit = val < localMean - C ? 0 : 255;

      outPixels[idx] = bit;
      outPixels[idx + 1] = bit;
      outPixels[idx + 2] = bit;
      outPixels[idx + 3] = 255; // opaque
    }
  }

  return output;
}

// Convert image to simple grayscale
export function applyGrayscaleFilter(imgData: ImageData): ImageData {
  const output = new ImageData(imgData.width, imgData.height);
  const src = imgData.data;
  const dst = output.data;

  for (let i = 0; i < src.length; i += 4) {
    const val = Math.round(0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]);
    dst[i] = val;
    dst[i + 1] = val;
    dst[i + 2] = val;
    dst[i + 3] = src[i + 3];
  }
  return output;
}

// Simple color adjustment filter: Brightness (-100 to 100) & Contrast (-100 to 100)
export function adjustBrightnessContrast(
  imgData: ImageData,
  brightness: number,
  contrast: number
): ImageData {
  const output = new ImageData(imgData.width, imgData.height);
  const src = imgData.data;
  const dst = output.data;

  // factor values
  const bVal = brightness; // linear shift
  const cFactor = (259 * (contrast + 255)) / (255 * (259 - contrast)); // contrast multiplier

  for (let i = 0; i < src.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      // Adjust brightness first
      let pixelSum = src[i + c] + bVal;

      // Adjust contrast
      pixelSum = cFactor * (pixelSum - 128) + 128;

      // Clip to [0, 255]
      dst[i + c] = Math.min(255, Math.max(0, Math.round(pixelSum)));
    }
    dst[i + 3] = src[i + 3]; // keep alpha
  }

  return output;
}

// Translate and Rotate image via offscreen Canvas transform
function rotateImageData(imgData: ImageData, degrees: number): ImageData {
  if (degrees === 0) return imgData;
  const canvas = document.createElement('canvas');
  canvas.width = imgData.width;
  canvas.height = imgData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return imgData;
  ctx.putImageData(imgData, 0, 0);

  const rotateCanvas = document.createElement('canvas');
  if (degrees === 90 || degrees === 270) {
    rotateCanvas.width = imgData.height;
    rotateCanvas.height = imgData.width;
  } else {
    rotateCanvas.width = imgData.width;
    rotateCanvas.height = imgData.height;
  }

  const rCtx = rotateCanvas.getContext('2d');
  if (!rCtx) return imgData;

  rCtx.translate(rotateCanvas.width / 2, rotateCanvas.height / 2);
  rCtx.rotate((degrees * Math.PI) / 180);
  rCtx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

  return rCtx.getImageData(0, 0, rotateCanvas.width, rotateCanvas.height);
}

// Orchestrator: loads base64 image, applies perspective grid crop, rotates, handles shadow normalization and binarization filters
export function processPageImage(
  originalBase64: string,
  cropPoints: { x: number; y: number }[],
  rotate: number,
  brightness: number,
  contrast: number,
  binarize: boolean,
  shadowRemoval: boolean,
  grayscale: boolean,
  binarizeThreshold: number // C constant
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = originalBase64;
    img.onload = () => {
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = img.naturalWidth;
      srcCanvas.height = img.naturalHeight;
      const srcCtx = srcCanvas.getContext('2d');
      if (!srcCtx) return resolve(originalBase64);
      srcCtx.drawImage(img, 0, 0);

      // Force standard document crop dimensions aspect ratio 1:1.414 (A4)
      const destW = 1000;
      const destH = 1414;

      const srcImgData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
      
      // 1. Perspective crop
      let warpedImgData = warpPerspective(srcImgData, destW, destH, cropPoints);
      
      // 2. Rotate
      if (rotate > 0) {
        warpedImgData = rotateImageData(warpedImgData, rotate);
      }

      // 3. Shadow removal CLAHE-like lighting normalization
      if (shadowRemoval) {
        warpedImgData = removeShadows(warpedImgData, 28);
      }

      // 4. Adaptive thresholding binarization
      if (binarize) {
        warpedImgData = adaptiveBinarization(warpedImgData, 28, binarizeThreshold);
      } else {
        // Simple filter adjustments
        if (grayscale) {
          warpedImgData = applyGrayscaleFilter(warpedImgData);
        }
        if (brightness !== 0 || contrast !== 0) {
          warpedImgData = adjustBrightnessContrast(warpedImgData, brightness, contrast);
        }
      }

      // 5. Convert back into base64 URI
      const destCanvas = document.createElement('canvas');
      destCanvas.width = warpedImgData.width;
      destCanvas.height = warpedImgData.height;
      const destCtx = destCanvas.getContext('2d');
      if (destCtx) {
        destCtx.putImageData(warpedImgData, 0, 0);
        resolve(destCanvas.toDataURL('image/jpeg', 0.88));
      } else {
        resolve(originalBase64);
      }
    };
  });
}

