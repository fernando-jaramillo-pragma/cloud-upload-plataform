/**
 * Tipos locales de la Lambda — espejo de @org/models.
 * Se duplican aquí para evitar complejidad de project references
 * en el bundle de Lambda (esbuild no necesita types de proyecto hermano).
 */

export interface ImageUploadPayload {
  imageBase64: string;
  filename: string;
  mimetype: string;
}

export interface ImageProcessResult {
  processedKey: string;
  thumbnailKey: string;
  processedUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
}

export interface LambdaResponse {
  statusCode: number;
  body: ImageProcessResult | { error: string };
}
