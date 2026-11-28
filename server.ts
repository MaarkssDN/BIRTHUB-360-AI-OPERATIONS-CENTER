import dotenv from 'dotenv';
import { createApp } from './src/server/app.ts';
import { resolveListenHost, resolveListenPort } from './src/server/listen.ts';

dotenv.config();

const host = resolveListenHost();
const port = resolveListenPort();
const app = await createApp({ vite: process.env.NODE_ENV !== 'production' });

app.listen(port, host, () => {
  console.log(`[B360-AOC] http://${host}:${port}`);
});
