import { seedDatabaseFromFixture } from '../src/server/seed.ts';

const written = seedDatabaseFromFixture();
console.log(`[B360-AOC] seed sintético gravado em ${written}`);
