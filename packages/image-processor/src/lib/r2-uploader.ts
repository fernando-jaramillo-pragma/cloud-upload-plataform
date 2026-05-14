import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

// Credenciales de Cloudflare R2 — se inyectan como variables de entorno en la Lambda
const R2_ACCOUNT_ID = process.env['R2_ACCOUNT_ID'] ?? '';
const R2_ACCESS_KEY_ID = process.env['R2_ACCESS_KEY_ID'] ?? '';
const R2_SECRET_ACCESS_KEY = process.env['R2_SECRET_ACCESS_KEY'] ?? '';
const R2_BUCKET_NAME = process.env['R2_BUCKET_NAME'] ?? '';
const R2_PUBLIC_URL = process.env['R2_PUBLIC_URL'] ?? '';

/**
 * R2 es compatible con la API de S3. Solo cambia el endpoint:
 * https://<ACCOUNT_ID>.r2.cloudflarestorage.com
 */
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Sube un buffer a Cloudflare R2 y devuelve la URL pública.
 *
 * @param key  Ruta dentro del bucket (ej. "processed/uuid.jpg")
 * @param body Buffer con el contenido del archivo
 * @param contentType MIME type del archivo
 * @param metadata Metadatos adicionales del objeto (ej. nombre original)
 * @returns URL pública del objeto subido
 */
export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string,
  metadata?: Record<string, string>,
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
    }),
  );

  return `${R2_PUBLIC_URL}/${key}`;
}

/**
 * Comprueba si un objeto ya existe en R2 sin descargarlo (HTTP HEAD).
 *
 * @param key Ruta dentro del bucket
 * @returns true si el objeto existe
 */
export async function existsInR2(key: string): Promise<boolean> {
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      }),
    );
    return true;
  } catch {
    return false;
  }
}
