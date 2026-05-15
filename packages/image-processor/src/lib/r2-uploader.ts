import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getR2Credentials, type R2Credentials } from './secrets.js';

// Cliente S3 y credenciales cacheados
let s3Client: S3Client | null = null;
let credentials: R2Credentials | null = null;

/**
 * Obtiene el cliente S3 configurado para R2.
 * Se inicializa de forma lazy con los secrets de Secrets Manager.
 */
async function getS3Client(): Promise<{
  client: S3Client;
  creds: R2Credentials;
}> {
  if (s3Client && credentials) {
    return { client: s3Client, creds: credentials };
  }

  credentials = await getR2Credentials();

  /**
   * R2 es compatible con la API de S3. Solo cambia el endpoint:
   * https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   */
  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${credentials.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: credentials.R2_ACCESS_KEY_ID,
      secretAccessKey: credentials.R2_SECRET_ACCESS_KEY,
    },
  });

  return { client: s3Client, creds: credentials };
}

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
  const { client, creds } = await getS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: creds.R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
    }),
  );

  return `${creds.R2_PUBLIC_URL}/${key}`;
}

/**
 * Comprueba si un objeto ya existe en R2 sin descargarlo (HTTP HEAD).
 *
 * @param key Ruta dentro del bucket
 * @returns true si el objeto existe
 */
export async function existsInR2(key: string): Promise<boolean> {
  const { client, creds } = await getS3Client();

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: creds.R2_BUCKET_NAME,
        Key: key,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Obtiene la URL pública base de R2.
 */
export async function getR2PublicUrl(): Promise<string> {
  const { creds } = await getS3Client();
  return creds.R2_PUBLIC_URL;
}
