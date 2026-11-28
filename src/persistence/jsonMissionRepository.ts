import { loadDatabase, saveDatabase, withDatabaseLock } from '../server/db.ts';
import type { DatabaseState } from '../shared/contracts.ts';
import {
  assertMissionTitle,
  assertWork,
  RepositoryError,
  requireRepositoryAuth,
  type MissionRepository,
  type MissionUnitOfWork,
  type MissionView,
} from './missionRepository.ts';
import type { AuthContext } from '../auth/context.ts';

/**
 * Adapter JSON. A gravação só acontece se a unidade de trabalho retorna.
 * O ciclo inteiro fica sob `withDatabaseLock`.
 */
export class JsonMissionRepository implements MissionRepository {
  static open(): JsonMissionRepository {
    return new JsonMissionRepository();
  }

  close(): void {
    // a trava do arquivo é por operação
  }

  read<T>(auth: AuthContext, work: (unitOfWork: MissionUnitOfWork) => T): T {
    const verified = requireRepositoryAuth(auth, 'read');
    const run = assertWork(work);
    return withDatabaseLock(() => run(unitOfWork(loadDatabase(), verified.tenantId)));
  }

  write<T>(auth: AuthContext, work: (unitOfWork: MissionUnitOfWork) => T): T {
    const verified = requireRepositoryAuth(auth, 'write');
    const run = assertWork(work);
    return withDatabaseLock(() => {
      const draft = structuredClone(loadDatabase());
      const result = run(unitOfWork(draft, verified.tenantId));
      saveDatabase(draft);
      return result;
    });
  }
}

function unitOfWork(state: DatabaseState, tenantId: string): MissionUnitOfWork {
  return {
    getMission(id: string): MissionView | null {
      const mission = state.missions.find((item) => item.id === id && item.tenantId === tenantId);
      if (!mission) {
        return null;
      }
      return { id: mission.id, title: mission.title };
    },
    setMissionTitle(id: string, title: string): void {
      assertMissionTitle(id, title);
      const index = state.missions.findIndex((item) => item.id === id && item.tenantId === tenantId);
      const current = state.missions[index];
      if (!current) {
        throw new RepositoryError(`Missão ${id} não existe.`);
      }
      const next = [...state.missions];
      next[index] = { ...current, title };
      state.missions = next;
    },
  };
}
