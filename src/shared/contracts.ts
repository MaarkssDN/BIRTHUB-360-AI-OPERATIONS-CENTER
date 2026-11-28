import { z } from 'zod';

/** Estado mínimo do arquivo local. A ponte local permanece desligada neste contrato. */
export const DatabaseStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    seed: z.literal('synthetic'),
    governance: z
      .object({
        globalAutomationSuspended: z.boolean(),
        devinBridgeEnabled: z.literal(false),
        devinContractVerified: z.literal(false),
      })
      .strict(),
    providers: z.array(
      z
        .object({
          id: z.string().min(1),
          name: z.string().min(1),
          environment: z.string().min(1),
        })
        .strict(),
    ),
    missions: z.array(
      z
        .object({
          id: z.string().min(1),
          title: z.string().min(1),
          executorAgentId: z.string().min(1),
          auditorAgentId: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();

export type DatabaseState = z.infer<typeof DatabaseStateSchema>;

export const HealthResponseSchema = z
  .object({
    status: z.literal('ok'),
    service: z.literal('b360-aoc'),
    persistence: z.literal('fail-closed'),
  })
  .strict();

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ReadyResponseSchema = z
  .object({
    status: z.enum(['ready', 'not-ready']),
    schemaVersion: z.literal(1).optional(),
    seed: z.literal('synthetic').optional(),
    error: z.string().optional(),
  })
  .strict();

export type ReadyResponse = z.infer<typeof ReadyResponseSchema>;
