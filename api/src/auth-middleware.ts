import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';

export interface AuthRequest extends Request {
  user?: {
    sub: string;
    email: string;
    name: string;
  };
}

const COGNITO_REGION = process.env['COGNITO_REGION'] ?? 'us-east-1';
const COGNITO_USER_POOL_ID = process.env['COGNITO_USER_POOL_ID'];

const jwksUri = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}/.well-known/jwks.json`;

const client = jwksRsa({
  jwksUri,
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  if (!header.kid) {
    callback(new Error('Falta el kid en el header del token'));
    return;
  }
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No autorizado. Falta el token de autorización.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  if (!COGNITO_USER_POOL_ID) {
    // Si no está configurada la variable en desarrollo local, podemos simular la validación o error.
    // Pero es mejor lanzar error para que se configure correctamente,
    // o decodificar el token sin verificar la firma si estamos en un modo local sin Cognito real configurado
    // (sin embargo, el plan asume que usaremos verificación JWT real).
    console.error('Falta la variable COGNITO_USER_POOL_ID.');
    res.status(500).json({ error: 'Configuración de servidor incompleta.' });
    return;
  }

  jwt.verify(
    token,
    getKey,
    {
      issuer: `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`,
      algorithms: ['RS256'],
    },
    (err, decoded) => {
      if (err || !decoded) {
        console.error('Error al verificar el JWT de Cognito:', err);
        res.status(401).json({ error: 'Token inválido o expirado.' });
        return;
      }

      const payload = decoded as jwt.JwtPayload;
      req.user = {
        sub: payload.sub ?? '',
        email: payload.email ?? '',
        name: payload.name ?? payload.username ?? payload.email ?? 'Usuario',
      };
      next();
    }
  );
}
