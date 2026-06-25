import { Route } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { noAuthGuard } from './auth/no-auth.guard';

export const appRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./upload/upload-image').then((c) => c.UploadImage),
    canActivate: [authGuard],
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./auth/login/login').then((c) => c.Login),
    canActivate: [noAuthGuard],
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./auth/callback/auth-callback').then((c) => c.AuthCallback),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
