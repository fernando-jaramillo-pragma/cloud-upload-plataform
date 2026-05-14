import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import type {
  ImageUploadPayload,
  LambdaResponse,
  ThumbnailItem,
} from '@org/models';

const host = process.env['HOST'] ?? 'localhost';
const port = process.env['PORT'] ? Number(process.env['PORT']) : 3000;

const R2_ACCOUNT_ID = process.env['R2_ACCOUNT_ID'] ?? '';
const R2_ACCESS_KEY_ID = process.env['R2_ACCESS_KEY_ID'] ?? '';
const R2_SECRET_ACCESS_KEY = process.env['R2_SECRET_ACCESS_KEY'] ?? '';
const R2_BUCKET_NAME = process.env['R2_BUCKET_NAME'] ?? '';
const R2_PUBLIC_URL = process.env['R2_PUBLIC_URL'] ?? '';

const UPLOAD_MAX_SIZE_MB = Number(process.env['UPLOAD_MAX_SIZE_MB'] ?? 5);

const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_MAX_SIZE_MB * 1024 * 1024 },
});

const lambdaClient = new LambdaClient({
  region: process.env['AWS_REGION'] ?? 'us-east-1',
});

// Cliente R2 para listar objetos — misma API de S3, endpoint de Cloudflare
const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

app.get('/', (_req: Request, res: Response) => {
  res.send({ message: 'Hello API' });
});

/**
 * GET /uploads
 * Devuelve los últimos 10 thumbnails subidos a R2, ordenados por fecha desc.
 */
app.get('/uploads', async (_req: Request, res: Response) => {
  try {
    const response = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: 'thumbnails/',
      }),
    );

    const items: ThumbnailItem[] = (response.Contents ?? [])
      .filter((obj) => obj.Key !== 'thumbnails/')
      .sort(
        (a, b) =>
          (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0),
      )
      .slice(0, 10)
      .map((obj) => {
        // thumbnails/{uuid}-thumb.jpg → processed/{uuid}.jpg
        const uuid = (obj.Key ?? '')
          .replace('thumbnails/', '')
          .replace('-thumb.jpg', '');
        return {
          thumbnailUrl: `${R2_PUBLIC_URL}/thumbnails/${uuid}-thumb.jpg`,
          processedUrl: `${R2_PUBLIC_URL}/processed/${uuid}.jpg`,
          uploadedAt: obj.LastModified?.toISOString() ?? '',
        };
      });

    res.json(items);
  } catch (err) {
    console.error('Error listando R2:', err);
    res.status(500).json({ error: 'Error al obtener imágenes' });
  }
});

/**
 * POST /upload
 *
 * Recibe una imagen (multipart/form-data, campo "image"),
 * invoca la Lambda image-processor de forma síncrona (RequestResponse),
 * y devuelve el resultado con las URLs públicas en Cloudflare R2.
 */
app.post(
  '/upload',
  upload.single('image'),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res
        .status(400)
        .json({ error: 'No se recibió ninguna imagen (campo: image)' });
      return;
    }

    const payload: ImageUploadPayload = {
      imageBase64: req.file.buffer.toString('base64'),
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
    };

    try {
      const command = new InvokeCommand({
        FunctionName: process.env['LAMBDA_FUNCTION_NAME'] ?? 'image-processor',
        InvocationType: 'RequestResponse', // Invocación síncrona — espera la respuesta
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

      res.status(lambdaResponse.statusCode).json(lambdaResponse.body);
    } catch (err) {
      console.error('Error invocando Lambda:', err);
      res.status(500).json({ error: 'Error al procesar la imagen' });
    }
  },
);

app.listen(port, () => {
  console.log(`[ ready ] http://${host}:${port}`);
});
