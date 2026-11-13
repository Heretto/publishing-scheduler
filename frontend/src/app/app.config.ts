import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { HOP_LOGIN_CONFIG, hopAuthInterceptor, provideHopUi } from '@heretto/hop-ui';

import { routes } from './app.routes';
import { notificationInterceptor } from './core/interceptors/notification.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withXhr(), withInterceptors([hopAuthInterceptor, notificationInterceptor])),
    provideHopUi(),
    {
      provide: HOP_LOGIN_CONFIG,
      useValue: {
        appName: 'Publishing Scheduler',
        subtitle: 'Automate Heretto CCMS publishing jobs.',
      },
    },
  ],
};
