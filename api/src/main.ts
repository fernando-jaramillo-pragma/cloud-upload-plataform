import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import sharp from 'sharp';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { authMiddleware, AuthRequest } from './auth-middleware';
import type {
  ImageUploadPayload,
  LambdaResponse,
  ThumbnailItem,
  PublicIndexEntry,
} from '@org/models';

/**
 * Configuración del servidor Express y clientes AWS SDK.
 * Lee variables de entorno para host, puerto, credenciales de R2, etc.
 * Define rutas para listar uploads y subir imágenes.
 */
const host = process.env['HOST'] ?? 'localhost';
const port = process.env['PORT'] ? Number(process.env['PORT']) : 3000;

const R2_ACCOUNT_ID = process.env['R2_ACCOUNT_ID'] ?? '';
const R2_ACCESS_KEY_ID = process.env['R2_ACCESS_KEY_ID'] ?? '';
const R2_SECRET_ACCESS_KEY = process.env['R2_SECRET_ACCESS_KEY'] ?? '';
const R2_BUCKET_NAME = process.env['R2_BUCKET_NAME'] ?? '';
const R2_PUBLIC_URL = process.env['R2_PUBLIC_URL'] ?? '';

// Tamaño máximo de upload en MB (default: 10MB — cubre fotos de iPhone)
const UPLOAD_MAX_SIZE_MB = Number(process.env['UPLOAD_MAX_SIZE_MB'] ?? 10);

// Configuración de Express
const app = express();

// Debemos usar CORS para permitir que el frontend (que puede estar en otro origen) acceda a esta API. En producción, es recomendable configurar CORS de forma más restrictiva (p.ej., solo permitir el origen del frontend).
app.use(cors());
app.use(express.json());

/**
 * Configuración de Multer para manejar uploads de archivos en memoria.
 * Limitamos el tamaño máximo de los archivos para evitar abusos.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_MAX_SIZE_MB * 1024 * 1024 },
});

/**
 * Configuración del cliente Lambda de AWS SDK v3.
 */
const lambdaClient = new LambdaClient({
  region: process.env['AWS_REGION'] ?? 'us-east-1',
});

/**
 * Configuración del cliente R2 de Cloudflare (misma API que S3).
 */
const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Helper para leer el índice de fotos públicas en R2.
 */
async function readPublicIndex(): Promise<PublicIndexEntry[]> {
  try {
    const response = await r2Client.send(
      new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: 'public-index.json',
      })
    );
    if (!response.Body) return [];

    const stream = response.Body as Readable;
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', (err) => reject(err));
      stream.on('end', () => {
        try {
          const content = Buffer.concat(chunks).toString('utf-8');
          resolve(JSON.parse(content) as PublicIndexEntry[]);
        } catch {
          resolve([]);
        }
      });
    });
  } catch (err: any) {
    if (err.name === 'NoSuchKey' || err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return [];
    }
    console.error('Error al leer el índice público de R2:', err);
    return [];
  }
}

/**
 * Helper para escribir el índice de fotos públicas en R2.
 */
async function writePublicIndex(index: PublicIndexEntry[]): Promise<void> {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: 'public-index.json',
      Body: JSON.stringify(index, null, 2),
      ContentType: 'application/json',
    })
  );
}

/**
 * GET /
 * Primera ruta de prueba para verificar que el servidor está funcionando. Devuelve un mensaje simple en formato JSON.
 */
app.get('/', (_req: Request, res: Response) => {
  res.send({ message: 'ok' });
});

/**
 * GET /uploads
 * Devuelve los últimos 10 thumbnails del usuario autenticado subidos a R2, ordenados por fecha desc.
 */
app.get('/uploads', authMiddleware as any, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.sub;
  if (!userId) {
    res.status(401).json({ error: 'Usuario no identificado' });
    return;
  }

  try {
    // Listamos los objetos en el bucket de R2 con el prefijo del usuario
    const response = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: `thumbnails/${userId}/`,
      }),
    );

    // Leer el índice público para saber cuáles de estas imágenes son públicas
    const publicIndex = await readPublicIndex();
    const publicKeys = new Set(
      publicIndex.filter((p) => p.userId === userId).map((p) => p.key)
    );

    const items: ThumbnailItem[] = (response.Contents ?? [])
      .filter((obj) => obj.Key !== `thumbnails/${userId}/`)
      .sort(
        (a, b) =>
          (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0),
      )
      .slice(0, 10)
      .map((obj) => {
        const keyWithPrefix = obj.Key ?? '';
        const parts = keyWithPrefix.split('/');
        const filename = parts[parts.length - 1] ?? '';
        const uuid = filename.replace('-thumb.jpg', '');

        return {
          key: uuid,
          thumbnailUrl: `${R2_PUBLIC_URL}/thumbnails/${userId}/${uuid}-thumb.jpg`,
          processedUrl: `${R2_PUBLIC_URL}/processed/${userId}/${uuid}.jpg`,
          uploadedAt: obj.LastModified?.toISOString() ?? '',
          isPublic: publicKeys.has(uuid),
        };
      });

    res.json(items);
  } catch (err) {
    console.error('Error listando R2 para el usuario:', err);
    res.status(500).json({ error: 'Error al obtener imágenes' });
  }
});

/**
 * GET /uploads/public
 * Devuelve la lista de fotos públicas de todos los usuarios.
 */
app.get('/uploads/public', async (_req: Request, res: Response) => {
  try {
    const publicIndex = await readPublicIndex();
    // Devolvemos el índice ordenado por fecha de publicación descendente
    const sorted = [...publicIndex].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
    res.json(sorted);
  } catch (err) {
    console.error('Error al listar fotos públicas:', err);
    res.status(500).json({ error: 'Error al obtener fotos públicas' });
  }
});

/**
 * POST /upload
 * Recibe una imagen (multipart/form-data, campo "image"),
 * invoca la Lambda de forma síncrona pasando el userId del JWT,
 * y devuelve el resultado con las URLs públicas en Cloudflare R2.
 */
app.post(
  '/upload',
  authMiddleware as any,
  upload.single('image'),
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.sub;
    if (!userId) {
      res.status(401).json({ error: 'Usuario no identificado' });
      return;
    }

    if (!req.file) {
      res
        .status(400)
        .json({ error: 'No se recibió ninguna imagen (campo: image)' });
      return;
    }

    /**
     * Pre-comprimir la imagen antes de enviar a Lambda.
     */
    const preCompressed = await sharp(req.file.buffer)
      .rotate()
      .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    const payload: ImageUploadPayload = {
      imageBase64: preCompressed.toString('base64'),
      filename: req.file.originalname,
      mimetype: 'image/jpeg',
      userId: userId,
    };

    try {
      const command = new InvokeCommand({
        FunctionName: process.env['LAMBDA_FUNCTION_NAME'] ?? 'image-processor',
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify(payload),
      });

      const response = await lambdaClient.send(command);

      if (!response.Payload) {
        res.status(502).json({ error: 'La Lambda no devolvió respuesta' });
        return;
      }

      const rawPayload = Buffer.from(response.Payload).toString('utf-8');

      if (response.FunctionError) {
        const lambdaError = JSON.parse(rawPayload) as {
          errorMessage?: string;
          errorType?: string;
        };
        console.error('Lambda function error:', lambdaError);
        res.status(502).json({
          error: 'Error en Lambda',
          detail: lambdaError.errorMessage ?? 'Error desconocido',
        });
        return;
      }

      const lambdaResponse: LambdaResponse = JSON.parse(rawPayload);

      if (lambdaResponse.statusCode === 200 && 'originalKey' in lambdaResponse.body) {
        const bodyWithPublic = {
          ...lambdaResponse.body,
          isPublic: false,
        };
        res.status(lambdaResponse.statusCode).json(bodyWithPublic);
      } else {
        res.status(lambdaResponse.statusCode).json(lambdaResponse.body);
      }
    } catch (err) {
      console.error('Error invocando Lambda:', err);
      res.status(500).json({ error: 'Error al procesar la imagen' });
    }
  },
);

/**
 * PATCH /uploads/:key/visibility
 * Modifica si una foto del usuario autenticado es pública o no.
 */
app.patch(
  '/uploads/:key/visibility',
  authMiddleware as any,
  async (req: AuthRequest, res: Response) => {
    const { key } = req.params;
    const userId = req.user?.sub;
    const ownerName = req.user?.name || req.user?.email || 'Usuario';
    const { isPublic } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Usuario no identificado' });
      return;
    }

    if (typeof isPublic !== 'boolean') {
      res.status(400).json({ error: 'Falta o es inválido el parámetro isPublic en el body' });
      return;
    }

    try {
      const publicIndex = await readPublicIndex();
      const alreadyPublicIndex = publicIndex.findIndex(
        (item) => item.key === key && item.userId === userId
      );

      if (isPublic && alreadyPublicIndex === -1) {
        // Agregar al índice de fotos públicas
        const newEntry: PublicIndexEntry = {
          userId,
          ownerName,
          key,
          thumbnailUrl: `${R2_PUBLIC_URL}/thumbnails/${userId}/${key}-thumb.jpg`,
          processedUrl: `${R2_PUBLIC_URL}/processed/${userId}/${key}.jpg`,
          publishedAt: new Date().toISOString(),
        };
        publicIndex.push(newEntry);
        await writePublicIndex(publicIndex);
      } else if (!isPublic && alreadyPublicIndex !== -1) {
        // Quitar del índice de fotos públicas
        publicIndex.splice(alreadyPublicIndex, 1);
        await writePublicIndex(publicIndex);
      }

      res.json({ success: true, key, isPublic });
    } catch (err) {
      console.error('Error al cambiar visibilidad de imagen:', err);
      res.status(500).json({ error: 'Error al actualizar visibilidad' });
    }
  }
);

/**
 * DELETE /uploads/:key
 * Elimina del bucket R2 los objetos asociados al UUID bajo el prefijo del usuario
 * y los remueve del índice público si aplica.
 */
app.delete('/uploads/:key', authMiddleware as any, async (req: AuthRequest, res: Response) => {
  const { key } = req.params;
  const userId = req.user?.sub;

  if (!userId) {
    res.status(401).json({ error: 'Usuario no identificado' });
    return;
  }

  if (!key || key.trim() === '') {
    res.status(400).json({ error: 'Falta el parámetro key' });
    return;
  }

  try {
    await r2Client.send(
      new DeleteObjectsCommand({
        Bucket: R2_BUCKET_NAME,
        Delete: {
          Objects: [
            { Key: `thumbnails/${userId}/${key}-thumb.jpg` },
            { Key: `processed/${userId}/${key}.jpg` },
          ],
          Quiet: true,
        },
      }),
    );

    // Eliminar también del índice público si estuviera allí
    const publicIndex = await readPublicIndex();
    const updatedIndex = publicIndex.filter(
      (item) => !(item.key === key && item.userId === userId)
    );
    if (publicIndex.length !== updatedIndex.length) {
      await writePublicIndex(updatedIndex);
    }

    res.json({ deleted: key });
  } catch (err) {
    console.error('Error eliminando objetos en R2:', err);
    res.status(500).json({ error: 'Error al eliminar la imagen' });
  }
});

app.listen(port, () => {
  console.log(`[ ready ] http://${host}:${port}`);
});
