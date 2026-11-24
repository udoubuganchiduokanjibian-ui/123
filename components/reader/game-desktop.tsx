"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Monitor, Mail, Radio, X, FolderClosed, Minus, Square, Copy } from "lucide-react";
import { StoryPreview } from "./story-preview";
import { CameraFeed, useShiftClock } from "./camera-feed";
import { repeatMailChime } from "../../lib/reader/mail-chime";
import "./desktop.css";

type App = "inbox" | "files" | "system";
type Phase = "desktop" | "frozen" | "fault" | "online";
const frozenDuration = 780;
const faultDuration = 640;
const errorPlacements: CSSProperties[] = [
  { right: "12%", bottom: "13%" },
  { right: "8%", bottom: "10%" },
  { right: -52, bottom: "9%" },
  { left: -44, bottom: "14%" },
  { right: "4%", bottom: -25 },
  { right: -68, top: "21%" },
  { left: "8%", top: -18 },
  { right: "3%", bottom: "17%" },
];
type WindowPosition = { left: number; top: number };
const apps = [
  { id: "inbox", title: "收件箱", Icon: Mail },
  { id: "files", title: "我的文件", Icon: FolderClosed },
  { id: "system", title: "本机信息", Icon: Monitor },
] as const;

function playMailArrival(delayMs: number) {
  if (!window.AudioContext) return;
  let context: AudioContext | undefined;
  const close = () => { void context?.close().catch(() => {}); };
  try {
    context = new AudioContext();
    const stop = repeatMailChime(context, context.destination, delayMs);
    const stopAndClose = () => { stop(); close(); };
    void context.resume().catch(stopAndClose);
    return stopAndClose;
  } catch {
    close();
  }
}

function SignalSnow() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const layer = canvas.current;
    const context = layer?.getContext("2d");
    if (!layer || !context) return;
    const frame = context.createImageData(layer.width, layer.height);
    function draw() {
      const band = Math.floor(Math.random() * frame.height);
      for (let y = 0; y < frame.height; y++) {
        const scan = (y % 3 === 0 ? .8 : 1) * (Math.abs(y - band) < 3 ? 1.16 : 1);
        for (let x = 0; x < frame.width; x++) {
          const index = (y * frame.width + x) * 4;
          const noise = Math.random() ** 1.55 * scan;
          frame.data[index] = 10 + noise * 110;
          frame.data[index + 1] = 27 + noise * 143;
          frame.data[index + 2] = 62 + noise * 160;
          frame.data[index + 3] = 255;
        }
      }
      context!.putImageData(frame, 0, 0);
    }
    draw();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(draw, 95);
    return () => window.clearInterval(timer);
  }, []);
  return <div className="signal-fault" role="status" aria-label="显示信号中断">
    <canvas ref={canvas} width={256} height={160} aria-hidden="true" />
  </div>;
}

function WindowControls({ maximized, onMinimize, onMaximize, onClose }: {
  maximized: boolean;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
}) {
  const expandLabel = maximized ? "还原窗口" : "全屏窗口";
  return <div className="window-controls">
    <button type="button" aria-label="最小化窗口" title="最小化" onClick={onMinimize}><Minus /></button>
    <button type="button" aria-label={expandLabel} title={expandLabel} onClick={onMaximize}>
      {maximized ? <Copy /> : <Square />}
    </button>
    <button type="button" aria-label="关闭窗口" title="关闭" onClick={onClose}><X /></button>
  </div>;
}

export function GameDesktop() {
  const [phase, setPhase] = useState<Phase>("desktop");
  const [app, setApp] = useState<App>();
  const [utilityMinimized, setUtilityMinimized] = useState(false);
  const [utilityMaximized, setUtilityMaximized] = useState(false);
  const [monitorVisibility, setMonitorVisibility] = useState<"open" | "minimized" | "closed">("open");
  const [monitorMaximized, setMonitorMaximized] = useState(false);
  const [read, setRead] = useState(false);
  const [refusalCount, setRefusalCount] = useState(0);
  const stopMailChime = useRef<(() => void) | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const finishStory = useCallback(() => setFinished(true), []);
  const [position, setPosition] = useState<WindowPosition>();
  const [utilityPosition, setUtilityPosition] = useState<WindowPosition>();
  const monitor = useRef<HTMLElement>(null);
  const utility = useRef<HTMLElement>(null);
  const drag = useRef<{
    dx: number; dy: number; pointerId: number; target: HTMLElement;
    update: (position: WindowPosition) => void;
  } | null>(null);
  const clock = useShiftClock(false);
  const appTitle = apps.find(item => item.id === app)?.title;

  useEffect(() => () => stopMailChime.current?.(), []);

  const closeUtility = useCallback(() => {
    setApp(undefined);
    setUtilityMinimized(false);
    setUtilityMaximized(false);
    setUtilityPosition(undefined);
  }, []);

  useEffect(() => {
    if (!app || utilityMinimized) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      closeUtility();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [app, utilityMinimized, closeUtility]);

  useEffect(() => {
    if (phase !== "frozen" && phase !== "fault") return;
    const timer = setTimeout(() => setPhase(phase === "frozen" ? "fault" : "online"),
      phase === "frozen" ? frozenDuration : faultDuration);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    const reset = () => { setPosition(undefined); setUtilityPosition(undefined); };
    window.addEventListener("resize", reset);
    return () => window.removeEventListener("resize", reset);
  }, []);

  function launch(id: App) {
    if (phase === "desktop") {
      stopMailChime.current = playMailArrival(frozenDuration + faultDuration);
      setPhase("frozen");
    }
    if (phase !== "online") return;
    if (app !== id) setUtilityMaximized(false);
    setApp(id);
    setUtilityMinimized(false);
  }
  function readMail() {
    stopMailChime.current?.();
    stopMailChime.current = undefined;
    setRead(true);
  }
  function connectMonitor() {
    setRefusalCount(0);
    setPlaying(true);
    setMonitorVisibility("open");
    closeUtility();
  }
  function startDrag(e: PointerEvent<HTMLElement>, target: HTMLElement | null,
    update: (position: WindowPosition) => void) {
    if (e.button !== 0 || !e.isPrimary || !target || (e.target as Element).closest("button")) return;
    const box = target.getBoundingClientRect();
    drag.current = { dx: e.clientX - box.left, dy: e.clientY - box.top, pointerId: e.pointerId, target, update };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent<HTMLElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== e.pointerId) return;
    const { width, height } = active.target.getBoundingClientRect();
    active.update({
      left: Math.max(0, Math.min(innerWidth - width, e.clientX - active.dx)),
      top: Math.max(0, Math.min(innerHeight - height - 34, e.clientY - active.dy)),
    });
  }
  function endDrag(e: PointerEvent<HTMLElement>) {
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
  }
  return <div className={`os phase-${phase}`}>
    <div className="os-wall" aria-hidden="true">
      <div className="desktop-brand">
        <span className="desktop-brand-mark" />
        <span>岚序电脑</span>
      </div>
    </div>
    <nav className="shortcuts" aria-label="桌面软件">{apps.map(({id,title,Icon}) => {
      const unread = id === "inbox" && phase === "online" && !read;
      return <button key={id} onClick={() => launch(id)} disabled={phase === "frozen" || phase === "fault"}
        aria-label={unread ? "收件箱，1 封未读" : undefined}>
        <span className="icon-frame">
          <Icon />
          {unread && <span className="inbox-unread-badge" aria-hidden="true">1</span>}
        </span>{title}
      </button>;
    })}</nav>
    {phase === "fault" && <SignalSnow />}
    {phase === "online" && <section ref={monitor} className={`os-monitor os-window${monitorMaximized ? " is-maximized" : ""}`}
      aria-label="监控终端" hidden={monitorVisibility !== "open"}
      style={monitorMaximized ? undefined : position}>
      <header className={`window-bar${monitorMaximized ? "" : " draggable"}`}
        onPointerDown={monitorMaximized ? undefined : e => startDrag(e, monitor.current, setPosition)}
        onPointerMove={move} onLostPointerCapture={endDrag}>
        <span><Radio size={16}/> 监控终端</span>
        <div className="window-actions">
          <WindowControls maximized={monitorMaximized}
            onMinimize={() => setMonitorVisibility("minimized")}
            onMaximize={() => setMonitorMaximized(on => !on)}
            onClose={() => { setMonitorVisibility("closed"); setMonitorMaximized(false); }} />
        </div>
      </header>
      {playing ? <StoryPreview onComplete={finishStory}/> : <div className={`intercept${refusalCount ? " has-fault" : ""}`}>
        <CameraFeed sceneId="s01"/><div className="cam-caption"><b>● REC</b>　CAM / 01</div>
        <div className="cam-location">一楼档案室</div></div>}
    </section>}
    {refusalCount > 0 && <div className="connection-errors">
      <span className="sr-only" role="status">协助连接故障，累计拒绝 {refusalCount} 次。</span>
      {Array.from({ length: Math.min(refusalCount, 8) }, (_, index) => {
        const attempt = refusalCount - Math.min(refusalCount, 8) + index + 1;
        return <div key={attempt} className="os-window connection-error"
          style={errorPlacements[(attempt - 1) % errorPlacements.length]} aria-hidden="true">
          <header className="window-bar"><span>系统错误</span><span>#{String(attempt).padStart(2, "0")}</span></header>
          <p><strong aria-hidden="true">!</strong> 协助请求被拒绝，连接异常。</p>
        </div>;
      })}
    </div>}
    {app && <section ref={utility} className={`utility os-window${utilityMaximized ? " is-maximized" : ""}`}
      aria-label={appTitle} hidden={utilityMinimized} style={utilityMaximized ? undefined : utilityPosition}>
      <header className={`window-bar${utilityMaximized ? "" : " draggable"}`}
        onPointerDown={utilityMaximized ? undefined : e => startDrag(e, utility.current, setUtilityPosition)}
        onPointerMove={move} onLostPointerCapture={endDrag}>
        <span>{appTitle}</span>
        <WindowControls maximized={utilityMaximized}
          onMinimize={() => setUtilityMinimized(true)}
          onMaximize={() => setUtilityMaximized(on => !on)}
          onClose={closeUtility} />
      </header>
      <div className="utility-body">{app === "inbox" ? <>
        <small>系统邮局　/　收件箱</small>
        <button className="mail-row" onClick={readMail}>
          <Mail size={20}/><strong>强制协助通知</strong>
          <span className={`mail-status${read ? " is-read" : ""}`} role="img"
            aria-label={read ? "已读" : "未读"} title={read ? "已读" : "未读"} />
        </button>
        {read && <article><small>发件人　系统管理员</small><h2>强制协助通知</h2><p>监控通道已绑定本机。你必须协助曲别针完成今晚的调查。</p><p>留意监控中的现场记录。在他需要判断时，通过弹幕把你的建议发给他。任务期间，监控连接将保持开启。</p>
          <div className="assist-actions">
            {!playing && <button type="button" className="assist-decline"
              onClick={() => setRefusalCount(count => count + 1)}>拒绝</button>}
            <button type="button" className="assist" onClick={connectMonitor}>
              {playing ? "返回监控" : "接受并接入"}
            </button>
          </div></article>}
      </> : app === "files" ? <><small>本地磁盘　/　工作目录</small><h2>我的文件</h2>{finished ? <ul>{["完整叙事文本", "人物与世界设定", "故事分析", "弹幕交互设计"].map(name =>
          <li key={name}><a href={`/story-archive/${name}.txt`} download>{name} ↓</a></li>)}</ul> : <p>调查结束后，本次任务的剧本档案将在这里开放。</p>}</> :
        <><small>终端系统　/　设备状态</small><h2>本机信息</h2><p>工作模式　夜班值守</p><p>监控通道　已连接</p><p>关闭权限　由系统管理</p></>}</div>
    </section>}
    <footer className="os-taskbar">
      <div className="taskbar-windows">
        {monitorVisibility === "minimized" && <button onClick={() => setMonitorVisibility("open")}><Monitor size={15}/> 监控终端</button>}
        {utilityMinimized && app && <button onClick={() => setUtilityMinimized(false)}>{appTitle}</button>}
      </div>
      <div className="taskbar-tray">
        {phase === "online" && <button onClick={() => launch("inbox")}><Mail size={15}/> {read ? "收件箱" : "1 封未读"}</button>}
        <span>{phase === "frozen" || refusalCount > 0 ? "程序未响应" : phase === "fault" ? "信号中断" : clock}</span>
      </div>
    </footer>
  </div>;
}
