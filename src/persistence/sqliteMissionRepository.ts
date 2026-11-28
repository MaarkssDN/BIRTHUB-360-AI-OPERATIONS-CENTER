import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { acquireFileLock } from '../server/fileLock.ts';
import { openLocalSqlite } from '../db/migrate.ts';
import type { AuthContext } from '../auth/context.ts';
import {
  assertMissionTitle,
  assertWork,
  RepositoryError,
  requireRepositoryAuth,
  type MissionRepository,
  type MissionUnitOfWork,
  type MissionView,
} from './missionRepository.ts';

/**
 * Adapter SQLite. `write` é uma transação `BEGIN IMMEDIATE`: se o trabalho
 * lança, faz rollback. A trava de arquivo marca o banco como em uso enquanto
 * a conexão está aberta. O SQL recebe somente o tenant do contexto autenticado.
 */
export class SqliteMissionRepository implements MissionRepository {
  private closed = false;

  private constructor(
    private readonly db: DatabaseSync,
    private readonly releaseLock: () => void,
  ) {}

  static open(filename: string): SqliteMissionRepository {
    const resolved = path.resolve(filename);
    const releaseLock = acquireFileLock(`${resolved}.lock`);
    try {
      const db = openLocalSqlite(resolved);
      db.exec('PRAGMA busy_timeout = 0;');
      const missions = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Missions'")
        .get();
      if (!missions) {
        throw new RepositoryError('Schema ausente. Rode npm run migrate:local antes.');
      }
      return new SqliteMissionRepository(db, releaseLock);
    } catch (error) {
      releaseLock();
      throw error;
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.db.close();
    this.releaseLock();
  }

  read<T>(auth: AuthContext, work: (unitOfWork: MissionUnitOfWork) => T): T {
    this.assertOpen();
    const verified = requireRepositoryAuth(auth, 'read');
    return this.transaction('DEFERRED', verified.tenantId, assertWork(work));
  }

  write<T>(auth: AuthContext, work: (unitOfWork: MissionUnitOfWork) => T): T {
    this.assertOpen();
    const verified = requireRepositoryAuth(auth, 'write');
    return this.transaction('IMMEDIATE', verified.tenantId, assertWork(work));
  }

  private transaction<T>(
    mode: 'DEFERRED' | 'IMMEDIATE',
    tenantId: string,
    work: (unitOfWork: MissionUnitOfWork) => T,
  ): T {
    this.db.exec(`BEGIN ${mode}`);
    try {
      const result = work(this.unitOfWork(tenantId));
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // a transação pode já ter sido desfeita pelo SQLite
      }
      throw error;
    }
  }

  private unitOfWork(tenantId: string): MissionUnitOfWork {
    return {
      getMission: (id: string): MissionView | null => {
        const row = this.db.prepare('SELECT id, title FROM Missions WHERE id = ? AND tenant_id = ?').get(id, tenantId);
        if (!row) {
          return null;
        }
        return { id: String(row.id), title: String(row.title) };
      },
      setMissionTitle: (id: string, title: string): void => {
        assertMissionTitle(id, title);
        const updatedAt = new Date().toISOString();
        const result = this.db
          .prepare('UPDATE Missions SET title = ?, updated_at = ? WHERE id = ? AND tenant_id = ?')
          .run(title, updatedAt, id, tenantId);
        if (Number(result.changes) === 0) {
          throw new RepositoryError(`Missão ${id} não existe.`);
        }
      },
    };
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new RepositoryError('O repositório SQLite já foi fechado.');
    }
  }
}
