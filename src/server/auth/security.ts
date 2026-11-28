import { MemoryAuditLog, type AuditSubject } from './auditLog.ts';
import { MemoryKillSwitch, type KillSwitchControl } from './killSwitch.ts';
import { type AuthContext } from './requireAuth.ts';
import { MemorySessionStore, type SessionStore } from './sessionStore.ts';

export interface AuditLog {
  create(auth: AuthContext): AuditSubject;
  readOwn(id: string, auth: AuthContext): AuditSubject;
  approve(id: string, auth: AuthContext): AuditSubject;
}

export type AppSecurity = {
  readonly sessions: SessionStore;
  readonly now: () => number;
  readonly killSwitch: KillSwitchControl;
  readonly audits: AuditLog;
};

export function createAppSecurity(partial: Partial<AppSecurity> = {}): AppSecurity {
  const now = partial.now ?? Date.now;
  return {
    now,
    sessions: partial.sessions ?? new MemorySessionStore({ now }),
    killSwitch: partial.killSwitch ?? new MemoryKillSwitch(),
    audits: partial.audits ?? new MemoryAuditLog(),
  };
}
