import { seedDatabaseFromFixture } from '../src/server/seed.ts';

const overwrite = process.argv.includes('--overwrite');

try {
  const written = seedDatabaseFromFixture(undefined, { overwrite });
  console.log(`[B360-AOC] seed sintético gravado em ${written}`);
} catch (error) {
  const message = error instanceof Error ? error.message : 'seed falhou';
  console.error(`[B360-AOC] ${message}`);
  process.exitCode = 1;
}
