import fs from 'node:fs';
import path from 'node:path';
import { DatabaseUnavailableError, parseDatabaseState, resolveDbFilePath, saveDatabase } from './db.ts';

export const SYNTHETIC_FIXTURE_PATH = path.resolve(
  process.cwd(),
  'test',
  'fixtures',
  'b360-aoc-db.synthetic.json',
);

export type SeedOptions = {
  overwrite?: boolean;
};

/**
 * Comando explícito de seed. Cria o diretório pai e grava a fixture sintética.
 * Recusa sobrescrever um arquivo existente, a menos que `overwrite` seja true.
 * Com overwrite, o conteúdo anterior fica em `<arquivo>.bak`.
 */
export function seedDatabaseFromFixture(
  fixturePath = SYNTHETIC_FIXTURE_PATH,
  options: SeedOptions = {},
): string {
  const raw = fs.readFileSync(fixturePath, 'utf8');
  const state = parseDatabaseState(raw);
  const target = resolveDbFilePath();
  const exists = fs.existsSync(target);
  if (exists && options.overwrite !== true) {
    throw new DatabaseUnavailableError(
      'O banco já existe. O seed recusa sobrescrever sem a opção explícita overwrite.',
    );
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (exists && options.overwrite === true) {
    fs.copyFileSync(target, `${target}.bak`);
  }
  saveDatabase(state);
  return path.relative(process.cwd(), target);
}
