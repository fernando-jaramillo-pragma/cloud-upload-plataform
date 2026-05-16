import sharp from 'sharp';

// Dimensiones para imagen procesada (9:16 portrait Full HD)
const PROCESSED_WIDTH = 1080;
const PROCESSED_HEIGHT = 1920;

// Dimensiones para thumbnail (9:16 pequeño)
const THUMB_WIDTH = 270;
const THUMB_HEIGHT = 480;

export interface ProcessedImages {
  original: Buffer;
  processed: Buffer;
  thumbnail: Buffer;
  width: number;
  height: number;
}

/**
 * Procesa la imagen:
 *  1. Comprime el original a JPEG q90 sin resize ni filtros.
 *  2. Escala a 9:16 (1080×1920) con buena calidad — placeholder para IA.
 *  3. Genera thumbnail 9:16 (270×480) a partir de la imagen procesada.
 */
export async function processImage(buffer: Buffer): Promise<ProcessedImages> {
  // Original: corregir orientación EXIF y comprimir sin resize ni filtros
  const originalBuffer = await sharp(buffer)
    .rotate() // corrige orientación EXIF (fotos iPhone)
    .jpeg({ quality: 90 })
    .toBuffer();

  // Procesada: forzar exactamente 9:16 recortando el centro (aquí se integrará Gemini)
  const processedBuffer = await sharp(buffer)
    .rotate() // corrige orientación EXIF
    .resize(PROCESSED_WIDTH, PROCESSED_HEIGHT, {
      fit: 'cover',
      position: 'centre',
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  const { width, height } = await sharp(processedBuffer).metadata();

  // Thumbnail: generado de la procesada, siempre 9:16 exacto
  const thumbnailBuffer = await sharp(processedBuffer)
    .resize(THUMB_WIDTH, THUMB_HEIGHT, {
      fit: 'cover',
      position: 'centre',
    })
    .jpeg({ quality: 75 })
    .toBuffer();

  return {
    original: originalBuffer,
    processed: processedBuffer,
    thumbnail: thumbnailBuffer,
    width: width ?? 0,
    height: height ?? 0,
  };
}
