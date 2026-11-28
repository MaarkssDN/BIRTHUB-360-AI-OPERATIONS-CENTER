import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'node:test';

const FIXTURE = path.resolve('test/fixtures/b360-aoc-db.synthetic.json');

export function bindSyntheticDatabase(): {
  dir: () => string;
  dbPath: () => string;
} {
  let tmpDir: string | undefined;
  const originalDbPath = process.env.B360_AOC_DB_PATH;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'b360-aoc-'));
    const dbPath = path.join(tmpDir, 'b360-aoc-db.json');
    await fs.copyFile(FIXTURE, dbPath);
    process.env.B360_AOC_DB_PATH = dbPath;
  });

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
    if (originalDbPath === undefined) {
      delete process.env.B360_AOC_DB_PATH;
    } else {
      process.env.B360_AOC_DB_PATH = originalDbPath;
    }
  });

  return {
    dir: () => {
      if (!tmpDir) {
        throw new Error('diretório temporário ausente');
      }
      return tmpDir;
    },
    dbPath: () => {
      const configured = process.env.B360_AOC_DB_PATH;
      if (!configured) {
        throw new Error('B360_AOC_DB_PATH ausente');
      }
      return configured;
    },
  };
}
