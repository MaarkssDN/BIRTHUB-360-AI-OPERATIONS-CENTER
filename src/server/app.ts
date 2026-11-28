import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import {
  HealthResponseSchema,
  ReadyResponseSchema,
  type ReadyResponse,
} from '../shared/contracts.ts';
import { loadDatabase } from './db.ts';

export type CreateAppOptions = {
  vite?: boolean;
  clientDir?: string;
};

function httpStatus(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = error.status;
    if (typeof status === 'number' && status >= 400 && status <= 599) {
      return status;
    }
  }
  return 500;
}

function attachClient(app: Express, clientDir: string): void {
  app.use(express.static(clientDir));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api/')) {
      next();
      return;
    }
    res.sendFile(path.join(clientDir, 'index.html'), (error) => {
      if (error) {
        next(error);
      }
    });
  });
}

function sendReady(res: Response): void {
  try {
    const state = loadDatabase();
    const body: ReadyResponse = {
      status: 'ready',
      schemaVersion: state.schemaVersion,
      seed: state.seed,
    };
    res.json(ReadyResponseSchema.parse(body));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'banco indisponível';
    const body: ReadyResponse = { status: 'not-ready', error: message };
    res.status(503).json(ReadyResponseSchema.parse(body));
  }
}

export async function createApp(options: CreateAppOptions = {}): Promise<Express> {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (_req, res) => {
    res.json(
      HealthResponseSchema.parse({
        status: 'ok',
        service: 'b360-aoc',
        persistence: 'fail-closed',
      }),
    );
  });

  app.get('/api/ready', (_req, res) => {
    sendReady(res);
  });

  if (options.vite === true) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (options.clientDir !== undefined) {
    attachClient(app, options.clientDir);
  } else if (process.env.NODE_ENV === 'production') {
    attachClient(app, path.resolve(process.cwd(), 'dist', 'client'));
  }

  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    res.status(httpStatus(error)).json({ status: 'error' });
  });

  return app;
}
