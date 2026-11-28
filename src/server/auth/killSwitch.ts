import type { RequestHandler } from 'express';
import { actorKindOf, type ActorKind } from './actor.ts';
import { AuthError, type AuthContext } from './requireAuth.ts';

/**
 * Freio de mutação. Nasce desligado. Memória do processo: reinício volta
 * ao estado desligado. O autor da mudança é o `userId` da sessão.
 */
export type KillSwitchView = {
  readonly enabled: boolean;
  readonly updatedBy: string | null;
  readonly actorKind: ActorKind | null;
};

export interface KillSwitchControl {
  isEnabled(): boolean;
  read(): KillSwitchView;
  setEnabled(enabled: boolean, actor: AuthContext): KillSwitchView;
}

export class MemoryKillSwitch implements KillSwitchControl {
  private enabled = false;
  private updatedBy: string | null = null;
  private actorKind: ActorKind | null = null;

  isEnabled(): boolean {
    return this.enabled;
  }

  read(): KillSwitchView {
    return {
      enabled: this.enabled,
      updatedBy: this.updatedBy,
      actorKind: this.actorKind,
    };
  }

  setEnabled(enabled: boolean, actor: AuthContext): KillSwitchView {
    const actorKind = actorKindOf(actor);
    if (actor.role !== 'admin' || actorKind !== 'humano') {
      throw new AuthError(403, 'forbidden', 'Papel insuficiente.');
    }
    this.enabled = enabled;
    this.updatedBy = actor.userId;
    this.actorKind = actorKind;
    return this.read();
  }
}

export function rejectMutationsWhenKilled(killSwitch: KillSwitchControl): RequestHandler {
  return (_req, _res, next) => {
    if (killSwitch.isEnabled()) {
      next(new AuthError(403, 'kill_switch', 'Kill switch ligado. Mutação recusada.'));
      return;
    }
    next();
  };
}

/** Store durável, provisionado explicitamente pelo operador. Sem linha válida,
 *  sem retomada: falha fechada. O objeto DB é injetado pelo bootstrap confiável. */
export class SqliteKillSwitch implements KillSwitchControl {
  constructor(private readonly db: import('node:sqlite').DatabaseSync) {}

  /** Executar somente no provisionamento autorizado, não em cada request. */
  static provision(db: import('node:sqlite').DatabaseSync): void {
    db.exec(`CREATE TABLE IF NOT EXISTS aoc_emergency_stop (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      updated_by TEXT
    ); INSERT OR IGNORE INTO aoc_emergency_stop(id, enabled) VALUES (1, 1);`);
  }

  read(): KillSwitchView {
    try {
      const row = this.db.prepare('SELECT enabled, updated_by FROM aoc_emergency_stop WHERE id = 1').get();
      if (!row || (row.enabled !== 0 && row.enabled !== 1)) throw new Error('estado inválido');
      if (row.enabled === 0 && (typeof row.updated_by !== 'string' || !row.updated_by.trim())) {
        throw new Error('retomada sem autor');
      }
      const updatedBy = typeof row.updated_by === 'string' ? row.updated_by : null;
      return { enabled: row.enabled === 1, updatedBy, actorKind: updatedBy ? 'humano' : null };
    } catch {
      return { enabled: true, updatedBy: null, actorKind: null };
    }
  }

  isEnabled(): boolean { return this.read().enabled; }

  setEnabled(enabled: boolean, actor: AuthContext): KillSwitchView {
    if (actor.role !== 'admin' || actorKindOf(actor) !== 'humano' || !actor.userId.trim()) {
      throw new AuthError(403, 'forbidden', 'Papel ou identidade insuficiente.');
    }
    try {
      const result = this.db.prepare('UPDATE aoc_emergency_stop SET enabled = ?, updated_by = ? WHERE id = 1')
        .run(enabled ? 1 : 0, actor.userId);
      if (Number(result.changes) !== 1) throw new Error('estado ausente');
    } catch {
      throw new AuthError(403, 'kill_switch', 'Armazenamento de suspensão indisponível.');
    }
    return this.read();
  }
}
