import { useCallback, useEffect, useState } from 'react';
import type { HealthResponse, ReadyResponse } from '../shared/contracts.ts';
import { describeHealth, describeReady } from './status.ts';
import { Badge } from './components/Badge.tsx';
import { Button } from './components/Button.tsx';

interface Probe {
  health: HealthResponse | null;
  ready: ReadyResponse | null;
  readyStatus: number;
  error: string | null;
}

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

export function HomeScreen() {
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

  return (
    <>
      <h1>Central de operações</h1>
      <p className="b360-lede">
        Superfície mínima do scaffold público. A sonda abaixo descreve o processo neste endereço.
        O centro, nesta página, continua demonstração.
      </p>
      <Badge />
      <dl className="b360-status">
        <div>
          <dt>Sonda de saúde</dt>
          <dd aria-live="polite">{healthText}</dd>
        </div>
        <div>
          <dt>Sonda de prontidão</dt>
          <dd aria-live="polite">{readyText}</dd>
        </div>
      </dl>
      <div className="b360-cluster">
        <Button
          onClick={() => {
            void refresh();
          }}
        >
          Atualizar
        </Button>
        <a href="/guia">Abrir o guia de componentes</a>
      </div>
    </>
  );
}
