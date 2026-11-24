import studyCamera from "../../design/reader-crt-study/study-camera.png";
import { CameraFeed, useShiftClock } from "./camera-feed";

export function StudyFeed({ scene, sceneId, eventIds, channelOpen }: {
  scene?: string;
  sceneId?: string;
  eventIds?: readonly string[];
  channelOpen?: boolean;
}) {
  const clock = useShiftClock();
  const live = sceneId && /^s0[1-6]$/.test(sceneId);
  return (
    <div className="reader-feed" id="reader-feed">
      {live && <CameraFeed sceneId={sceneId} eventIds={eventIds} />}
      {scene === "书房" && <img src={studyCamera.src} width={studyCamera.width} height={studyCamera.height} alt="书房示意图，旧门旁的桌面上摆着一张便签。" />}
      <div className="reader-crt" aria-hidden="true" />
      <div className="reader-feed-top reader-meta" aria-hidden="true">
        <span className="reader-rec">● REC</span>
        {channelOpen && <span className="reader-feed-alert">弹幕通道已开放</span>}
      </div>
      {scene && <span className="reader-camera-location reader-meta">{scene}</span>}
      <div className="reader-feed-label reader-meta">
        <span>{scene === "书房" ? "场景示意" : sceneId ? "监控中" : "正在连接"}</span>
        <time>{clock}</time>
      </div>
    </div>
  );
}

const clock = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

export function formatTime(timestamp: string) {
  return clock.format(new Date(timestamp));
}
