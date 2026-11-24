"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const width = 600;
const ground = 107;
const runnerX = 62;
const checkpoints = 9;
type Result = "ready" | "running" | "collision" | "complete";
type Run = { height: number; velocity: number; treeX: number; cleared: number };
const startRun = (): Run => ({ height: 0, velocity: 0, treeX: width - 30, cleared: 0 });

function draw(ctx: CanvasRenderingContext2D, run: Run) {
  ctx.fillStyle = "#e6eef0";
  ctx.fillRect(0, 0, width, 125);
  ctx.fillStyle = "#b6cad0";
  ctx.fillRect(0, 83, width, 3);
  ctx.fillStyle = "#6a8792";
  ctx.fillRect(0, ground, width, 2);

  const x = Math.round(run.treeX);
  ctx.fillStyle = "#6d5b52";
  ctx.fillRect(x + 9, ground - 15, 6, 15);
  ctx.fillStyle = "#377359";
  ctx.fillRect(x + 7, ground - 30, 10, 18);
  ctx.fillRect(x + 3, ground - 24, 18, 11);
  ctx.fillRect(x, ground - 18, 24, 7);

  const y = Math.round(ground - run.height - 23);
  ctx.fillStyle = "#26597b";
  ctx.fillRect(runnerX, y + 4, 21, 15);
  ctx.fillRect(runnerX + 5, y, 12, 4);
  ctx.fillRect(runnerX + 2, y + 19, 5, 4);
  ctx.fillRect(runnerX + 14, y + 19, 5, 4);
  ctx.fillStyle = "#d7f9ff";
  ctx.fillRect(runnerX + 11, y + 8, 6, 4);
}

export function ArchiveRunner({ active }: { active: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const run = useRef(startRun());
  const [result, setResult] = useState<Result>("ready");
  const [cleared, setCleared] = useState(0);
  const jump = useCallback(() => {
    if (result !== "running") {
      run.current = startRun();
      setCleared(0);
      setResult("running");
    }
    if (run.current.height === 0) run.current.velocity = 425;
  }, [result]);

  useEffect(() => {
    if (!active) return;
    function press(event: KeyboardEvent) {
      if (event.code !== "Space" || event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof Element) {
        if (target.closest("input, textarea, [contenteditable], select, a")) return;
        if (target.closest("button") && !target.closest(".archive-runner, .taskbar-browser, .taskbar-windows")) return;
      }
      event.preventDefault();
      if (!event.repeat) jump();
    }
    window.addEventListener("keydown", press);
    return () => window.removeEventListener("keydown", press);
  }, [active, jump]);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    draw(ctx, run.current);
    if (!active || result !== "running") return;
    let frame: number;
    let lastTime: number | undefined;
    function animate(now: number) {
      const dt = lastTime === undefined ? 0 : Math.min(0.033, (now - lastTime) / 1000);
      lastTime = now;
      const state = run.current;
      if (state.velocity || state.height) {
        state.height = Math.max(0, state.height + state.velocity * dt);
        state.velocity = state.height ? state.velocity - 1180 * dt : 0;
      }
      state.treeX -= (230 + Math.floor(state.cleared / 3) * 36) * dt;
      draw(ctx!, state);
      if (state.treeX < runnerX + 19 && state.treeX + 22 > runnerX + 2 && state.height < 27) {
        setResult("collision");
        return;
      }
      if (state.treeX + 24 < 0) {
        state.cleared++;
        setCleared(state.cleared);
        if (state.cleared === checkpoints) {
          setResult("complete");
          return;
        }
        state.treeX = width - (state.cleared % 2 ? 92 : 45);
      }
      frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [active, result]);

  return <section className="archive-runner" aria-label="夜班越野">
    <div className="archive-runner-heading">
      <strong>夜班越野</strong>
      <span>第 {Math.min(3, Math.floor(cleared / 3) + 1)} 关</span>
    </div>
    <canvas ref={canvas} width={width} height={125} aria-hidden="true" />
    <div className="archive-runner-controls">
      <span role="status">{result === "collision" ? "撞到了树，再试一次。" :
        result === "complete" ? "三关全部通过。" : "按空格跳过树木"}</span>
      <button type="button" onClick={jump}>{result === "ready" ? "开始" : result === "running" ? "跳跃" : "重玩"}</button>
    </div>
  </section>;
}
