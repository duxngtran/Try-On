import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { apiRouter } from './routes/index.js';
import { createErrorHandler, notFoundHandler } from './middlewares/errorHandler.js';

export const JSON_BODY_LIMIT = '10kb'; // D-29

/**
 * @param {{ corsOrigin: string, isProduction?: boolean, logger?: Pick<Console, 'error'> }} options
 */
export function createApp({ corsOrigin, isProduction = false, logger }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: corsOrigin, allowedHeaders: ['Authorization', 'Content-Type'] }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use('/api', apiRouter);
  app.use(notFoundHandler);
  app.use(createErrorHandler({ isProduction, logger }));
  return app;
}
