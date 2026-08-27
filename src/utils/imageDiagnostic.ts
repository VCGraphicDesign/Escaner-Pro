/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Temporary Diagnostic Instrument to verify image identity across the pipeline
 */

export interface DiagnosticRecord {
  stageId: string;
  stageName: string;
  file: string;
  func: string;
  varName: string;
  mime: string;
  byteLength: number;
  width: number;
  height: number;
  sha256: string;
  timestamp: string;
  matchesPrevious?: boolean;
  extra?: Record<string, any>;
}

declare global {
  interface Window {
    __ORIGINAL_DIAGNOSTICS__?: DiagnosticRecord[];
  }
}

/**
 * Decode base64 data URL into binary Uint8Array
 */
export function dataUrlToUint8Array(dataUrl: string): { bytes: Uint8Array; mime: string } {
  if (!dataUrl || !dataUrl.includes(',')) {
    return { bytes: new Uint8Array(0), mime: 'unknown' };
  }
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return { bytes, mime };
}

/**
 * Calculate SHA-256 of Uint8Array binary bytes using Web Crypto API
 */
export async function computeImageSha256(bytes: Uint8Array): Promise<string> {
  if (bytes.length === 0) return 'EMPTY_BUFFER';
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.warn('[ORIGINAL-DIAGNOSTIC] crypto.subtle error:', e);
      return 'CRYPTO_SUBTLE_ERROR';
    }
  }
  return 'CRYPTO_SUBTLE_UNAVAILABLE';
}

/**
 * Get natural dimensions of an image from its data URL
 */
export function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    if (!dataUrl) {
      resolve({ width: 0, height: 0 });
      return;
    }
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
    };
    img.src = dataUrl;
  });
}

/**
 * Log and store diagnostic record
 */
export async function recordImageDiagnostic(
  stageId: string,
  stageName: string,
  file: string,
  func: string,
  varName: string,
  dataUrl: string | undefined | null,
  extra?: Record<string, any>
): Promise<DiagnosticRecord> {
  if (typeof window !== 'undefined' && !window.__ORIGINAL_DIAGNOSTICS__) {
    window.__ORIGINAL_DIAGNOSTICS__ = [];
  }

  if (!dataUrl) {
    const record: DiagnosticRecord = {
      stageId,
      stageName,
      file,
      func,
      varName,
      mime: 'NONE',
      byteLength: 0,
      width: 0,
      height: 0,
      sha256: 'NULL_OR_UNDEFINED',
      timestamp: new Date().toISOString(),
      matchesPrevious: false,
      extra,
    };
    console.log(`[ORIGINAL-DIAGNOSTIC] ${stageName} (${stageId}) -> NULL / EMPTY`);
    window.__ORIGINAL_DIAGNOSTICS__?.push(record);
    return record;
  }

  const { bytes, mime } = dataUrlToUint8Array(dataUrl);
  const sha256 = await computeImageSha256(bytes);
  const { width, height } = await getImageDimensions(dataUrl);

  const prev = window.__ORIGINAL_DIAGNOSTICS__ && window.__ORIGINAL_DIAGNOSTICS__.length > 0
    ? window.__ORIGINAL_DIAGNOSTICS__[window.__ORIGINAL_DIAGNOSTICS__.length - 1]
    : null;

  const matchesPrevious = prev ? prev.sha256 === sha256 : true;

  const record: DiagnosticRecord = {
    stageId,
    stageName,
    file,
    func,
    varName,
    mime,
    byteLength: bytes.length,
    width,
    height,
    sha256,
    timestamp: new Date().toISOString(),
    matchesPrevious,
    extra,
  };

  window.__ORIGINAL_DIAGNOSTICS__?.push(record);

  console.log(
    `[ORIGINAL-DIAGNOSTIC] Stage: ${stageName} [${stageId}]\n` +
    `  File: ${file} -> ${func}()\n` +
    `  Variable: ${varName}\n` +
    `  MIME: ${mime} | Byte Length: ${bytes.length} bytes | Dimensions: ${width}x${height}\n` +
    `  SHA-256: ${sha256}\n` +
    `  Matches Previous Stage: ${matchesPrevious ? 'YES (IDENTICAL BYTES)' : 'NO (DIFFERENT BYTES)'}` +
    (extra ? `\n  Extra: ${JSON.stringify(extra)}` : '')
  );

  return record;
}
