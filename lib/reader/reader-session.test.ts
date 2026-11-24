import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { POST } from "../../app/api/reader/route.ts";
import { getReaderSession, type ReaderView } from "./reader-session.ts";

// These scenarios exercise the locked-study fixture and its scripted provider.
process.env.READER_STORY_PACK = "reader-demo";
process.env.READER_LLM_PROVIDER = "mock";

async function request(body: object) {
  return POST(new Request("http://localhost/api/reader", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

async function send(body: object): Promise<ReaderView> {
  const response = await request(body);
  assert.equal(response.status, 200);
  return response.json();
}

function step({ id, revision }: ReaderView) {
  return send({ action: "step", id, revision });
}

test("Reader accepts the browser host when Next normalizes the request URL", async () => {
  const response = await POST(new Request("http://localhost:3000/api/reader", {
    method: "POST",
    headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
    body: JSON.stringify({ action: "start" }),
  }));
  assert.equal(response.status, 200);
});

test("Reader starts, investigates, waits for input, resumes and ends through the Mock Provider", async () => {
  const start = await send({ action: "start" });
  assert.equal(start.character, "曲别针");
  assert.equal(start.mode, "advancing");
  assert.match(JSON.stringify(start.entries), /我是曲别针/);
  assert.ok(!("state" in start));

  const waiting = await step(start);
  assert.equal(waiting.mode, "waiting_for_player");
  assert.match(JSON.stringify(waiting.entries), /锁舌缩回一点/);
  assert.deepEqual(await step(start), waiting);
  assert.deepEqual(await step(waiting), waiting);

  const submit = (text: string) => send({ action: "danmaku", id: start.id, requestId: randomUUID(), text });
  // Two unproductive rounds keep the moment open; a third would let it pass (tested below).
  for (const [text, decision] of [["看看", "question"], ["一定有人", "reject"]]) {
    const response = await submit(text);
    assert.ok(response.entries.some(entry => entry.type === "narrative_block" &&
      entry.content.kind === "decision" && entry.content.decision === decision));
    assert.equal((await step(response)).mode, "waiting_for_player");
  }
  const command = { action: "danmaku", id: start.id, requestId: randomUUID(), text: "翻看便签背面" };
  const resumed = await send(command);
  assert.equal(resumed.mode, "advancing");
  assert.match(JSON.stringify(resumed.entries), /"decision":"accept"/);
  assert.deepEqual(await send(command), resumed);

  const open = await step(resumed);
  const ending = await step(open);
  assert.equal(ending.mode, "completed");
  assert.deepEqual(await step(ending), ending);
  assert.deepEqual(await submit("继续"), ending);
  assert.equal(ending.entries.at(-1)?.type, "session_completed");

  const timeline = getReaderSession(start.id)?.engine.getSnapshot().timeline ?? [];
  const executed = timeline.filter(entry => entry.type === "autonomous_action_executed");
  assert.equal(executed.length, 2);
  for (const action of executed) {
    assert.equal(timeline.find(entry => entry.id === action.causedBy)?.type, "autonomous_action_proposed");
  }
});

test("Messages queued before the autonomous step are consumed by the engine in FIFO order", async () => {
  const start = await send({ action: "start" });
  const first = await send({ action: "danmaku", id: start.id, requestId: randomUUID(), text: "看看" });
  const second = await send({ action: "danmaku", id: start.id, requestId: randomUUID(), text: "翻看便签背面" });
  assert.equal(first.entries.at(-1)?.type, "danmaku_submitted");
  assert.equal(second.entries.at(-1)?.type, "danmaku_submitted");
  const investigated = await step(second);
  assert.equal(investigated.mode, "advancing");
  assert.equal(investigated.entries.filter(entry => entry.type === "autonomous_action_executed").length, 1);
  const decided = await step(investigated);
  const decisions = decided.entries.flatMap(entry => entry.type === "narrative_block" &&
    entry.content.kind === "decision" ? [entry.content.decision] : []);
  assert.deepEqual(decisions, ["question", "accept"]);
});

test("After three suggestions that lead nowhere, the protagonist acts on his own", async () => {
  const start = await send({ action: "start" });
  const waiting = await step(start);
  assert.equal(waiting.mode, "waiting_for_player");
  const submit = (text: string) => send({ action: "danmaku", id: start.id, requestId: randomUUID(), text });
  let view = waiting;
  for (const text of ["看看", "一定有人", "便签也许有关"]) {
    view = await submit(text);
    view = await step(view);
  }
  assert.notEqual(view.mode, "waiting_for_player");
  assert.ok(view.entries.some(entry => entry.type === "autonomous_action_executed"));
});
