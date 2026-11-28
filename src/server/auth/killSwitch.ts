import type { RequestHandler } from 'express';
import { actorKindFromRole, type ActorKind } from './actor.ts';
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
    const actorKind = actorKindFromRole(actor.role);
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
