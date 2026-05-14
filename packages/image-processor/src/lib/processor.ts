import sharp from 'sharp';

const MAX_DIMENSION = 1200; // px en el lado más largo
const THUMBNAIL_SIZE = 200; // px (cuadrado)

export interface ProcessedImages {
  processed: Buffer;
  thumbnail: Buffer;
  width: number;
  height: number;
}

/**
 * Procesa la imagen:
 *  1. Redimensiona al máximo 1200px manteniendo proporción.
 *  2. Aplica filtro escala de grises (grayscale).
 *  3. Genera un thumbnail cuadrado de 200×200px recortando el centro.
 */
export async function processImage(buffer: Buffer): Promise<ProcessedImages> {
  // Imagen procesada: resize + grayscale
  const processedBuffer = await sharp(buffer)
    .resize(MAX_DIMENSION, MAX_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .grayscale()
    .jpeg({ quality: 85 })
    .toBuffer();

  const { width, height } = await sharp(processedBuffer).metadata();

  // Thumbnail: recorte central cuadrado + grayscale
  const thumbnailBuffer = await sharp(buffer)
    .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'cover' })
    .grayscale()
    .jpeg({ quality: 75 })
    .toBuffer();

  return {
    processed: processedBuffer,
    thumbnail: thumbnailBuffer,
    width: width ?? 0,
    height: height ?? 0,
  };
}
