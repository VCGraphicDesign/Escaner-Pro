// src/services/dewarpModel.ts

/**
 * Tiny wrapper around TensorFlow.js to load a pre‑trained DocUNet‑lite model
 * (MobileNet‑v2 encoder) and predict the geometric transformation needed to
 * flatten a scanned document.
 *
 * The actual model files (model.json + shard binaries) must be placed in
 * `src/assets/models/docunet_mobilenet_v2/`. For the purpose of this prototype a
 * minimal placeholder model is provided – replace it with the real converted
 * TensorFlow.js graph model when available.
 */

import * as tf from '@tensorflow/tfjs';

let model: tf.GraphModel | null = null;

/** Load the model on first use. */
export async function loadDewarpModel(): Promise<tf.GraphModel> {
  if (!model) {
    // The path is relative to the built web assets folder.
    const modelUrl = '/assets/models/docunet_mobilenet_v2/model.json';
    model = await tf.loadGraphModel(modelUrl);
  }
  return model;
}

/** Helper to convert a base64 image string to an HTMLImageElement. */
function loadImageFromBase64(base64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    // Ensure the string has the data‑uri prefix.
    img.src = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
  });
}

/**
 * Predict the dewarp coefficients.
 * Returns an array of 8 numbers that represent the geometric transformation.
 */
export async function predictWarp(base64: string): Promise<number[]> {
  // Load the image, resize to the input size expected by the model (256×256).
  const img = await loadImageFromBase64(base64);
  const tensor = tf.browser
    .fromPixels(img)
    .resizeBilinear([256, 256])
    .div(255)
    .expandDims(0);

  const graph = await loadDewarpModel();
  // The model outputs a tensor of shape [1, 8] (8 coefficients).
  const raw = (await graph.executeAsync(tensor)) as tf.Tensor;
  const coeffs = (await raw.array()) as number[][];

  // Clean up tensors to avoid memory leaks.
  tf.dispose([tensor, raw]);
  return coeffs[0];
}
