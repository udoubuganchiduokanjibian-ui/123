import { useEffect, useRef, useState, type RefObject } from "react";
import {
  CAMERA_HEIGHT, CAMERA_WIDTH, drawFigure, drawFlashlight, drawInterference, drawShell,
  pursuerLook, sceneProps, type Drawable,
} from "../../lib/reader/camera-scene";
import { cueFor } from "../../lib/reader/camera-staging";
import "./camera-wall.css";

const channels = [
  { id: "s01", title: "一楼档案室" },
  { id: "s02", title: "一楼走廊、办公区与楼梯间" },
  { id: "s03", title: "二楼观察室与实验区" },
  { id: "s04", title: "二楼实验区走廊" },
  { id: "s05", title: "地下设备室" },
  { id: "s06", title: "地下走廊与一楼大厅" },
] as const;

type Channel = typeof channels[number]["id"];
type Surface = RefObject<HTMLCanvasElement | null>;

// These existing story beats describe moving light outside the current camera.
const offscreenSightings = [
  { scene: "s01", event: "e008", channel: "s02", from: 34, to: 136 },
  { scene: "s03", event: "e029", channel: "s04", from: 192, to: 74 },
] as const;
type Sighting = typeof offscreenSightings[number];

function WallFootage({ channel, source, sighting }: {
  channel: Channel;
  source?: Surface;
  sighting?: Sighting;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const scene = Number(channel.slice(1));
    const room = document.createElement("canvas");
    room.width = CAMERA_WIDTH;
    room.height = CAMERA_HEIGHT;
    const background = room.getContext("2d");
    if (!background) return;
    drawShell(background, scene);
    const props = sceneProps(scene);
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const openedAt = performance.now();
    let last = -Infinity;
    let frame = 0;

    function render(now: number) {
      frame = requestAnimationFrame(render);
      if (now - last < 1000 / 12 || !ctx) return;
      last = now;
      if (source?.current) {
        ctx.drawImage(source.current, 0, 0);
        return;
      }
      ctx.drawImage(room, 0, 0);
      const layers: Drawable[] = [...props];
      if (sighting) {
        const progress = reducedMotion.matches ? 1 : Math.min(1, (now - openedAt) / 2300);
        const fx = sighting.from + (sighting.to - sighting.from) * progress;
        const fy = 122;
        const face = sighting.to > sighting.from ? 1 : -1;
        layers.push({ baseY: fy, draw: target => {
          drawFigure(target, { fx, fy, face, pose: "stand", step: progress * 19,
            walking: progress < 1, look: pursuerLook, tick: Math.floor(now / 83) });
          drawFlashlight(target, fx, fy, face, now);
        } });
      }
      layers.sort((a, b) => a.baseY - b.baseY).forEach(layer => layer.draw(ctx));
      if (!reducedMotion.matches) drawInterference(ctx, now, Math.random);
    }

    render(openedAt);
    return () => cancelAnimationFrame(frame);
  }, [channel, sighting, source]);

  return <canvas ref={canvas} className="camera-image" width={CAMERA_WIDTH} height={CAMERA_HEIGHT} aria-hidden="true" />;
}

export function CameraWall({ sceneId, eventIds, surface }: {
  sceneId: string;
  eventIds?: readonly string[];
  surface: Surface;
}) {
  const [focused, setFocused] = useState<Channel>();
  const cue = cueFor(sceneId, eventIds ?? []);
  const latestEvent = eventIds?.at(-1);
  const sighting = offscreenSightings.find(item => item.scene === sceneId && item.event === latestEvent);

  return <div className="camera-wall" role="group" aria-label="多路监控">
    <div className="camera-wall-viewport">
      <div className={`camera-wall-grid${focused ? " is-focused" : ""}`}>
        {channels.map(channel => {
          const selected = channel.id === focused;
          const live = channel.id === sceneId;
          const onThisChannel = sighting?.channel === channel.id ? sighting : undefined;
          const label = [channel.title, live && !cue?.qu.exit ? "曲别针" : "",
            onThisChannel || (live && cue?.hei) ? "黑针" : ""].filter(Boolean).join("，");
          return <button type="button" key={channel.id} className="camera-wall-tile"
            hidden={!!focused && !selected}
            aria-label={selected ? `${label}，返回多路画面` : `放大${label}镜头`}
            onClick={() => setFocused(selected ? undefined : channel.id)}
            onKeyDown={event => {
              if (selected && event.key === "Escape") {
                event.preventDefault();
                setFocused(undefined);
              }
            }}>
            <WallFootage channel={channel.id} source={live ? surface : undefined} sighting={onThisChannel} />
            <span className="reader-crt" aria-hidden="true" />
            <span className="camera-wall-location" aria-hidden="true">{channel.title}</span>
          </button>;
        })}
      </div>
    </div>
  </div>;
}
