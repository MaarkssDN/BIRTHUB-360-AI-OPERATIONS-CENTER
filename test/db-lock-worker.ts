import { loadDatabase, saveDatabase, withDatabaseLock } from '../src/server/db.ts';

const marker = process.env.B360_LOCK_MARKER;
if (marker !== undefined) {
  if (marker.trim() === '') {
    process.stderr.write('marcador da trava ausente\n');
    process.exit(2);
  }
  const rounds = Number(process.env.B360_LOCK_ROUNDS ?? '1');
  const timeoutMs = Number(process.env.B360_LOCK_TIMEOUT_MS ?? '5000');
  if (!Number.isInteger(rounds) || rounds < 1) {
    process.stderr.write('rodadas inválidas\n');
    process.exit(2);
  }
  try {
    for (let index = 0; index < rounds; index += 1) {
      withDatabaseLock(() => {
        const state = loadDatabase();
        const mission = state.missions[0];
        if (!mission) {
          throw new Error('missão sintética ausente');
        }
        saveDatabase({
          ...state,
          missions: [{ ...mission, title: `${mission.title}|${marker}` }],
        });
      }, { timeoutMs });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'falha na trava';
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}
