import assert from "node:assert/strict";
import { test } from "node:test";
import { loadStoryPack } from "../skills/skill-loader.ts";
import { getReaderSession, readerView, startReaderSession, stepReader, submitReaderDanmaku } from "./reader-session.ts";

process.env.READER_STORY_PACK = "volunteer-17";
process.env.READER_LLM_PROVIDER = "mock";
const pack = await loadStoryPack("volunteer-17");

for (const [ending, conflict, trade, final] of [
  ["end-a", "e041", "e054", "e058"],
  ["end-b1", "e040", "e054", "e063"],
  ["end-b2", "e041", "e055", "e063"],
  ["end-c", "e041", "e053", "e066"],
]) {
  test(`Reader plays six scenes and resolves ${ending}`, async () => {
    const view = (await startReaderSession())!;
    const session = getReaderSession(view.id)!;
    const choices = ["e002", "e009", "e025", "e027", "e031", conflict, trade, final];
    const scenes = new Set<string>();
    for (let turn = 0; turn < 100; turn++) {
      const current = readerView(view.id, session);
      scenes.add(current.sceneId);
      if (current.mode === "completed") break;
      if (current.mode === "waiting_for_player") {
        const id = choices.shift();
        assert.ok(session.engine.getSnapshot().openEventIds.includes(id!), `Unexpected window: ${id}`);
        const event = pack.events.find(event => event.id === id)!;
        await submitReaderDanmaku(session, event.description.slice(0, 100), crypto.randomUUID());
      } else {
        assert.equal(current.mode, "advancing");
        await stepReader(session, current.revision);
      }
    }
    assert.equal(scenes.size, 6);
    assert.equal(choices.length, 0);
    assert.equal(session.engine.getSnapshot().state.endingId, ending);
  });
}

test("ordinary retreat advice gets a specific response at both corridor decisions", async () => {
  const start = (await startReaderSession())!;
  const session = getReaderSession(start.id)!;
  const choices = [
    { id: "e002" },
    { id: "e011" },
    { id: "e025" },
    { id: "e027" },
    { id: "e032", text: "别拔刀。跟他拉开距离，从安全通道撤离，把资料带走。", reply: "我先等他的手电移开" },
    { id: "e041", text: "从安全通道离开。", reply: "我先退开，带着资料找出口" },
    { id: "e054" },
    { id: "e058" },
  ];
  for (let turn = 0; turn < 100; turn++) {
    const current = readerView(start.id, session);
    if (current.mode === "completed") break;
    if (current.mode !== "waiting_for_player") {
      assert.equal(current.mode, "advancing");
      await stepReader(session, current.revision);
      continue;
    }
    const choice = choices.shift();
    assert.ok(choice, "Unexpected choice point");
    assert.ok(session.engine.getSnapshot().openEventIds.includes(choice.id));
    const event = pack.events.find(event => event.id === choice.id)!;
    await submitReaderDanmaku(session, choice.text ?? event.description.slice(0, 100), crypto.randomUUID());
    const next = readerView(start.id, session);
    assert.ok(next.eventIds.includes(choice.id));
    if (choice.reply) {
      const newEntries = JSON.stringify(next.entries.filter(entry => entry.sequence > current.revision));
      assert.ok(newEntries.includes(choice.reply));
    }
  }
  const ending = readerView(start.id, session);
  assert.equal(choices.length, 0);
  assert.equal(session.engine.getSnapshot().state.endingId, "end-a");
  assert.match(JSON.stringify(ending.entries), /黑针就从侧面赶上，一把按住了防火门.*曲别针没能推开门/);
  assert.match(JSON.stringify(ending.entries), /整套材料留在值班室。曲别针带着副本和交接单的存根离开研究中心/);
});
