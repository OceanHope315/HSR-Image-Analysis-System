import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.logLevel,
  enabled: !env.isTest,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'passwordHash',
      'token',
      '*.password',
      '*.passwordHash',
      '*.token',
    ],
    censor: '[REDACTED]',
  },
  base: env.isProduction ? undefined : { service: 'railway-security-backend' },
});
