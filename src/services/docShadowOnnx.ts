/**
 * DocShadow ONNX WASM Inference Engine for 'Sin Arrugas' / Restore Filter
 * 
 * - Strictly isolated execution provider: 'wasm' only (NO WebGPU, NO JSEP, NO WebNN).
 * - Static runtime assets served locally from '/onnx/' matching pinned onnxruntime-web package.
 * - Model: DocShadow SD7K ONNX model served from '/models/docshadow_sd7k.onnx'.
 * - Lazy-loaded and cached singleton InferenceSession.
 * - Mask-controlled compositing preserving 100% of original pixels outside the user's painted crease.
 */

import * as ort from 'onnxruntime-web/wasm';

// Configure ONNX Runtime WASM environment
if (typeof window !== 'undefined') {
  ort.env.wasm.wasmPaths = '/onnx/';
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
}

const MODEL_PATH = '/models/docshadow_sd7k.onnx';
const WASM_ASSET_PATH = '/onnx/ort-wasm-simd-threaded.wasm';

let cachedSession: ort.InferenceSession | null = null;
let sessionLoadingPromise: Promise<ort.InferenceSession> | null = null;

/**
 * Verifies that required static runtime assets are reachable.
 */
async function verifyRuntimeAssets(): Promise<boolean> {
  try {
    const [wasmRes, modelRes] = await Promise.all([
      fetch(WASM_ASSET_PATH, { method: 'HEAD' }),
      fetch(MODEL_PATH, { method: 'HEAD' }),
    ]);

    if (!wasmRes.ok && wasmRes.status !== 0) {
      console.error(`DocShadow WASM asset unreachable: ${WASM_ASSET_PATH} (status: ${wasmRes.status})`);
      return false;
    }

    if (!modelRes.ok && modelRes.status !== 0) {
      console.error(`DocShadow model asset unreachable: ${MODEL_PATH} (status: ${modelRes.status})`);
      return false;
    }

    return true;
  } catch (err) {
    console.warn('Asset reachability check skipped or failed, proceeding with direct load:', err);
    return true;
  }
}

/**
 * Lazy loads and caches the DocShadow ONNX InferenceSession.
 */
export async function getDocShadowSession(): Promise<ort.InferenceSession> {
  if (cachedSession) {
    return cachedSession;
  }

  if (sessionLoadingPromise) {
    return sessionLoadingPromise;
  }

  sessionLoadingPromise = (async () => {
    const assetsOk = await verifyRuntimeAssets();
    if (!assetsOk) {
      throw new Error('DocShadow runtime assets or ONNX model are unreachable.');
    }

    console.log('[DocShadow] Initializing WASM InferenceSession for:', MODEL_PATH);

    // Create session strictly with WASM execution provider
    const session = await ort.InferenceSession.create(MODEL_PATH, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });

    console.log('[DocShadow] Session created successfully. Inputs:', session.inputNames, 'Outputs:', session.outputNames);
    cachedSession = session;
    return session;
  })();

  try {
    return await sessionLoadingPromise;
  } catch (err) {
    sessionLoadingPromise = null;
    throw err;
  }
}

/**
 * Preprocesses a source canvas into DocShadow NCHW float32 input tensor [1, 3, H, W]
 * Normalized in range [0.0, 1.0] with RGB channel ordering.
 */
function createDocShadowInputTensor(
  sourceCanvas: HTMLCanvasElement,
  targetWidth = 512,
  targetHeight = 512
): { tensor: ort.Tensor; scaledCanvas: HTMLCanvasElement } {
  const offscreen = document.createElement('canvas');
  offscreen.width = targetWidth;
  offscreen.height = targetHeight;
  const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
  if (!offCtx) {
    throw new Error('Failed to create 2D context for DocShadow preprocessing');
  }

  // Draw scaled document image
  offCtx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
  const imgData = offCtx.getImageData(0, 0, targetWidth, targetHeight);
  const pixels = imgData.data;

  const numPixels = targetWidth * targetHeight;
  const floatData = new Float32Array(3 * numPixels);

  const rOffset = 0;
  const gOffset = numPixels;
  const bOffset = 2 * numPixels;

  for (let i = 0; i < numPixels; i++) {
    const pIdx = i * 4;
    floatData[rOffset + i] = pixels[pIdx] / 255.0;
    floatData[gOffset + i] = pixels[pIdx + 1] / 255.0;
    floatData[bOffset + i] = pixels[pIdx + 2] / 255.0;
  }

  const tensor = new ort.Tensor('float32', floatData, [1, 3, targetHeight, targetWidth]);
  return { tensor, scaledCanvas: offscreen };
}

/**
 * Postprocesses the DocShadow output tensor [1, 3, H, W] into an HTMLCanvasElement
 * with dimensions (origWidth, origHeight).
 */
function postprocessDocShadowOutput(
  outputTensor: ort.Tensor,
  targetWidth: number,
  targetHeight: number,
  origWidth: number,
  origHeight: number
): HTMLCanvasElement {
  const data = outputTensor.data as Float32Array;
  const numPixels = targetWidth * targetHeight;
  const rOffset = 0;
  const gOffset = numPixels;
  const bOffset = 2 * numPixels;

  const modelOutputCanvas = document.createElement('canvas');
  modelOutputCanvas.width = targetWidth;
  modelOutputCanvas.height = targetHeight;
  const modelCtx = modelOutputCanvas.getContext('2d', { willReadFrequently: true });
  if (!modelCtx) {
    throw new Error('Failed to create 2D context for DocShadow postprocessing');
  }

  const imgData = modelCtx.createImageData(targetWidth, targetHeight);
  const outPixels = imgData.data;

  for (let i = 0; i < numPixels; i++) {
    const pIdx = i * 4;
    const r = Math.max(0, Math.min(1.0, data[rOffset + i])) * 255.0;
    const g = Math.max(0, Math.min(1.0, data[gOffset + i])) * 255.0;
    const b = Math.max(0, Math.min(1.0, data[bOffset + i])) * 255.0;

    outPixels[pIdx] = Math.round(r);
    outPixels[pIdx + 1] = Math.round(g);
    outPixels[pIdx + 2] = Math.round(b);
    outPixels[pIdx + 3] = 255;
  }

  modelCtx.putImageData(imgData, 0, 0);

  // Resize model output canvas to original document dimensions
  const finalDocCanvas = document.createElement('canvas');
  finalDocCanvas.width = origWidth;
  finalDocCanvas.height = origHeight;
  const finalCtx = finalDocCanvas.getContext('2d');
  if (!finalCtx) {
    throw new Error('Failed to create 2D context for final scaling');
  }

  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = 'high';
  finalCtx.drawImage(modelOutputCanvas, 0, 0, origWidth, origHeight);

  return finalDocCanvas;
}

/**
 * Executes full DocShadow deep inference over the entire document canvas.
 */
export async function runDocShadowInference(sourceCanvas: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const origW = sourceCanvas.width;
  const origH = sourceCanvas.height;

  if (origW === 0 || origH === 0) {
    throw new Error('Invalid canvas dimensions for DocShadow inference');
  }

  const session = await getDocShadowSession();

  // Optimal inference dimensions: 512x512
  const inferW = 512;
  const inferH = 512;

  const { tensor } = createDocShadowInputTensor(sourceCanvas, inferW, inferH);

  console.log('[DocShadow] Running inference with WASM provider...');
  const results = await session.run({ image: tensor });

  const outputTensor = results.result || results[session.outputNames[0]];
  if (!outputTensor) {
    throw new Error('DocShadow inference did not return an output tensor');
  }

  return postprocessDocShadowOutput(outputTensor, inferW, inferH, origW, origH);
}

/**
 * Performs soft masked compositing:
 * - Outside user mask: 100% untouched original pixels.
 * - Inside user mask: DocShadow shadow-removed output.
 * - Boundary: Soft spatial feathering to prevent halos, seams or harsh steps.
 */
export async function applyDocShadowMaskedRestoration(
  originalCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement
): Promise<void> {
  const origCtx = originalCanvas.getContext('2d', { willReadFrequently: true });
  if (!origCtx) return;

  const w = originalCanvas.width;
  const h = originalCanvas.height;
  if (w === 0 || h === 0) return;

  // Respaldo de seguridad
  const backupData = origCtx.getImageData(0, 0, w, h);

  try {
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!maskCtx) return;

    const rawMaskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
    const maskScaleX = maskCanvas.width / w;
    const maskScaleY = maskCanvas.height / h;
    const mWidth = maskCanvas.width;

    // 1. Extraer máscara binaria (solo canales RGB) y calcular caja envolvente
    const maskWeights = new Float32Array(w * h);
    let minX = w, maxX = 0, minY = h, maxY = 0;
    let maskedCount = 0;

    for (let y = 0; y < h; y++) {
      const my = Math.min(maskCanvas.height - 1, Math.floor(y * maskScaleY));
      for (let x = 0; x < w; x++) {
        const mx = Math.min(maskCanvas.width - 1, Math.floor(x * maskScaleX));
        const mIdx = (my * mWidth + mx) * 4;
        const val = Math.max(rawMaskData[mIdx], rawMaskData[mIdx + 1], rawMaskData[mIdx + 2]);
        if (val > 25) {
          maskWeights[y * w + x] = Math.min(1.0, val / 255.0);
          maskedCount++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // Si la máscara está vacía, no alterar nada
    if (maskedCount === 0 || minX > maxX || minY > maxY) {
      return;
    }

    // 2. Ejecutar inferencia de DocShadow sobre la imagen original
    const docShadowOutputCanvas = await runDocShadowInference(originalCanvas);
    const docShadowCtx = docShadowOutputCanvas.getContext('2d', { willReadFrequently: true });
    if (!docShadowCtx) {
      throw new Error('Failed to get context from DocShadow output canvas');
    }

    const docShadowImageData = docShadowCtx.getImageData(0, 0, w, h);
    const dsPixels = docShadowImageData.data;

    const origImageData = origCtx.getImageData(0, 0, w, h);
    const origPixels = origImageData.data;

    // 3. Suavizado gaussiano 3x3 para transición continua en los bordes
    const smoothedMask = new Float32Array(w * h);
    const pad = 4;
    const bbMinX = Math.max(1, minX - pad);
    const bbMaxX = Math.min(w - 2, maxX + pad);
    const bbMinY = Math.max(1, minY - pad);
    const bbMaxY = Math.min(h - 2, maxY + pad);

    for (let y = bbMinY; y <= bbMaxY; y++) {
      for (let x = bbMinX; x <= bbMaxX; x++) {
        const idx = y * w + x;
        let sum = maskWeights[idx] * 4;
        sum += maskWeights[idx - 1] * 2 + maskWeights[idx + 1] * 2;
        sum += maskWeights[idx - w] * 2 + maskWeights[idx + w] * 2;
        sum += maskWeights[idx - w - 1] + maskWeights[idx - w + 1];
        sum += maskWeights[idx + w - 1] + maskWeights[idx + w + 1];
        smoothedMask[idx] = sum / 16.0;
      }
    }

    // 4. Composición localizada: blend dentro de la máscara, 100% original fuera
    for (let y = bbMinY; y <= bbMaxY; y++) {
      for (let x = bbMinX; x <= bbMaxX; x++) {
        const idx = y * w + x;
        const weight = smoothedMask[idx];

        if (weight > 0.002) {
          const pIdx = idx * 4;
          const origR = origPixels[pIdx];
          const origG = origPixels[pIdx + 1];
          const origB = origPixels[pIdx + 2];

          const dsR = dsPixels[pIdx];
          const dsG = dsPixels[pIdx + 1];
          const dsB = dsPixels[pIdx + 2];

          // final = original * (1 - weight) + docShadowResult * weight
          origPixels[pIdx] = Math.round(origR * (1.0 - weight) + dsR * weight);
          origPixels[pIdx + 1] = Math.round(origG * (1.0 - weight) + dsG * weight);
          origPixels[pIdx + 2] = Math.round(origB * (1.0 - weight) + dsB * weight);
        }
      }
    }

    origCtx.putImageData(origImageData, 0, 0);
    console.log('[DocShadow] Localized restoration applied successfully within painted mask.');
  } catch (err) {
    console.error('[DocShadow] Error during localized masked restoration:', err);
    // En caso de fallo, restaurar backup intacto
    origCtx.putImageData(backupData, 0, 0);
    throw err;
  }
}
