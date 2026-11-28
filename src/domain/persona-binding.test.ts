import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PERSONA_BINDINGS,
  PersonaBindingSchema,
  UNVERIFIED_CAPABILITIES,
  assertUniquePersonaBindings,
  isRepoRelativeAvatarRef,
  parsePersonaBinding,
  parsePersonaBindingRegistry,
} from './persona-binding.ts';

const EXPECTED = [
  ['persona-iris', 'IA-01', 'gemini', 'assistido', 'Iris'],
  ['persona-faisca', 'IA-02', 'gemini_spark', 'assistido', 'Faísca'],
  ['persona-rui', 'IA-03', 'grok', 'assistido', 'Rui'],
  ['persona-nina', 'IA-04', 'antigravity', 'desconectado', 'Nina'],
  ['persona-teo', 'IA-05', 'chatgpt', 'assistido', 'Teo'],
  ['persona-bento', 'IA-06', 'claude', 'assistido', 'Bento'],
  ['persona-vera', 'IA-07', 'google_ai_studio', 'assistido', 'Vera'],
  ['persona-caio', 'IA-08', 'codex', 'assistido', 'Caio'],
  ['persona-lia', 'IA-09', 'copilot', 'assistido', 'Lia'],
  ['persona-devin', 'IA-10', 'devin', 'bloqueado', 'Devin'],
] as const;

function withAvatar(avatarRef: string) {
  const iris = PERSONA_BINDINGS[0];
  assert.ok(iris);
  return {
    ...iris,
    display: { name: iris.display.name, avatar_ref: avatarRef },
  };
}

test('os dez bindings definitivos estão em demo, sem modelo e sem capability verificada', () => {
  assert.equal(PERSONA_BINDINGS.length, 10);
  assert.deepEqual(parsePersonaBinding(PERSONA_BINDINGS[0]), PERSONA_BINDINGS[0]);
  assert.deepEqual(
    PERSONA_BINDINGS.map((binding) => [
      binding.persona_id,
      binding.provider_id,
      binding.provider,
      binding.mode,
      binding.display.name,
    ]),
    EXPECTED,
  );
  for (const binding of PERSONA_BINDINGS) {
    assert.equal(binding.status, 'demo');
    assert.equal(binding.model, null);
    assert.equal(binding.account_plan, null);
    assert.equal(binding.display.tagline, undefined);
    assert.equal(binding.display.avatar_ref, undefined);
    assert.deepEqual(binding.capabilities, UNVERIFIED_CAPABILITIES);
  }
  assert.equal(PERSONA_BINDINGS.find((binding) => binding.status === 'operacional'), undefined);
});

test('persona_id e provider_id são únicos no registro', () => {
  assert.doesNotThrow(() => {
    assertUniquePersonaBindings(PERSONA_BINDINGS);
  });
  const personaIds = PERSONA_BINDINGS.map((binding) => binding.persona_id);
  const providerIds = PERSONA_BINDINGS.map((binding) => binding.provider_id);
  assert.equal(new Set(personaIds).size, personaIds.length);
  assert.equal(new Set(providerIds).size, providerIds.length);
});

test('o registro rejeita persona_id ou provider_id repetido', () => {
  const [first, second] = PERSONA_BINDINGS;
  assert.ok(first);
  assert.ok(second);
  assert.throws(
    () => parsePersonaBindingRegistry([first, { ...second, persona_id: first.persona_id }]),
    /persona_id duplicado: persona-iris/,
  );
  assert.throws(
    () => parsePersonaBindingRegistry([first, { ...second, provider_id: first.provider_id }]),
    /provider_id duplicado: IA-01/,
  );
});

test('capabilities omitidas viram nao_verificado', () => {
  const iris = PERSONA_BINDINGS[0];
  assert.ok(iris);
  const withoutCapabilities = {
    persona_id: iris.persona_id,
    provider_id: iris.provider_id,
    provider: iris.provider,
    account_plan: iris.account_plan,
    model: iris.model,
    mode: iris.mode,
    status: iris.status,
    display: iris.display,
  };
  const parsed = PersonaBindingSchema.parse({
    ...withoutCapabilities,
    capabilities: { chat: 'suportado' },
  });
  assert.equal(parsed.capabilities.chat, 'suportado');
  assert.equal(parsed.capabilities.codigo, 'nao_verificado');
  assert.equal(parsed.capabilities.coordenacao, 'nao_verificado');
  const fullyDefaulted = PersonaBindingSchema.parse(withoutCapabilities);
  assert.deepEqual(fullyDefaulted.capabilities, UNVERIFIED_CAPABILITIES);
});

test('avatar_ref aceita caminho relativo do repo e rejeita URL, esquema, absoluto e ..', () => {
  assert.equal(isRepoRelativeAvatarRef('personas/iris.svg'), true);
  assert.equal(PersonaBindingSchema.safeParse(withAvatar('personas/iris.svg')).success, true);
  assert.equal(
    PersonaBindingSchema.safeParse(withAvatar('personas/grupo/iris.svg')).success,
    true,
  );

  const rejected = [
    'https://example.com/personas/iris.svg',
    'http://personas/iris.svg',
    'data:image/svg+xml,abc',
    'file:///personas/iris.svg',
    'javascript:alert(1)',
    '/personas/iris.svg',
    'personas/../iris.svg',
    '../personas/iris.svg',
    '..\\personas\\iris.svg',
    '//cdn.example.com/iris.svg',
    'personas/iris.svg?v=1',
  ];
  for (const avatarRef of rejected) {
    assert.equal(isRepoRelativeAvatarRef(avatarRef), false, avatarRef);
    assert.equal(PersonaBindingSchema.safeParse(withAvatar(avatarRef)).success, false, avatarRef);
  }
});

test('provider devin só passa bloqueado e em demo', () => {
  const devin = PERSONA_BINDINGS.find((binding) => binding.provider === 'devin');
  assert.ok(devin);
  assert.equal(devin.mode, 'bloqueado');
  assert.equal(devin.status, 'demo');
  assert.equal(PersonaBindingSchema.safeParse(devin).success, true);
  assert.equal(PersonaBindingSchema.safeParse({ ...devin, mode: 'assistido' }).success, false);
  assert.equal(PersonaBindingSchema.safeParse({ ...devin, mode: 'api' }).success, false);
  assert.equal(PersonaBindingSchema.safeParse({ ...devin, mode: 'desconectado' }).success, false);
  const operacional = PersonaBindingSchema.safeParse({ ...devin, status: 'operacional' });
  assert.equal(operacional.success, false);
  if (!operacional.success) {
    assert.match(operacional.error.message, /OK escrito do Marcelo/);
  }
});

test('account_plan rejeita e-mail e URL e aceita só o nome do plano', () => {
  const iris = PERSONA_BINDINGS[0];
  assert.ok(iris);
  assert.equal(
    PersonaBindingSchema.safeParse({ ...iris, account_plan: 'Google AI Pro' }).success,
    true,
  );
  assert.equal(PersonaBindingSchema.safeParse({ ...iris, account_plan: null }).success, true);
  assert.equal(
    PersonaBindingSchema.safeParse({ ...iris, account_plan: 'pessoa@example.com' }).success,
    false,
  );
  assert.equal(
    PersonaBindingSchema.safeParse({ ...iris, account_plan: 'https://example.com/plano' }).success,
    false,
  );
});

test('slugs e provedores fora do contrato falham', () => {
  const iris = PERSONA_BINDINGS[0];
  assert.ok(iris);
  assert.equal(PersonaBindingSchema.safeParse({ ...iris, persona_id: 'iris' }).success, false);
  assert.equal(PersonaBindingSchema.safeParse({ ...iris, persona_id: 'persona-Iris' }).success, false);
  assert.equal(PersonaBindingSchema.safeParse({ ...iris, provider_id: 'IA-11' }).success, false);
  assert.equal(PersonaBindingSchema.safeParse({ ...iris, provider_id: 'IA-00' }).success, false);
  assert.equal(PersonaBindingSchema.safeParse({ ...iris, provider: 'openai' }).success, false);
});
