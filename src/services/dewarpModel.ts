// src/services/dewarpModel.ts

/**
 * Tiny wrapper around TensorFlow.js to load a pre‑trained DocUNet‑lite model
 * (MobileNet‑v2 encoder) and predict the geometric transformation needed to
 * flatten a scanned document.
 */

import * as tf from '@tensorflow/tfjs';

let model: tf.GraphModel | null = null;
let modelAttempted = false;

/** Load the model on first use if assets are available. */
export async function loadDewarpModel(): Promise<tf.GraphModel | null> {
  if (model) return model;
  if (modelAttempted) return null;

  modelAttempted = true;
  try {
    const modelUrl = '/assets/models/docunet_mobilenet_v2/model.json';
    const response = await fetch(modelUrl, { method: 'HEAD' }).catch(() => null);
    if (!response || !response.ok) {
      return null;
    }
    model = await tf.loadGraphModel(modelUrl);
    return model;
  } catch {
    return null;
  }
}

/** Helper to convert a base64 image string to an HTMLImageElement. */
function loadImageFromBase64(base64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
  });
}

/**
 * Predict the dewarp coefficients.
 * Returns an array of 8 numbers, or null if the model is not available.
 */
export async function predictWarp(base64: string): Promise<number[] | null> {
  try {
    const graph = await loadDewarpModel();
    if (!graph) return null;

    const img = await loadImageFromBase64(base64);
    const tensor = tf.browser
      .fromPixels(img)
      .resizeBilinear([256, 256])
      .div(255)
      .expandDims(0);

    const raw = (await graph.executeAsync(tensor)) as tf.Tensor;
    const coeffs = (await raw.array()) as number[][];

    tf.dispose([tensor, raw]);
    return coeffs[0];
  } catch {
    return null;
  }
}

