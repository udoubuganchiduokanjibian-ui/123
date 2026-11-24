import assert from "node:assert/strict";
import { test } from "node:test";
import { createMockProvider } from "../providers/mock-provider.ts";
import type { Generation } from "../providers/model-provider.ts";
import { ProviderRegistry } from "../providers/provider-registry.ts";
import { loadStoryPack } from "../skills/skill-loader.ts";
import { startSession } from "../engine/narrative-engine.ts";
import { createNarrativeAgent } from "./narrative-agent.ts";

const pack = await loadStoryPack("demo-story");
function sessionWith(reply: (request: Generation) => string, story = pack) {
  const registry = new ProviderRegistry();
  registry.register(createMockProvider("mock-agent", true, reply));
  return startSession(story, createNarrativeAgent(story, registry));
}

test("questioning an unsupported claim sends explicit grounding rules and commits no evidence", async () => {
  const story = structuredClone(pack);
  const scene = story.scenes.find(({ id }) => id === story.manifest.entrySceneId)!;
  scene.opening = "书房门关着。";
  story.manifest.character.knownFactIds = [];
  const session = sessionWith(({ messages }) => {
    const instructions = messages[0].content;
    assert.equal(messages[0].role, "system");
    assert.match(instructions, /scene.*discoveredClues.*characterKnowledge/);
    assert.match(instructions, /不得写有声音、有光、无声或无光/);
    assert.match(instructions, /推测必须以已提供的证据为依据/);
    assert.match(instructions, /玩家弹幕.*不能成为事实或主角的观察/);
    assert.match(instructions, /之前生成的叙述.*Timeline 叙述记录不构成证据/);
    assert.match(instructions, /候选行动描述里出现的物体.*不代表它们已被看到/);
    assert.match(instructions, /即使候选行动写了‘查看门牌’，也不能说‘我看见门牌’/);
    const context = JSON.parse(messages[1].content);
    assert.equal(context.scene.opening, "书房门关着。");
    assert.deepEqual(context.characterKnowledge, []);
    assert.deepEqual(context.discoveredClues, []);
    assert.equal(context.playerInput[0].text, "书房里一定有人。");
    return JSON.stringify({
      narration: "书房门关着。门后是否有人，目前无法确认。",
      danmakuDecisions: [{ danmakuId: context.playerInput[0].id, decision: "question", reason: "你有什么依据？" }],
      proposedEvents: [], nextStep: { kind: "stay" }, memories: [], trustDelta: 0,
    });
  }, story);
  session.submitDanmaku({ kind: "information", text: "书房里一定有人。" });
  const before = session.advanceNarrative();
  const after = await session.processIntervention();
  assert.deepEqual(after.state.knownFactIds, before.state.knownFactIds);
  assert.deepEqual(after.state.discoveredClueIds, before.state.discoveredClueIds);
  assert.deepEqual(after.state.eventHistory, before.state.eventHistory);
  assert.ok(after.timeline.some(entry => entry.type === "narrative_block" &&
    entry.content.kind === "decision" && entry.content.decision === "question"));
});

test("visible context and FIFO model proposals reach engine adjudication and causal timeline", async () => {
  let calls = 0;
  const session = sessionWith(request => {
    calls++;
    assert.equal(request.responseFormat, "json");
    const context = JSON.parse(request.messages[1].content);
    assert.equal(context.character.personality, pack.characterMarkdown);
    assert.equal(context.scene.id, pack.manifest.entrySceneId);
    assert.deepEqual(context.characterKnowledge.map((f: { id: string }) => f.id), pack.manifest.character.knownFactIds);
    assert.deepEqual(context.discoveredClues, []);
    assert.ok(!JSON.stringify(context).includes("ending-documented"));
    assert.ok(!JSON.stringify(context).includes("fact-blue-ties"));
    assert.deepEqual(context.playerInput.map((m: { text: string }) => m.text),
      ["比对门边的蓝线", "老钟从来不响", "帮我看看", "这根线可能与箱子有关吗"]);
    const decisions = ["accept", "reject", "question", "infer"];
    const reasons = ["核对线头", "我听到了报时", "你想检查哪里？", "可能来自移交箱，需比对"];
    return JSON.stringify({
      narration: "林岑俯身比较两根线。", memories: [], trustDelta: 2, nextStep: { kind: "stay" },
      danmakuDecisions: context.playerInput.map((m: { id: string }, i: number) =>
        ({ danmakuId: m.id, decision: decisions[i], reason: reasons[i] })),
      proposedEvents: [{ storyEventId: context.availableActions[0].id, danmakuId: context.playerInput[0].id }],
    });
  });
  const canon = structuredClone(pack.facts);
  session.submitDanmaku({ kind: "intervention", text: "比对门边的蓝线" });
  session.submitDanmaku({ kind: "information", text: "老钟从来不响" });
  session.submitDanmaku({ kind: "advice", text: "帮我看看" });
  const hypothesis = session.submitDanmaku({ kind: "advice", text: "这根线可能与箱子有关吗" });
  session.advanceNarrative();
  const result = await session.processIntervention();
  assert.equal(calls, 1);
  assert.deepEqual(result.pendingDanmaku, []);
  assert.deepEqual(result.state.discoveredClueIds, ["clue-blue-thread"]);
  assert.deepEqual(result.state.knownFactIds, ["fact-clock-chimes", "fact-blue-ties"]);
  assert.deepEqual(pack.facts, canon);
  assert.deepEqual(result.timeline.flatMap(e => e.type === "narrative_block" && e.content.kind === "decision"
    ? [e.content.decision] : []), ["accept", "reject", "question", "infer"]);
  const inference = result.timeline.find(e => e.relatedDanmakuId === hypothesis.id &&
    e.type === "narrative_block" && e.content.kind === "ai_inference");
  assert.ok(inference?.causedBy);
  assert.equal(result.timeline[inference.causedBy - 1].relatedDanmakuId, hypothesis.id);
});

for (const [name, reply] of [
  ["provider failure", () => { throw new Error("offline"); }],
  ["malformed JSON", () => "{"],
  ["invalid decision schema", () => '{"state":{"trust":100}}'],
  ["unbound message", () => JSON.stringify({ narration: "观察", danmakuDecisions: [],
    proposedEvents: [], memories: [], trustDelta: 0, nextStep: { kind: "stay" } })],
] as const) {
  test(name + " preserves the entire session and pending batch", async () => {
    const session = sessionWith(reply);
    session.submitDanmaku({ kind: "advice", text: "请观察" });
    const before = session.advanceNarrative();
    await assert.rejects(session.processIntervention());
    assert.deepEqual(session.getSnapshot(), before);
  });
}


test("a silent response still commits the turn without a chat entry", async () => {
  const session = sessionWith(({ messages }) => {
    const { playerInput } = JSON.parse(messages[1].content);
    return JSON.stringify({
      narration: " ",
      danmakuDecisions: [{ danmakuId: playerInput[0].id, decision: "defer", reason: "暂且搁置。" }],
      proposedEvents: [], nextStep: { kind: "stay" }, memories: [], trustDelta: 0,
    });
  });
  session.submitDanmaku({ kind: "information", text: "我知道那件事。" });
  const before = session.advanceNarrative();
  const after = await session.processIntervention();
  const entries = after.timeline.slice(before.timeline.length);
  assert.equal(after.state.turn, before.state.turn + 1);
  assert.ok(entries.some(entry => entry.type === "narrative_block" && entry.content.kind === "decision"));
  assert.ok(!entries.some(entry => entry.type === "narrative_block" && entry.content.kind === "narration"));
});
