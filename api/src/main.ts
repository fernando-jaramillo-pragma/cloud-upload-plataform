import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import sharp from 'sharp';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import type {
  ImageUploadPayload,
  LambdaResponse,
  ThumbnailItem,
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
 *
 * Multer es un middleware de Express para manejar multipart/form-data, que es el tipo de contenido que se usa para subir archivos desde formularios HTML o desde el frontend. En este caso, configuramos Multer para almacenar los archivos en memoria (en un buffer) y no en el sistema de archivos del servidor, ya que luego los enviaremos directamente a la Lambda sin necesidad de guardarlos localmente.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_MAX_SIZE_MB * 1024 * 1024 },
});

/**
 * Configuración del cliente Lambda de AWS SDK v3.
 * Usamos las credenciales y región por defecto (p.ej., desde variables de entorno o roles de IAM si se ejecuta en AWS).
 * Este cliente se usará para invocar la función Lambda que procesa las imágenes.
 */
const lambdaClient = new LambdaClient({
  region: process.env['AWS_REGION'] ?? 'us-east-1',
});

/**
 * Configuración del cliente R2 de Cloudflare (misma API que S3).
 * Usamos las credenciales y endpoint de R2 para listar y acceder a los objetos.
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
 * GET /
 * Primera ruta de prueba para verificar que el servidor está funcionando. Devuelve un mensaje simple en formato JSON.
 */
app.get('/', (_req: Request, res: Response) => {
  res.send({ message: 'ok' });
});

/**
 * GET /uploads
 * Devuelve los últimos 10 thumbnails subidos a R2, ordenados por fecha desc.
 */
app.get('/uploads', async (_req: Request, res: Response) => {
  try {
    // Listamos los objetos en el bucket de R2 con el prefijo "thumbnails/" para obtener solo los thumbnails generados por la Lambda
    // ListObjectsV2 responde con maximo 1000 objetos, en orden alfabético por clave.
    const response = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: 'thumbnails/',
      }),
    );

    // Procesamos la respuesta para extraer la información relevante de cada thumbnail y construir las URLs públicas tanto del thumbnail como de la imagen procesada correspondiente. También ordenamos por fecha de subida (LastModified) y limitamos a los últimos 10 items.
    const items: ThumbnailItem[] = (response.Contents ?? [])
      .filter((obj) => obj.Key !== 'thumbnails/')
      .sort(
        (a, b) =>
          (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0),
      )
      .slice(0, 10)
      .map((obj) => {
        // Obtenemos el UUID a partir del nombre del objeto, asumiendo que sigue el formato "thumbnails/{uuid}-thumb.jpg". Esto nos permite construir las URLs tanto del thumbnail como de la imagen procesada correspondiente.
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

    /**
     * Pre-comprimir la imagen antes de enviar a Lambda.
     * Lambda tiene un límite de 6MB para invocaciones síncronas.
     * Reducimos a max 2000px y JPEG q85 para que el payload base64 quede bajo ~4MB.
     */
    const preCompressed = await sharp(req.file.buffer)
      .rotate() // corrige orientación EXIF (fotos iPhone rotadas)
      .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    /**
     * Construimos el payload que se enviará a la Lambda. La Lambda espera un objeto con la imagen en base64, el nombre original del archivo y su tipo MIME. Convertimos el buffer de la imagen a una cadena base64 para incluirlo en el payload JSON.
     */
    const payload: ImageUploadPayload = {
      imageBase64: preCompressed.toString('base64'),
      filename: req.file.originalname,
      mimetype: 'image/jpeg',
    };

    try {
      /**
       * Invocamos la función Lambda de forma síncrona usando el cliente Lambda de AWS SDK v3. 
       * Especificamos el nombre de la función (desde variable de entorno o valor por defecto),
       *  el tipo de invocación "RequestResponse" para esperar la respuesta, y 
       * el payload JSON con la imagen. 

       */
      const command = new InvokeCommand({
        FunctionName: process.env['LAMBDA_FUNCTION_NAME'] ?? 'image-processor',
        InvocationType: 'RequestResponse', // Invocación síncrona — espera la respuesta
        Payload: JSON.stringify(payload),
      });

      const response = await lambdaClient.send(command);

      // La respuesta de Lambda siempre tendrá un campo Payload, aunque la función haya lanzado un error. Si Payload está vacío, es un indicio de que algo salió mal en la invocación (p.ej., función no encontrada, permisos, etc.), por lo que respondemos con un error 502. Revisar en AWS CloudWatch Logs la función Lambda para más detalles sobre el error.
      if (!response.Payload) {
        res.status(502).json({ error: 'La Lambda no devolvió respuesta' });
        return;
      }

      // Convertimos el payload de la respuesta de Lambda de un buffer a una cadena UTF-8. Luego, si la función Lambda lanzó un error (indicado por el campo FunctionError), parseamos el mensaje de error y respondemos con un error 502 al cliente.
      // Si no hubo error, parseamos la respuesta JSON esperada de la Lambda (que debe incluir las URLs públicas del thumbnail y la imagen procesada) y la devolvemos al cliente con un status 200.
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

      // Parseamos la respuesta de la Lambda, que debe tener el formato definido en LambdaResponse (con statusCode y body). Luego respondemos al cliente con el statusCode y el body devuelto por la Lambda.
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
