import { JsonMissionRepository } from '../src/persistence/jsonMissionRepository.ts';

const marker = process.env.B360_REPO_MARKER;
if (marker !== undefined) {
  if (marker.trim() === '') {
    process.stderr.write('marcador do repositório ausente\n');
    process.exit(2);
  }
  const rounds = Number(process.env.B360_REPO_ROUNDS ?? '1');
  if (!Number.isInteger(rounds) || rounds < 1) {
    process.stderr.write('rodadas inválidas\n');
    process.exit(2);
  }
  const repo = JsonMissionRepository.open();
  try {
    const auth = {
      userId: 'user-synthetic',
      tenantId: 'tenant-a.example',
      role: 'operator' as const,
      sessionId: 'session-synthetic',
    };
    for (let round = 0; round < rounds; round += 1) {
      repo.write(auth, (unitOfWork) => {
        const mission = unitOfWork.getMission('MSN-SYNTHETIC-001');
        if (!mission) {
          throw new Error('missão sintética ausente');
        }
        unitOfWork.setMissionTitle('MSN-SYNTHETIC-001', `${mission.title}|${marker}`);
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'falha no repositório';
    process.stderr.write(`${message}\n`);
    process.exit(1);
  } finally {
    repo.close();
  }
}
