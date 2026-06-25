import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Interceptor funcional que inyecta automáticamente el token de acceso de Cognito
 * en las cabeceras de todas las solicitudes HTTP salientes.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('auth_id_token');

  if (token) {
    const cloned = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
    return next(cloned);
  }

  return next(req);
};
