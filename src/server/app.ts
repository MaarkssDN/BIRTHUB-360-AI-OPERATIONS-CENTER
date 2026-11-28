import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { ViteDevServer } from 'vite';
import path from 'node:path';
import {
  HealthResponseSchema,
  ReadyResponseSchema,
  type ReadyResponse,
} from '../shared/contracts.ts';
import { isApiPath } from './auth/matrix.ts';
import { mountApi } from './auth/routes.ts';
import { createAppSecurity, type AppSecurity } from './auth/security.ts';
import { loadDatabase } from './db.ts';
import { assertPreflightBirthClosed } from './preflight/flags.ts';

export type CreateAppOptions = {
  vite?: boolean;
  clientDir?: string;
  security?: AppSecurity;
};

export type RunningApp = Express & {
  closeEmbeddedServers: () => Promise<void>;
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

function safeErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = error.code;
  if (typeof code !== 'string' || !/^[a-z][a-z0-9_]*$/.test(code)) return undefined;
  return code;
}

function attachClient(app: Express, clientDir: string): void {
  app.use(express.static(clientDir));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || isApiPath(req.path)) {
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

/** A resposta pública não carrega caminho de arquivo, mesmo que a exceção traga um. */
function readyErrorMessage(error: unknown): string {
  const fallback = 'Falha ao ler o banco. Carga fail-closed: nada foi semeado.';
  const message = error instanceof Error ? error.message : 'banco indisponível';
  if (message.length === 0 || hasFilesystemPath(message)) return fallback;
  return message;
}

function hasFilesystemPath(message: string): boolean {
  if (message.includes('\\') || /[A-Za-z]:\//.test(message)) return true;
  return /(?:^|[\s"'`(])\/(?:[A-Za-z0-9._-]+\/)+/.test(message);
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
    const body: ReadyResponse = { status: 'not-ready', error: readyErrorMessage(error) };
    res.status(503).json(ReadyResponseSchema.parse(body));
  }
}

export async function createApp(options: CreateAppOptions = {}): Promise<RunningApp> {
  assertPreflightBirthClosed();
  if (process.env.NODE_ENV === 'production' && !options.security) {
    throw new Error('Produção exige armazenamento de segurança explícito.');
  }
  const security = options.security ?? createAppSecurity();
  const app = express();
  let embedded: ViteDevServer | undefined;
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  mountApi(app, security, {
    health: (_req, res) => {
      res.json(
        HealthResponseSchema.parse({
          status: 'ok',
          service: 'b360-aoc',
          persistence: 'fail-closed',
        }),
      );
    },
    ready: (_req, res) => {
      sendReady(res);
    },
  });

  if (options.vite === true) {
    const { createServer: createViteServer } = await import('vite');
    embedded = await createViteServer({
      server: {
        host: '127.0.0.1',
        middlewareMode: true,
        ws: { host: '127.0.0.1' },
      },
      appType: 'spa',
    });
    app.use(embedded.middlewares);
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
    const code = safeErrorCode(error);
    res.status(httpStatus(error)).json(code === undefined ? { status: 'error' } : { status: 'error', code });
  });

  return Object.assign(app, {
    closeEmbeddedServers: async () => {
      await embedded?.close();
    },
  });
}
