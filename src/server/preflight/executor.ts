import { execFileSync } from 'node:child_process';
import { assertAuthenticatedContext, type AuthContext } from '../auth/requireAuth.ts';
import type { KillSwitchControl } from '../auth/killSwitch.ts';
import { resourceKeys, verifyLocalEvidence, type LocalEvidenceSpec, type EvidenceLeaseStore } from './evidence.ts';

export interface ProbeResult {
  readonly status: 'PASS' | 'BLOQUEADO';
  readonly head?: string;
}
/** Concrete executor for a single read-only Git probe, no arbitrary command,
 * shell, filesystem mutation or provider activation. Real mission execution
 * remains unavailable until OS sandbox and fenced resource lifecycle exist. */
export async function executeVerifiedProbe(
  auth: AuthContext, spec: LocalEvidenceSpec, leases: EvidenceLeaseStore,
  stop: KillSwitchControl, trustedRunnerId: string,
): Promise<ProbeResult> {
  try {
    assertAuthenticatedContext(auth);
    if (auth.actorKind !== 'runner' || auth.role !== 'operator' ||
        auth.userId !== spec.owner || trustedRunnerId !== spec.runnerId || stop.isEnabled()) return { status: 'BLOQUEADO' };
    const verified = await verifyLocalEvidence(spec, leases, () => ({
      owner: auth.userId, runnerId: trustedRunnerId, pid: process.pid,
    }));
    if (verified.status !== 'PASS' || stop.isEnabled() ||
        !leases.verify(spec.leaseId, { owner: auth.userId, sha: spec.headSha, resources: resourceKeys(spec) })) {
      return { status: 'BLOQUEADO' };
    }
    const head = execFileSync('git', ['-C', spec.worktree, 'rev-parse', 'HEAD'], {
      encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (head !== spec.headSha || stop.isEnabled() ||
        !leases.verify(spec.leaseId, { owner: auth.userId, sha: head, resources: resourceKeys(spec) })) {
      return { status: 'BLOQUEADO' };
    }
    return { status: 'PASS', head };
  } catch { return { status: 'BLOQUEADO' }; }
}
