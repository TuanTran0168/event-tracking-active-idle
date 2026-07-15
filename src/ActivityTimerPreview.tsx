import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActivityState } from "./activity-detector";
import { useActivityDetector } from "./useActivityDetector";
import { useInputMonitor, type MonitoredInputEvent } from "./useInputMonitor";

type StateLog = { id: string; state: ActivityState; timestamp: number };
type InputLog = { id: string; eventName: MonitoredInputEvent; timestamp: number; handled: boolean };
type Thresholds = { idleTimeout: number; visibilityDebounce: number; inputThrottle: number };

const DEFAULT_THRESHOLDS: Thresholds = {
  idleTimeout: 10_000,
  visibilityDebounce: 3_000,
  inputThrottle: 250,
};

const EVENT_LABELS: Record<MonitoredInputEvent, string> = {
  mousemove: "Di chuyển chuột",
  click: "Nhấp chuột",
  scroll: "Cuộn trang",
  wheel: "Lăn chuột / zoom",
  keydown: "Nhấn phím",
  touchstart: "Chạm màn hình",
};

const formatTime = (timestamp: number) =>
  `${new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp)}.${String(timestamp % 1000).padStart(3, "0")}`;

function NumberControl({ label, hint, value, onChange }: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="number-control">
      <span>{label}</span>
      <input
        aria-label={label}
        min="0"
        step="50"
        type="number"
        value={value}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
      />
      <small>{hint}</small>
    </label>
  );
}

export function ActivityTimerPreview() {
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [stateLogs, setStateLogs] = useState<StateLog[]>([]);
  const [inputLogs, setInputLogs] = useState<InputLog[]>([]);
  const [latestInput, setLatestInput] = useState<InputLog | null>(null);
  const [lastTransitionAt, setLastTransitionAt] = useState<number | null>(null);

  const handleStateChange = useCallback((nextState: ActivityState, timestamp: number) => {
    const payload = { state: nextState, timestamp: new Date(timestamp).toISOString() };

    // Thay bằng request tới tracking API khi tích hợp vào sản phẩm.
    console.log("[tracking] activity state changed", payload);

    setLastTransitionAt(timestamp);
    setStateLogs((current) => [
      { id: `${timestamp}-${nextState}`, state: nextState, timestamp },
      ...current,
    ].slice(0, 6));
  }, []);

  const handleInput = useCallback((eventName: MonitoredInputEvent, timestamp: number, handled: boolean) => {
    const input = { id: `${timestamp}-${eventName}-${Math.random()}`, eventName, timestamp, handled };
    setLatestInput(input);
    setInputLogs((current) => [
      input,
      ...current,
    ].slice(0, 8));
  }, []);

  const state = useActivityDetector({
    ...thresholds,
    onStateChange: handleStateChange,
  });
  useInputMonitor(thresholds.inputThrottle, handleInput);
  const isActive = state === "active";
  const timeoutInSeconds = useMemo(() => (thresholds.idleTimeout / 1000).toFixed(1), [thresholds.idleTimeout]);

  useEffect(() => {
    document.title = `${isActive ? "Đang hoạt động" : "Đang rảnh"} · Activity detector`;
  }, [isActive]);

  const updateThreshold = (key: keyof Thresholds, value: number) => {
    setThresholds((current) => ({ ...current, [key]: value }));
  };

  const dispatchDemoInput = () => window.dispatchEvent(new Event("mousemove"));

  return (
    <main className="page-shell">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">Activity detector playground</p>
        <h1 id="page-title">Theo dõi hoạt động người dùng trực quan hơn.</h1>
        <p className="intro">
          Rê chuột, click, cuộn, lăn chuột/zoom, gõ phím hoặc đổi tab để kiểm tra hook. Event vừa nhận và state transition đều hiện ngay bên dưới.
        </p>
      </section>

      <section className="playground" aria-label="Khu vực xem trước Activity detector">
        <div className="status-panel">
          <p className="panel-label">Event hiện tại</p>
          <div className={`state-orb ${isActive ? "is-active" : "is-idle"}`} aria-live="polite">
            <span className="orb-pulse" />
            <strong>{latestInput ? EVENT_LABELS[latestInput.eventName] : "Chưa có event"}</strong>
            <small>{latestInput ? <><code>{latestInput.eventName}</code> · {latestInput.handled ? "Đã xử lý" : "Throttle"}</> : "Rê chuột, click hoặc cuộn để bắt đầu"}</small>
          </div>
          <span className={`state-badge ${isActive ? "active" : "idle"}`}>State: {isActive ? "ACTIVE" : "IDLE"}</span>
          <p className="status-caption">
            {latestInput ? `Nhận lúc: ${formatTime(latestInput.timestamp)}` : lastTransitionAt ? `Đổi state lần cuối: ${formatTime(lastTransitionAt)}` : "Hãy tương tác để bắt đầu kiểm tra."}
          </p>
        </div>

        <div className="config-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-label">Cấu hình trực tiếp</p>
              <h2>Props</h2>
            </div>
            <button className="ghost-button" type="button" onClick={() => setThresholds(DEFAULT_THRESHOLDS)}>Khôi phục</button>
          </div>

          <div className="preset-row" aria-label="Cấu hình nhanh">
            <span>Thiết lập nhanh:</span>
            <button type="button" onClick={() => setThresholds({ idleTimeout: 3_000, visibilityDebounce: 1_000, inputThrottle: 100 })}>Test nhanh</button>
            <button type="button" onClick={() => setThresholds(DEFAULT_THRESHOLDS)}>Mặc định</button>
          </div>

          <div className="controls">
            <NumberControl label="Idle timeout (ms)" hint="Không có input sau thời gian này sẽ thành IDLE." value={thresholds.idleTimeout} onChange={(value) => updateThreshold("idleTimeout", value)} />
            <NumberControl label="Visibility debounce (ms)" hint="Tab hidden quá thời gian này sẽ thành IDLE." value={thresholds.visibilityDebounce} onChange={(value) => updateThreshold("visibilityDebounce", value)} />
            <NumberControl label="Input throttle (ms)" hint="Khoảng cách tối thiểu giữa các input được xử lý." value={thresholds.inputThrottle} onChange={(value) => updateThreshold("inputThrottle", value)} />
          </div>

          <div className="action-row">
            <button className="primary-button" type="button" onClick={dispatchDemoInput}>Gửi event demo</button>
            <p>Idle timeout hiện tại: <strong>{timeoutInSeconds}s</strong></p>
          </div>
        </div>
      </section>

      <section className="lower-grid">
        <article className="card instructions-card">
          <p className="panel-label">Cách kiểm tra</p>
          <h2>4 kịch bản chính</h2>
          <ol>
            <li>Rê chuột hoặc click để chuyển sang <strong>ACTIVE</strong>.</li>
            <li>Dừng tương tác để detector chuyển sang <strong>IDLE</strong>.</li>
            <li>Đổi tab rồi quay lại trước <code>Visibility debounce</code>: không có state transition.</li>
            <li>Giữ tab hidden quá debounce: detector ghi nhận <strong>IDLE</strong>.</li>
          </ol>
        </article>

        <article className="card event-card">
          <div className="panel-heading">
            <div><p className="panel-label">Tracking preview</p><h2>State transition</h2></div>
            <button className="text-button" type="button" onClick={() => setStateLogs([])}>Xóa log</button>
          </div>
          {stateLogs.length === 0 ? <p className="empty-log">Chưa có transition. Mở DevTools để xem payload tracking qua console.log.</p> : (
            <ul className="event-list">
              {stateLogs.map((event) => <li key={event.id}><span className={`dot ${event.state}`} /><strong>{event.state}</strong><time dateTime={new Date(event.timestamp).toISOString()}>{formatTime(event.timestamp)}</time></li>)}
            </ul>
          )}
        </article>

        <article className="card input-card">
          <div className="panel-heading">
            <div><p className="panel-label">Event monitor</p><h2>Input vừa nhận</h2></div>
            <button className="text-button" type="button" onClick={() => setInputLogs([])}>Xóa log</button>
          </div>
          {inputLogs.length === 0 ? <p className="empty-log">Chưa có input. Thử rê chuột, click, cuộn hoặc lăn chuột/zoom.</p> : (
            <ul className="input-list">
              {inputLogs.map((event) => (
                <li key={event.id}>
                  <span className={`handled-badge ${event.handled ? "handled" : "throttled"}`}>{event.handled ? "Đã xử lý" : "Throttle"}</span>
                  <strong>{EVENT_LABELS[event.eventName]}</strong>
                  <code>{event.eventName}</code>
                  <time dateTime={new Date(event.timestamp).toISOString()}>{formatTime(event.timestamp)}</time>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </main>
  );
}
