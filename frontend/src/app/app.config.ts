import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { hopAuthInterceptor, HOP_LOGO_SRC } from '@heretto/hop-ui';

import { routes } from './app.routes';
import { notificationInterceptor } from './core/interceptors/notification.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(withInterceptors([hopAuthInterceptor, notificationInterceptor])),
    { provide: HOP_LOGO_SRC, useValue: 'assets/heretto_open_projects.png' },
  ],
};
