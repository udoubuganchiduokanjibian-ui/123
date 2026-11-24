import { randomUUID } from "node:crypto";
import { createNarrativeAgent } from "../agent/narrative-agent.ts";
import { startSession } from "../engine/narrative-engine.ts";
import type { TimelineEntry } from "../engine/narrative-timeline.ts";
import { createDeepSeekProvider } from "../providers/deepseek-provider.ts";
import { createMockProvider } from "../providers/mock-provider.ts";
import { ProviderRegistry } from "../providers/provider-registry.ts";
import type { AgentTurnOutput, Danmaku } from "../schemas/agent-protocol.ts";
import { loadStoryPack } from "../skills/skill-loader.ts";

type ReaderMode = "advancing" | "waiting_for_player" | "no_action" | "completed";
type ReaderEntry = Extract<TimelineEntry, {
  type: "narrative_block" | "danmaku_submitted" | "autonomous_action_executed" | "session_completed";
}>;

type ReaderSession = {
  engine: ReturnType<typeof startSession>;
  title: string;
  character: string;
  hasFirstInterventionLine: boolean;
  sceneTitles: Map<string, string>;
  idle: boolean;
  busy: boolean;
  touchedAt: number;
};

const sessions = new Map<string, ReaderSession>();
const sessionLifetime = 60 * 60 * 1000;

// Scripted model output for this pack. Engine validation still governs every action and clue.
const registry = new ProviderRegistry();
registry.register(createMockProvider("reader-mock", true, ({ messages }) => {
  const { availableActions, playerInput, scene } = JSON.parse(messages[1].content) as {
    scene: { id: string };
    availableActions: { id: string; description: string }[];
    playerInput: Pick<Danmaku, "id" | "text">[];
  };
  const action = availableActions[0];
  if (!playerInput.length) return JSON.stringify({ actionId: action.id });

  if (availableActions.some(option => !option.id.startsWith("event-"))) {
    const proposedEvents: AgentTurnOutput["proposedEvents"] = [];
    // Script the archive-room exchange in the offline preview.
    function reaction(text: string): string | undefined {
      if (scene.id !== "s01") return;
      if (/(白针|弟弟).*(死|去世)|(?:死|去世).*(白针|弟弟)/u.test(text) && /设备|操作失误/u.test(text)) return "";
      if (/真相/u.test(text) && /知道|告诉/u.test(text)) return "你是从谁那儿听来的？";
    }
    const reply = reaction(playerInput.at(-1)?.text ?? "");
    const danmakuDecisions = playerInput.map(({ id: danmakuId, text }): AgentTurnOutput["danmakuDecisions"][number] => {
      if (reaction(text) !== undefined) {
        return { danmakuId, decision: "defer", reason: "这句话触及白针，但没有提出现场调查。" };
      }
      // Match short phrases against currently legal actions in the offline provider.
      const terms = Array.from({ length: text.length - 1 }, (_, i) => text.slice(i, i + 2));
      const ranked = availableActions.map(option => ({
        option, score: terms.filter(term => option.description.includes(term)).length,
      })).sort((left, right) => right.score - left.score);
      const match = ranked[0];
      if (!match?.score) return { danmakuId, decision: "question", reason: "你建议我具体做什么？" };
      if (proposedEvents.length) return { danmakuId, decision: "defer", reason: "等我先处理眼前这件事。" };
      proposedEvents.push({ storyEventId: match.option.id, danmakuId });
      return { danmakuId, decision: "accept", reason: "我先试着按这个方向做。" };
    });
    return JSON.stringify({
      narration: proposedEvents.length ? "我先去看看。" : reply ?? "你说，我先去哪儿找？",
      ...(!proposedEvents.length && reply && { delivery: "hesitant" as const }),
      danmakuDecisions, proposedEvents, nextStep: { kind: "stay" }, memories: [], trustDelta: 0,
    } satisfies AgentTurnOutput);
  }

  const proposedEvents: AgentTurnOutput["proposedEvents"] = [];
  const danmakuDecisions = playerInput.map(({ id: danmakuId, text }): AgentTurnOutput["danmakuDecisions"][number] => {
    if (/(?:一定|肯定|断定)/u.test(text)) {
      return { danmakuId, decision: "reject", reason: "我还没找到能证实这个说法的东西。" };
    }
    if (action && /(?:翻面|翻过|翻看|反面|背面|翻.{0,4}便[签条]|便[签条].{0,4}翻)/u.test(text)) {
      if (proposedEvents.length) {
        return { danmakuId, decision: "accept", reason: "我会一并核对这条建议。" };
      }
      proposedEvents.push({ storyEventId: action.id, danmakuId });
      return { danmakuId, decision: "accept", reason: "我可以翻过便签确认。" };
    }
    if (/(?:可能|也许|会不会)/u.test(text)) {
      return { danmakuId, decision: "infer", reason: "便签上的「旧锁」可能和卡住的锁舌有关，我还要核实。" };
    }
    return { danmakuId, decision: "question", reason: "我该检查便签的哪一面？" };
  });
  return JSON.stringify({
    narration: proposedEvents.length ? "我看完了便签，接下来按上面的步骤试试。" : "我把便签留在手边，等一个具体的建议。",
    danmakuDecisions,
    proposedEvents,
    nextStep: { kind: "stay" },
    memories: [],
    trustDelta: 0,
  } satisfies AgentTurnOutput);
}));

export async function startReaderSession() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (!session.busy && now - session.touchedAt >= sessionLifetime) sessions.delete(id);
  }
  const pack = await loadStoryPack(process.env.READER_STORY_PACK || "volunteer-17");
  if (sessions.size >= 256) return null;
  const id = randomUUID();
  const providerId = process.env.READER_LLM_PROVIDER?.trim() || "mock";
  let sessionRegistry = registry;
  if (providerId === "deepseek") {
    sessionRegistry = new ProviderRegistry();
    sessionRegistry.register(createDeepSeekProvider());
  }
  const session: ReaderSession = {
    engine: startSession(pack, createNarrativeAgent(pack, sessionRegistry, providerId)),
    title: pack.manifest.title,
    character: pack.manifest.character.name,
    hasFirstInterventionLine: Boolean(pack.manifest.firstInterventionLine),
    sceneTitles: new Map(pack.scenes.map(({ id, title }) => [id, title])),
    idle: false,
    busy: false,
    touchedAt: Date.now(),
  };
  sessions.set(id, session);
  return readerView(id, session);
}

export function getReaderSession(id: string) {
  const session = sessions.get(id);
  if (!session) return;
  if (!session.busy && Date.now() - session.touchedAt >= sessionLifetime) {
    sessions.delete(id);
    return;
  }
  session.touchedAt = Date.now();
  return session;
}

export function readerView(id: string, session: ReaderSession) {
  const { state, status, timeline, openEventIds, pendingDanmaku } = session.engine.getSnapshot();
  let mode: ReaderMode = "advancing";
  if (status === "completed") mode = "completed";
  else if (openEventIds.length) mode = pendingDanmaku.length ? "advancing" : "waiting_for_player";
  else if (session.idle) mode = "no_action";

  const entries = timeline.filter((entry): entry is ReaderEntry =>
    entry.type === "narrative_block" || entry.type === "danmaku_submitted" ||
    entry.type === "autonomous_action_executed" || entry.type === "session_completed",
  );
  // Story events in the order they happened, so the camera can stage the characters.
  const eventIds = timeline.flatMap(entry =>
    entry.type === "autonomous_action_executed" ? [entry.content.actionId]
      : entry.type === "intervention_triggered" ? [entry.content.storyEventId] : []);
  return {
    id,
    title: session.title,
    character: session.character,
    sceneId: state.currentSceneId,
    scene: session.sceneTitles.get(state.currentSceneId),
    revision: timeline.at(-1)?.sequence ?? 0,
    mode,
    chatReady: !session.hasFirstInterventionLine || timeline.some(entry => entry.type === "intervention_opened"),
    entries,
    eventIds,
  };
}

export type ReaderView = ReturnType<typeof readerView>;

export async function stepReader(session: ReaderSession, revision: number) {
  const snapshot = session.engine.getSnapshot();
  if (snapshot.status === "completed" || snapshot.timeline.at(-1)?.sequence !== revision) return;
  if (snapshot.openEventIds.length && snapshot.pendingDanmaku.length) {
    await session.engine.processIntervention();
    return;
  }
  if (session.idle || snapshot.openEventIds.length) return;
  const result = await session.engine.advanceAutonomousStep();
  session.idle = result.status === "no_action";
}

export async function submitReaderDanmaku(session: ReaderSession, text: string, requestId: string) {
  const { status, openEventIds } = session.engine.getSnapshot();
  if (status === "completed" || session.idle) return;
  session.engine.submitDanmaku({ kind: "intervention", text }, requestId);
  if (openEventIds.length) await session.engine.processIntervention();
}
