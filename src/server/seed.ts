import fs from 'node:fs';
import path from 'node:path';
import { parseDatabaseState, resolveDbFilePath, saveDatabase } from './db.ts';

export const SYNTHETIC_FIXTURE_PATH = path.resolve(
  process.cwd(),
  'test',
  'fixtures',
  'b360-aoc-db.synthetic.json',
);

/** Comando explícito de seed. Cria o diretório pai e grava a fixture sintética. */
export function seedDatabaseFromFixture(fixturePath = SYNTHETIC_FIXTURE_PATH): string {
  const raw = fs.readFileSync(fixturePath, 'utf8');
  const state = parseDatabaseState(raw);
  const target = resolveDbFilePath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  saveDatabase(state);
  return path.relative(process.cwd(), target);
}
