import { useCallback, useEffect, useState } from 'react';
import type { HealthResponse, ReadyResponse } from './shared/contracts.ts';
import { describeHealth, describeReady } from './ui/status.ts';

type Probe = {
  health: HealthResponse | null;
  ready: ReadyResponse | null;
  readyStatus: number;
  error: string | null;
};

const EMPTY_PROBE: Probe = {
  health: null,
  ready: null,
  readyStatus: 0,
  error: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isHealthResponse(value: unknown): value is HealthResponse {
  return (
    isRecord(value) &&
    value.status === 'ok' &&
    value.service === 'b360-aoc' &&
    value.persistence === 'fail-closed'
  );
}

function isReadyResponse(value: unknown): value is ReadyResponse {
  if (!isRecord(value)) {
    return false;
  }
  if (value.status !== 'ready' && value.status !== 'not-ready') {
    return false;
  }
  if (value.schemaVersion !== undefined && value.schemaVersion !== 1) {
    return false;
  }
  if (value.seed !== undefined && value.seed !== 'synthetic') {
    return false;
  }
  if (value.error !== undefined && typeof value.error !== 'string') {
    return false;
  }
  return true;
}

export default function App() {
  const [probe, setProbe] = useState<Probe>(EMPTY_PROBE);

  const refresh = useCallback(async () => {
    try {
      const healthResponse = await fetch('/api/health');
      if (!healthResponse.ok) {
        throw new Error(`health HTTP ${String(healthResponse.status)}`);
      }
      const health: unknown = await healthResponse.json();
      const readyResponse = await fetch('/api/ready');
      const ready: unknown = await readyResponse.json();
      if (!isHealthResponse(health) || !isReadyResponse(ready)) {
        throw new Error('resposta fora do contrato');
      }
      setProbe({
        health,
        ready,
        readyStatus: readyResponse.status,
        error: null,
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'falha ao consultar o servidor';
      setProbe({ ...EMPTY_PROBE, error: message });
    }
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => {
      window.clearTimeout(handle);
    };
  }, [refresh]);

  const healthText = describeHealth(probe.health, probe.error);
  const readyText = describeReady(probe.readyStatus, probe.ready, probe.error);
  const readyOk = probe.readyStatus === 200 && probe.ready?.status === 'ready';

  return (
    <div className="shell">
      <header className="topbar">
        <p className="mark">B360-AOC</p>
        <p className="meta">Scaffold público · loopback</p>
      </header>
      <main className="panel">
        <h1>Central de operações</h1>
        <p className="lede">
          Superfície mínima para os times seguintes. Nenhuma ponte local, nenhum dado real e
          nenhuma rota de mutação.
        </p>
        <dl className="status">
          <div>
            <dt>Saúde</dt>
            <dd>{healthText}</dd>
          </div>
          <div>
            <dt>Persistência</dt>
            <dd className={readyOk ? 'ok' : 'pending'}>{readyText}</dd>
          </div>
        </dl>
        <button type="button" onClick={() => void refresh()}>
          Atualizar
        </button>
      </main>
    </div>
  );
}
