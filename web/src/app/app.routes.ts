import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./upload/upload-image').then((c) => c.UploadImage),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
