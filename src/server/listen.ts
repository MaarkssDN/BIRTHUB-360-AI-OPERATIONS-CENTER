const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/** Recusa `0.0.0.0` e qualquer host que não seja loopback. */
export function resolveListenHost(): string {
  const raw = process.env.B360_AOC_HOST;
  const host = raw === undefined || raw.trim() === '' ? '127.0.0.1' : raw.trim();
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `Bind público recusado (${host}). Este scaffold escuta apenas em loopback.`,
    );
  }
  return host;
}

export function resolveListenPort(): number {
  const raw = process.env.B360_AOC_PORT;
  if (raw === undefined || raw.trim() === '') {
    return 3000;
  }
  const text = raw.trim();
  if (!/^\d+$/.test(text)) {
    throw new Error('B360_AOC_PORT inválida.');
  }
  const port = Number(text);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('B360_AOC_PORT inválida.');
  }
  return port;
}
