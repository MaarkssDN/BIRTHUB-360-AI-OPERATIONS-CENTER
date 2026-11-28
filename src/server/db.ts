import fs from 'node:fs';
import path from 'node:path';
import { DatabaseStateSchema, type DatabaseState } from '../shared/contracts.ts';

const DEFAULT_RELATIVE_PATH = path.join('data', 'b360-aoc-db.json');

export class DatabaseUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseUnavailableError';
  }
}

/** Lê `B360_AOC_DB_PATH` a cada chamada. Padrão: `data/b360-aoc-db.json`. */
export function resolveDbFilePath(): string {
  const configured = process.env.B360_AOC_DB_PATH;
  if (typeof configured === 'string' && configured.trim() !== '') {
    return path.resolve(configured.trim());
  }
  return path.resolve(process.cwd(), DEFAULT_RELATIVE_PATH);
}

export function parseDatabaseState(raw: string): DatabaseState {
  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    throw new DatabaseUnavailableError(
      'JSON do banco inválido. Carga fail-closed: o arquivo não foi substituído nem semeado.',
    );
  }
  const parsed = DatabaseStateSchema.safeParse(json);
  if (!parsed.success) {
    throw new DatabaseUnavailableError(
      'Estado do banco rejeitado pelo contrato. Carga fail-closed: o arquivo não foi substituído nem semeado.',
    );
  }
  return parsed.data;
}

/**
 * Falha fechada. Se o arquivo ou o diretório pai não existir, lança erro
 * e não cria nem semeia nada.
 */
export function loadDatabase(): DatabaseState {
  const filePath = resolveDbFilePath();
  const parent = path.dirname(filePath);
  if (!fs.existsSync(parent)) {
    throw new DatabaseUnavailableError(
      'Diretório pai do banco não existe. Carga fail-closed: nada foi semeado.',
    );
  }
  if (!fs.existsSync(filePath)) {
    throw new DatabaseUnavailableError(
      'Arquivo do banco não existe. Carga fail-closed: nada foi semeado.',
    );
  }
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'leitura falhou';
    throw new DatabaseUnavailableError(
      `Falha ao ler o banco (${detail}). Carga fail-closed: nada foi semeado.`,
    );
  }
  return parseDatabaseState(raw);
}

/** Grava no caminho resolvido nesta chamada. Não cria o diretório pai. */
export function saveDatabase(state: DatabaseState): void {
  const parsed = DatabaseStateSchema.safeParse(state);
  if (!parsed.success) {
    throw new DatabaseUnavailableError(
      'Estado rejeitado pelo contrato. Gravação abortada; o arquivo existente não foi alterado.',
    );
  }
  const filePath = resolveDbFilePath();
  const parent = path.dirname(filePath);
  if (!fs.existsSync(parent)) {
    throw new DatabaseUnavailableError(
      'Diretório pai do banco não existe. Gravação abortada; nada foi criado.',
    );
  }
  const payload = `${JSON.stringify(parsed.data, null, 2)}\n`;
  const temporary = path.join(
    parent,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  fs.writeFileSync(temporary, payload, 'utf8');
  try {
    fs.renameSync(temporary, filePath);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}
