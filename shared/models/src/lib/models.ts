/** Payload que la API envía a la Lambda */
export interface ImageUploadPayload {
  /** Buffer de la imagen original codificado en base64 */
  imageBase64: string;
  /** Nombre original del archivo */
  filename: string;
  /** MIME type (image/jpeg, image/png, image/webp) */
  mimetype: string;
  /** ID del usuario que sube la imagen (sub de Cognito) */
  userId: string;
}

/** Resultado devuelto por la Lambda tras procesar y subir la imagen */
export interface ImageProcessResult {
  /** Clave (key) en R2 de la imagen original */
  originalKey: string;
  /** URL pública de la imagen original */
  originalUrl: string;
  /** Clave (key) en R2 de la imagen procesada */
  processedKey: string;
  /** Clave (key) en R2 del thumbnail */
  thumbnailKey: string;
  /** URL pública de la imagen procesada */
  processedUrl: string;
  /** URL pública del thumbnail */
  thumbnailUrl: string;
  /** Nombre original del archivo (guardado como metadata en R2) */
  originalFilename: string;
  /** Ancho final de la imagen procesada (px) */
  width: number;
  /** Alto final de la imagen procesada (px) */
  height: number;
}

/** Item de la galería devuelto por GET /uploads */
export interface ThumbnailItem {
  /** UUID del recurso — se usa para construir la URL del endpoint DELETE */
  key: string;
  thumbnailUrl: string;
  processedUrl: string;
  uploadedAt: string;
  /** Indica si la imagen es pública */
  isPublic: boolean;
  /** Nombre del propietario de la imagen (opcional) */
  ownerName?: string;
}

/** Estructura del índice público guardado en R2 */
export interface PublicIndexEntry {
  userId: string;
  ownerName: string;
  key: string;
  thumbnailUrl: string;
  processedUrl: string;
  publishedAt: string;
}

/** Wrapper que retorna la Lambda */
export interface LambdaResponse {
  statusCode: number;
  body: ImageProcessResult | { error: string };
}

