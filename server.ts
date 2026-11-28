import dotenv from 'dotenv';
import { openDurableSecurity } from './src/server/auth/durableSecurity.ts';
import { createApp } from './src/server/app.ts';
import { resolveListenHost, resolveListenPort } from './src/server/listen.ts';

dotenv.config();

const host = resolveListenHost();
const port = resolveListenPort();
const production = process.env.NODE_ENV === 'production';
const durable = production ? openDurableSecurity(process.env.B360_AOC_SECURITY_DB_PATH) : undefined;
const app = await createApp({ vite: !production, ...(durable ? { security: durable.security } : {}) });

app.listen(port, host, () => {
  console.log(`[B360-AOC] http://${host}:${port}`);
});
