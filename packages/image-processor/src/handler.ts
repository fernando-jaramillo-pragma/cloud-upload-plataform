import type { Handler } from 'aws-lambda';
import { createHash } from 'crypto';
import type { ImageUploadPayload, LambdaResponse } from '@org/models';
import { validateImage } from './lib/validator.js';
import { processImage } from './lib/processor.js';
import { uploadToR2, existsInR2, getR2PublicUrl } from './lib/r2-uploader.js';

/**
 * AWS Lambda Handler — Procesador de imágenes
 *
 * Flujo:
 *  1. Recibe la imagen en base64 desde la API Express.
 *  2. Valida formato y dimensiones.
 *  3. Redimensiona, aplica grayscale y genera thumbnail con sharp.
 *  4. Sube imagen procesada y thumbnail a Cloudflare R2.
 *  5. Retorna las URLs públicas.
 */
export const handler: Handler<ImageUploadPayload, LambdaResponse> = async (
  event,
) => {
  try {
    const { imageBase64, filename, mimetype } = event;

    // 1. Decodificar base64 → Buffer
    const buffer = Buffer.from(imageBase64, 'base64');

    // 2. Calcular hash SHA-256 del contenido original para detectar duplicados
    const hash = createHash('sha256').update(buffer).digest('hex');
    const ext =
      mimetype === 'image/png'
        ? 'png'
        : mimetype === 'image/webp'
          ? 'webp'
          : 'jpg';
    const originalKey = `originals/${hash}.${ext}`;
    const processedKey = `processed/${hash}.jpg`;
    const thumbnailKey = `thumbnails/${hash}-thumb.jpg`;

    // 3. Si ya existe en R2, devolver las URLs sin reprocesar
    const alreadyExists = await existsInR2(processedKey);
    if (alreadyExists) {
      console.log(
        `Imagen duplicada detectada (hash: ${hash}), devolviendo URLs existentes`,
      );
      const publicUrl = await getR2PublicUrl();
      return {
        statusCode: 200,
        body: {
          originalKey,
          originalUrl: `${publicUrl}/${originalKey}`,
          processedKey,
          thumbnailKey,
          processedUrl: `${publicUrl}/${processedKey}`,
          thumbnailUrl: `${publicUrl}/${thumbnailKey}`,
          originalFilename: filename,
          width: 0,
          height: 0,
        },
      };
    }

    // 4. Validar imagen
    const validation = await validateImage(buffer, mimetype);
    if (!validation.valid) {
      return {
        statusCode: 400,
        body: { error: validation.error ?? 'Imagen inválida' },
      };
    }

    // 5. Procesar: resize + grayscale + thumbnail
    const { processed, thumbnail, width, height } = await processImage(buffer);

    const metadata = { 'original-filename': filename };

    // 6. Subir original, procesada y thumbnail a R2 en paralelo
    const [originalUrl, processedUrl, thumbnailUrl] = await Promise.all([
      uploadToR2(originalKey, buffer, mimetype, metadata),
      uploadToR2(processedKey, processed, 'image/jpeg', metadata),
      uploadToR2(thumbnailKey, thumbnail, 'image/jpeg', metadata),
    ]);

    return {
      statusCode: 200,
      body: {
        originalKey,
        originalUrl,
        processedKey,
        thumbnailKey,
        processedUrl,
        thumbnailUrl,
        originalFilename: filename,
        width,
        height,
      },
    };
  } catch (err) {
    console.error('Error procesando imagen:', err);
    return {
      statusCode: 500,
      body: { error: 'Error interno al procesar la imagen' },
    };
  }
};
