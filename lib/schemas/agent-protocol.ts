import { z } from "zod";
import { idListSchema, idSchema, textSchema, turnSchema } from "./common.ts";

export const danmakuSchema = z.strictObject({
  id: idSchema,
  sceneId: idSchema,
  submittedAtTurn: turnSchema,
  kind: z.enum(["advice", "information", "intervention"]),
  text: textSchema.max(500),
});

export const gameEventSchema = z.strictObject({
  id: idSchema,
  storyEventId: idSchema,
  sceneId: idSchema,
  turn: turnSchema,
  danmakuId: idSchema.optional(),
  revealedClueIds: idListSchema,
});

export const autonomousProposalSchema = z.strictObject({ actionId: idSchema });

export const agentTurnOutputSchema = z.strictObject({
  narration: z.string().trim(),
  delivery: z.enum(["direct", "hesitant"]).optional(),
  danmakuDecisions: z.array(z.strictObject({
    danmakuId: idSchema,
    decision: z.enum(["accept", "defer", "reject", "question", "infer"]),
    reason: textSchema,
  })).refine(
    (decisions) => new Set(decisions.map(({ danmakuId }) => danmakuId)).size === decisions.length,
    "Each danmaku can have only one decision per turn",
  ),
  proposedEvents: z.array(z.strictObject({
    storyEventId: idSchema,
    danmakuId: idSchema,
  })),
  nextStep: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("stay") }),
    z.strictObject({ kind: z.literal("transition"), sceneId: idSchema }),
    z.strictObject({ kind: z.literal("end"), endingId: idSchema }),
  ]),
  memories: z.array(textSchema),
  trustDelta: z.number().int().min(-100).max(100),
});

export const modelRequestSchema = z.strictObject({
  model: textSchema,
  messages: z.array(z.strictObject({
    role: z.enum(["system", "user", "assistant"]),
    content: textSchema,
  })).min(1),
  responseFormat: z.enum(["text", "json"]),
});

export const modelResponseSchema = z.strictObject({
  content: z.string(),
  finishReason: z.enum(["stop", "length", "content-filter", "unknown"]),
  usage: z.strictObject({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative().optional(),
  }).optional(),
});

export type Danmaku = z.infer<typeof danmakuSchema>;
export type GameEvent = z.infer<typeof gameEventSchema>;
export type AgentTurnOutput = z.infer<typeof agentTurnOutputSchema>;
export type ModelRequest = z.infer<typeof modelRequestSchema>;
export type ModelResponse = z.infer<typeof modelResponseSchema>;
