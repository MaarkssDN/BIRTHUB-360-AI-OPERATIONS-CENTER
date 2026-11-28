import { z } from 'zod';

/**
 * Contrato PersonaBinding: liga uma persona a um provedor IA-01..IA-10.
 *
 * Cor, tom e descrição ficam fora deste schema. Um PersonaProfile futuro
 * liga esses atributos pelo mesmo persona_id.
 *
 * account_plan guarda só o nome do plano (ou null). Não cabe conta, e-mail,
 * identificador de cobrança nem segredo.
 *
 * Não há caminho para operacional do provedor devin neste contrato. Passar
 * esse binding a operacional exige health check real e OK escrito do Marcelo.
 * Este módulo não promove nenhum binding a operacional.
 */

export const PERSONA_ID_PATTERN = /^persona-[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PROVIDER_ID_PATTERN = /^IA-(0[1-9]|10)$/;

const AVATAR_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Caminho relativo dentro do repo, como `personas/iris.svg`. */
export function isRepoRelativeAvatarRef(value: string): boolean {
  if (value.length < 3 || value.length > 240) {
    return false;
  }
  if (value.includes('\\') || value.includes(':') || value.includes('..')) {
    return false;
  }
  if (value.startsWith('/') || value.startsWith('.')) {
    return false;
  }
  if (/[?#%@\s]/.test(value) || value.includes('//')) {
    return false;
  }
  const segments = value.split('/');
  if (segments.length < 2) {
    return false;
  }
  const fileName = segments[segments.length - 1];
  if (!fileName?.includes('.')) {
    return false;
  }
  return segments.every((segment) => AVATAR_SEGMENT.test(segment));
}

export const ProviderIdSchema = z.string().regex(PROVIDER_ID_PATTERN);

export const ProviderSchema = z.enum([
  'gemini',
  'gemini_spark',
  'grok',
  'antigravity',
  'chatgpt',
  'claude',
  'google_ai_studio',
  'codex',
  'copilot',
  'devin',
]);

export const PersonaModeSchema = z.enum(['assistido', 'api', 'desconectado', 'bloqueado']);

export const PersonaStatusSchema = z.enum(['demo', 'operacional']);

export const CapabilityLevelSchema = z.enum([
  'suportado',
  'assistido',
  'nao_verificado',
  'indisponivel',
]);

const capabilityLevel = () => CapabilityLevelSchema.default('nao_verificado');

export const UNVERIFIED_CAPABILITIES = {
  chat: 'nao_verificado',
  codigo: 'nao_verificado',
  revisao: 'nao_verificado',
  pesquisa: 'nao_verificado',
  monitoramento: 'nao_verificado',
  coordenacao: 'nao_verificado',
} as const;

export const CapabilitiesSchema = z
  .object({
    chat: capabilityLevel(),
    codigo: capabilityLevel(),
    revisao: capabilityLevel(),
    pesquisa: capabilityLevel(),
    monitoramento: capabilityLevel(),
    coordenacao: capabilityLevel(),
  })
  .strict()
  .default({ ...UNVERIFIED_CAPABILITIES });

export const AccountPlanSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => !/[@/:\\]/.test(value), {
    message: 'account_plan guarda só o nome do plano',
  })
  .nullable();

export const AvatarRefSchema = z.string().refine(isRepoRelativeAvatarRef, {
  message: 'avatar_ref deve ser caminho relativo do repo, sem URL, esquema, absoluto ou ..',
});

export const PersonaDisplaySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    tagline: z.string().trim().min(1).max(160).optional(),
    avatar_ref: AvatarRefSchema.optional(),
  })
  .strict();

export const PersonaBindingSchema = z
  .object({
    persona_id: z.string().regex(PERSONA_ID_PATTERN),
    provider_id: ProviderIdSchema,
    provider: ProviderSchema,
    account_plan: AccountPlanSchema,
    model: z.string().trim().min(1).max(120).nullable(),
    mode: PersonaModeSchema,
    capabilities: CapabilitiesSchema,
    status: PersonaStatusSchema,
    display: PersonaDisplaySchema,
  })
  .strict()
  .refine(
    (binding) =>
      binding.provider !== 'devin' || (binding.mode === 'bloqueado' && binding.status === 'demo'),
    {
      message:
        'provider devin exige mode bloqueado e status demo; operacional exige health check real e OK escrito do Marcelo',
    },
  );

export type ProviderId = z.infer<typeof ProviderIdSchema>;
export type Provider = z.infer<typeof ProviderSchema>;
export type PersonaMode = z.infer<typeof PersonaModeSchema>;
export type PersonaStatus = z.infer<typeof PersonaStatusSchema>;
export type CapabilityLevel = z.infer<typeof CapabilityLevelSchema>;
export type PersonaCapabilities = z.infer<typeof CapabilitiesSchema>;
export type PersonaBinding = z.infer<typeof PersonaBindingSchema>;

export function parsePersonaBinding(input: unknown): PersonaBinding {
  return PersonaBindingSchema.parse(input);
}

export function assertUniquePersonaBindings(bindings: readonly PersonaBinding[]): void {
  const personaIds = new Set<string>();
  const providerIds = new Set<string>();
  for (const binding of bindings) {
    if (personaIds.has(binding.persona_id)) {
      throw new Error(`persona_id duplicado: ${binding.persona_id}`);
    }
    if (providerIds.has(binding.provider_id)) {
      throw new Error(`provider_id duplicado: ${binding.provider_id}`);
    }
    personaIds.add(binding.persona_id);
    providerIds.add(binding.provider_id);
  }
}

export function parsePersonaBindingRegistry(input: unknown): PersonaBinding[] {
  const bindings = z.array(PersonaBindingSchema).parse(input);
  assertUniquePersonaBindings(bindings);
  return bindings;
}

const RAW_PERSONA_BINDINGS: readonly unknown[] = [
  {
    persona_id: 'persona-iris',
    provider_id: 'IA-01',
    provider: 'gemini',
    account_plan: null,
    model: null,
    mode: 'assistido',
    capabilities: UNVERIFIED_CAPABILITIES,
    status: 'demo',
    display: { name: 'Iris' },
  },
  {
    persona_id: 'persona-faisca',
    provider_id: 'IA-02',
    provider: 'gemini_spark',
    account_plan: null,
    model: null,
    mode: 'assistido',
    capabilities: UNVERIFIED_CAPABILITIES,
    status: 'demo',
    display: { name: 'Faísca' },
  },
  {
    persona_id: 'persona-rui',
    provider_id: 'IA-03',
    provider: 'grok',
    account_plan: null,
    model: null,
    mode: 'assistido',
    capabilities: UNVERIFIED_CAPABILITIES,
    status: 'demo',
    display: { name: 'Rui' },
  },
  {
    persona_id: 'persona-nina',
    provider_id: 'IA-04',
    provider: 'antigravity',
    account_plan: null,
    model: null,
    mode: 'desconectado',
    capabilities: UNVERIFIED_CAPABILITIES,
    status: 'demo',
    display: { name: 'Nina' },
  },
  {
    persona_id: 'persona-teo',
    provider_id: 'IA-05',
    provider: 'chatgpt',
    account_plan: null,
    model: null,
    mode: 'assistido',
    capabilities: UNVERIFIED_CAPABILITIES,
    status: 'demo',
    display: { name: 'Teo' },
  },
  {
    persona_id: 'persona-bento',
    provider_id: 'IA-06',
    provider: 'claude',
    account_plan: null,
    model: null,
    mode: 'assistido',
    capabilities: UNVERIFIED_CAPABILITIES,
    status: 'demo',
    display: { name: 'Bento' },
  },
  {
    persona_id: 'persona-vera',
    provider_id: 'IA-07',
    provider: 'google_ai_studio',
    account_plan: null,
    model: null,
    mode: 'assistido',
    capabilities: UNVERIFIED_CAPABILITIES,
    status: 'demo',
    display: { name: 'Vera' },
  },
  {
    persona_id: 'persona-caio',
    provider_id: 'IA-08',
    provider: 'codex',
    account_plan: null,
    model: null,
    mode: 'assistido',
    capabilities: UNVERIFIED_CAPABILITIES,
    status: 'demo',
    display: { name: 'Caio' },
  },
  {
    persona_id: 'persona-lia',
    provider_id: 'IA-09',
    provider: 'copilot',
    account_plan: null,
    model: null,
    mode: 'assistido',
    capabilities: UNVERIFIED_CAPABILITIES,
    status: 'demo',
    display: { name: 'Lia' },
  },
  {
    persona_id: 'persona-devin',
    provider_id: 'IA-10',
    provider: 'devin',
    account_plan: null,
    model: null,
    mode: 'bloqueado',
    capabilities: UNVERIFIED_CAPABILITIES,
    status: 'demo',
    display: { name: 'Devin' },
  },
];

/** Dez bindings definitivos. Todos demo; nenhum avatar e nenhum modelo. */
export const PERSONA_BINDINGS: readonly PersonaBinding[] =
  parsePersonaBindingRegistry(RAW_PERSONA_BINDINGS);
