import { MemoryAuditLog } from './auditLog.ts';
import { MemoryKillSwitch, type KillSwitchControl } from './killSwitch.ts';
import { MemorySessionStore, type SessionStore } from './sessionStore.ts';

export type AppSecurity = {
  readonly sessions: SessionStore;
  readonly now: () => number;
  readonly killSwitch: KillSwitchControl;
  readonly audits: MemoryAuditLog;
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
