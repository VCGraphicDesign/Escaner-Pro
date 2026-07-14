/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Annotation {
  id: string;
  text: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  color: string;
  fontSize: number; // in pixels or relative
}

export interface CropPoints {
  topLeft: { x: number; y: number }; // 0 to 1 relative coordinates
  topRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  bottomRight: { x: number; y: number };
}

export interface PageAdjustment {
  brightness: number; // 50 to 150 (percentage, default 100)
  contrast: number; // 50 to 150 (percentage, default 100)
  sharpness: number; // 0 to 100 (default 0)
  filter: 'original' | 'auto' | 'bw' | 'grayscale' | 'enhanced';
  rotation: number; // 0, 90, 180, 270 degrees
  crop: CropPoints | null;
  annotations: Annotation[];
}

export interface ScannedPage {
  id: string;
  originalImage: string; // Base64 data URL
  processedImage: string; // Base64 data URL with current adjustments applied
  adjustments: PageAdjustment;
}

export interface DocumentItem {
  id: string;
  name: string;
  createdAt: string; // ISO date string
  pages: ScannedPage[];
}
