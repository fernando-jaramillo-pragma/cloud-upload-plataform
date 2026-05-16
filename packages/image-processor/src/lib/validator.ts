import sharp from 'sharp';

const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PIXELS = 25_000_000; // 25 MP — cubre iPhone 12/13/14/15 y cámaras Android modernas

export interface ValidationResult {
  valid: boolean;
  error?: string;
  metadata?: sharp.Metadata;
}

/**
 * Valida que la imagen tenga un formato permitido y no exceda el límite de píxeles.
 */
export async function validateImage(
  buffer: Buffer,
  mimetype: string,
): Promise<ValidationResult> {
  if (!ALLOWED_MIMETYPES.includes(mimetype)) {
    return {
      valid: false,
      error: `Tipo no permitido: ${mimetype}. Permitidos: ${ALLOWED_MIMETYPES.join(', ')}`,
    };
  }

  try {
    const metadata = await sharp(buffer).metadata();
    const pixels = (metadata.width ?? 0) * (metadata.height ?? 0);

    if (pixels > MAX_PIXELS) {
      return {
        valid: false,
        error: `Imagen muy grande: ${pixels.toLocaleString()} píxeles (máx. ${MAX_PIXELS.toLocaleString()})`,
      };
    }

    return { valid: true, metadata };
  } catch {
    return {
      valid: false,
      error: 'No se pudo leer la imagen. Archivo corrupto o formato inválido.',
    };
  }
}
