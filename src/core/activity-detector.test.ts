import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createActivityDetector,
  type ActivityDetector,
  type ActivityDetectorOptions,
  type ActivityState,
} from "./activity-detector";

type StateChangeCallback = (
  state: ActivityState,
  timestamp: number,
  since: number,
) => void;

function setVisibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value,
    configurable: true,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("createActivityDetector", () => {
  let detector: ActivityDetector | null = null;
  let onStateChange: ReturnType<typeof vi.fn<StateChangeCallback>>;

  function makeDetector(overrides: Partial<ActivityDetectorOptions> = {}) {
    detector = createActivityDetector({
      idleTimeout: 1000,
      visibilityDebounce: 1000,
      inputThrottle: 0,
      onStateChange,
      ...overrides,
    });
    return detector;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility("visible");
    onStateChange = vi.fn<StateChangeCallback>();
  });

  afterEach(() => {
    detector?.destroy();
    detector = null;
    vi.useRealTimers();
  });

  it("req1: chuyển sang active khi có input từ idle, kèm timestamp", () => {
    const d = makeDetector();

    window.dispatchEvent(new Event("mousemove"));

    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith("active", expect.any(Number), expect.any(Number));
    expect(d.getState()).toBe("active");
  });

  it("req2: chuyển idle sau khi hết idleTimeout không có input", () => {
    const d = makeDetector({ idleTimeout: 500 });

    window.dispatchEvent(new Event("keydown"));
    onStateChange.mockClear();

    vi.advanceTimersByTime(500);

    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith("idle", expect.any(Number), expect.any(Number));
    expect(d.getState()).toBe("idle");
  });

  it("req3: không đổi state nếu tab visible lại trước khi hết debounce", () => {
    const d = makeDetector({ idleTimeout: 100_000, visibilityDebounce: 1000 });

    window.dispatchEvent(new Event("click"));
    onStateChange.mockClear();

    setVisibility("hidden");
    vi.advanceTimersByTime(500);
    setVisibility("visible");
    vi.advanceTimersByTime(1000);

    expect(onStateChange).not.toHaveBeenCalled();
    expect(d.getState()).toBe("active");
  });

  it("req4: chuyển idle khi mất focus kéo dài quá debounce", () => {
    const d = makeDetector({ idleTimeout: 100_000, visibilityDebounce: 1000 });

    window.dispatchEvent(new Event("click"));
    onStateChange.mockClear();

    setVisibility("hidden");
    vi.advanceTimersByTime(1000);

    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith("idle", expect.any(Number), expect.any(Number));
    expect(d.getState()).toBe("idle");
  });

  it("req5: không gọi callback trùng khi nhiều input liên tiếp không đổi state", () => {
    makeDetector({ inputThrottle: 0 });

    window.dispatchEvent(new Event("mousemove"));
    onStateChange.mockClear();

    window.dispatchEvent(new Event("mousemove"));
    window.dispatchEvent(new Event("keydown"));
    window.dispatchEvent(new Event("click"));

    expect(onStateChange).not.toHaveBeenCalled();
  });

  it("req6: throttle input, event trong khoảng throttle không reset lại idle timer", () => {
    makeDetector({ idleTimeout: 10_000, inputThrottle: 300 });

    window.dispatchEvent(new Event("mousemove")); // input đầu tiên, luôn được xử lý
    onStateChange.mockClear();

    vi.advanceTimersByTime(100);
    window.dispatchEvent(new Event("mousemove")); // trong khoảng throttle -> bị bỏ qua

    vi.advanceTimersByTime(100);
    window.dispatchEvent(new Event("mousemove")); // vẫn trong khoảng throttle -> bị bỏ qua

    // nếu 2 input trên bị bỏ qua, idle timer không được reset -> vẫn hết hạn đúng 10_000ms
    // kể từ input đầu tiên, không phải muộn hơn
    vi.advanceTimersByTime(9_800);

    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith("idle", expect.any(Number), expect.any(Number));
  });

  it("req7: ngưỡng cấu hình được, thay đổi giá trị thì hành vi thay đổi theo", () => {
    const onStateChangeA = vi.fn<StateChangeCallback>();
    const detectorA = createActivityDetector({
      idleTimeout: 100,
      visibilityDebounce: 100,
      inputThrottle: 0,
      onStateChange: onStateChangeA,
    });
    window.dispatchEvent(new Event("click"));
    vi.advanceTimersByTime(100);
    expect(onStateChangeA).toHaveBeenCalledWith("idle", expect.any(Number), expect.any(Number));
    detectorA.destroy();

    const onStateChangeB = vi.fn<StateChangeCallback>();
    const detectorB = createActivityDetector({
      idleTimeout: 300,
      visibilityDebounce: 100,
      inputThrottle: 0,
      onStateChange: onStateChangeB,
    });
    window.dispatchEvent(new Event("click"));
    vi.advanceTimersByTime(100); // chưa đủ 300ms của config B
    expect(onStateChangeB).not.toHaveBeenCalledWith(
      "idle",
      expect.any(Number),
      expect.any(Number),
    );
    vi.advanceTimersByTime(200); // đủ 300ms
    expect(onStateChangeB).toHaveBeenCalledWith("idle", expect.any(Number), expect.any(Number));
    detectorB.destroy();
  });

  it("bug: idleTimeout ngắn hơn visibilityDebounce không được làm state đổi khi hidden rồi visible lại trước debounce", () => {
    const d = makeDetector({ idleTimeout: 50, visibilityDebounce: 500 });

    window.dispatchEvent(new Event("click"));
    onStateChange.mockClear();

    setVisibility("hidden");
    vi.advanceTimersByTime(200); // đã vượt idleTimeout (50ms) nhưng chưa hết visibilityDebounce (500ms)
    setVisibility("visible"); // quay lại trước khi hết debounce

    expect(onStateChange).not.toHaveBeenCalled();
    expect(d.getState()).toBe("active");
  });

  it("bug: sau khi visible lại trước debounce, idle timer phải được lên lịch lại (không kẹt active mãi mãi)", () => {
    const d = makeDetector({ idleTimeout: 1000, visibilityDebounce: 5000 });

    window.dispatchEvent(new Event("click"));
    onStateChange.mockClear();

    setVisibility("hidden");
    vi.advanceTimersByTime(100); // còn trong khoảng debounce (5000ms)
    setVisibility("visible"); // quay lại trước debounce, không có input mới sau đó

    vi.advanceTimersByTime(1000); // đủ idleTimeout kể từ lúc visible lại

    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith("idle", expect.any(Number), expect.any(Number));
    expect(d.getState()).toBe("idle");
  });

  it("cleanup nội bộ: idle timer đã tự nổ thì updateOptions không được tạo thêm timer thừa", () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const d = makeDetector({ idleTimeout: 100 });

    window.dispatchEvent(new Event("click"));
    vi.advanceTimersByTime(100); // idle timer tự nổ, state đã về idle
    expect(d.getState()).toBe("idle");

    const callsBeforeUpdate = setTimeoutSpy.mock.calls.length;
    d.updateOptions({ idleTimeout: 200 });

    expect(setTimeoutSpy.mock.calls.length).toBe(callsBeforeUpdate);
  });

  it("validate config: throw khi idleTimeout/visibilityDebounce/inputThrottle âm hoặc NaN", () => {
    expect(() =>
      createActivityDetector({
        idleTimeout: -1,
        visibilityDebounce: 1000,
        inputThrottle: 0,
        onStateChange,
      }),
    ).toThrow();

    expect(() =>
      createActivityDetector({
        idleTimeout: 1000,
        visibilityDebounce: NaN,
        inputThrottle: 0,
        onStateChange,
      }),
    ).toThrow();
  });

  it("validate config: updateOptions throw khi truyền giá trị âm/NaN và không áp dụng field hợp lệ khác trong cùng lần gọi", () => {
    const d = makeDetector({ idleTimeout: 1000 });

    expect(() =>
      d.updateOptions({ idleTimeout: 500, visibilityDebounce: -5 }),
    ).toThrow();

    // idleTimeout không được cập nhật thành 500 vì cả lần gọi bị từ chối (atomic)
    onStateChange.mockClear();
    window.dispatchEvent(new Event("click"));
    onStateChange.mockClear();
    vi.advanceTimersByTime(999);
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it("req8: huỷ toàn bộ listener và timer khi destroy, không leak callback", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const docRemoveSpy = vi.spyOn(document, "removeEventListener");
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");

    const d = makeDetector();
    const registeredEvents = addSpy.mock.calls.map(([eventName]) => eventName);

    window.dispatchEvent(new Event("mousemove")); // khởi động idle timer
    d.destroy();

    for (const eventName of registeredEvents) {
      expect(removeSpy).toHaveBeenCalledWith(
        eventName,
        expect.any(Function),
        expect.objectContaining({ capture: true }),
      );
    }
    expect(docRemoveSpy).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
    expect(clearSpy).toHaveBeenCalled();

    onStateChange.mockClear();
    vi.advanceTimersByTime(100_000);
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it("cleanup: huỷ visibility timer đang chờ khi destroy lúc tab đang hidden", () => {
    const d = makeDetector({ idleTimeout: 50, visibilityDebounce: 5000 });

    window.dispatchEvent(new Event("click"));
    setVisibility("hidden"); // idle timer bị clear tự động, visibility timer bắt đầu chạy
    onStateChange.mockClear();

    d.destroy();

    vi.advanceTimersByTime(10_000);
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it("gap: wheel event vẫn kích hoạt active dù bị stopPropagation() ở phần tử con (vd canvas zoom)", () => {
    const d = makeDetector();
    const child = document.createElement("div");
    document.body.appendChild(child);
    child.addEventListener("wheel", (event) => event.stopPropagation());

    child.dispatchEvent(new Event("wheel", { bubbles: true, cancelable: true }));

    expect(onStateChange).toHaveBeenCalledWith("active", expect.any(Number), expect.any(Number));
    expect(d.getState()).toBe("active");

    document.body.removeChild(child);
  });

  it("setSuspended(true): ép state về idle ngay lập tức dù đang active", () => {
    const d = makeDetector();
    window.dispatchEvent(new Event("click"));
    expect(d.getState()).toBe("active");
    onStateChange.mockClear();

    d.setSuspended(true);

    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith("idle", expect.any(Number), expect.any(Number));
    expect(d.getState()).toBe("idle");
  });

  it("setSuspended(true): bỏ qua input trong lúc suspend, không quay lại active", () => {
    const d = makeDetector();
    window.dispatchEvent(new Event("click"));
    d.setSuspended(true);
    onStateChange.mockClear();

    window.dispatchEvent(new Event("mousemove"));
    window.dispatchEvent(new Event("keydown"));

    expect(onStateChange).not.toHaveBeenCalled();
    expect(d.getState()).toBe("idle");
  });

  it("setSuspended(true): bỏ qua luôn visibilitychange trong lúc suspend", () => {
    const d = makeDetector({ idleTimeout: 100_000, visibilityDebounce: 100 });
    window.dispatchEvent(new Event("click"));
    d.setSuspended(true);
    onStateChange.mockClear();

    setVisibility("hidden");
    vi.advanceTimersByTime(200);

    expect(onStateChange).not.toHaveBeenCalled();
    expect(d.getState()).toBe("idle");
  });

  it("setSuspended(false): resume nhưng không tự nhảy về active, chờ input thật", () => {
    const d = makeDetector();
    window.dispatchEvent(new Event("click"));
    d.setSuspended(true);
    onStateChange.mockClear();

    d.setSuspended(false);

    expect(onStateChange).not.toHaveBeenCalled();
    expect(d.getState()).toBe("idle");
  });

  it("setSuspended(false) rồi có input thật: chuyển active bình thường, không bị kẹt do input rò rỉ lúc suspend", () => {
    const d = makeDetector();
    window.dispatchEvent(new Event("click"));
    d.setSuspended(true);

    // input "rò rỉ" trong lúc suspend (vd user thao tác trong dialog) không được tính
    window.dispatchEvent(new Event("mousemove"));

    d.setSuspended(false);
    onStateChange.mockClear();

    window.dispatchEvent(new Event("click"));

    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith("active", expect.any(Number), expect.any(Number));
    expect(d.getState()).toBe("active");
  });

  it("setSuspended: gọi lại cùng giá trị true không bắn callback trùng (dedup)", () => {
    const d = makeDetector();
    d.setSuspended(true);
    onStateChange.mockClear();

    d.setSuspended(true);

    expect(onStateChange).not.toHaveBeenCalled();
  });

  it("setSuspended(true) khi đã idle sẵn: không bắn callback trùng", () => {
    makeDetector();
    // chưa có input nào, đang idle sẵn

    detector!.setSuspended(true);

    expect(onStateChange).not.toHaveBeenCalled();
  });

  it("req1b: từng loại input event trong spec đều kích hoạt active", () => {
    const eventNames = [
      "mousemove",
      "keydown",
      "scroll",
      "touchstart",
      "click",
      "wheel",
    ];

    for (const eventName of eventNames) {
      const cb = vi.fn<StateChangeCallback>();
      const d = createActivityDetector({
        idleTimeout: 1000,
        visibilityDebounce: 1000,
        inputThrottle: 0,
        onStateChange: cb,
      });

      window.dispatchEvent(new Event(eventName));

      expect(cb).toHaveBeenCalledWith("active", expect.any(Number), expect.any(Number));
      d.destroy();
    }
  });

  it("since: active luôn bằng timestamp (chuyển tức thời, không có blind floor)", () => {
    makeDetector();

    window.dispatchEvent(new Event("mousemove"));

    expect(onStateChange).toHaveBeenCalledTimes(1);
    const [, timestamp, since] = onStateChange.mock.calls[0];
    expect(since).toBe(timestamp);
  });

  it("since: idle do hết idleTimeout = mốc input thật cuối, nhỏ hơn timestamp đúng bằng idleTimeout", () => {
    makeDetector({ idleTimeout: 500 });

    const inputAt = Date.now();
    window.dispatchEvent(new Event("keydown"));
    onStateChange.mockClear();

    vi.advanceTimersByTime(500);

    expect(onStateChange).toHaveBeenCalledTimes(1);
    const [state, timestamp, since] = onStateChange.mock.calls[0];
    expect(state).toBe("idle");
    expect(since).toBe(inputAt);
    expect(timestamp - since).toBe(500);
  });

  it("since: idle do visibilityDebounce = mốc tab bị ẩn, nhỏ hơn timestamp đúng bằng visibilityDebounce", () => {
    makeDetector({ idleTimeout: 100_000, visibilityDebounce: 1000 });

    window.dispatchEvent(new Event("click"));
    onStateChange.mockClear();

    const hiddenAt = Date.now();
    setVisibility("hidden");
    vi.advanceTimersByTime(1000);

    expect(onStateChange).toHaveBeenCalledTimes(1);
    const [state, timestamp, since] = onStateChange.mock.calls[0];
    expect(state).toBe("idle");
    expect(since).toBe(hiddenAt);
    expect(timestamp - since).toBe(1000);
  });

  it("since: ẩn/hiện tab lại trước debounce không có input mới -> since vẫn là mốc input thật gốc, không phải mốc hiện tab lại", () => {
    makeDetector({ idleTimeout: 1000, visibilityDebounce: 5000 });

    const inputAt = Date.now();
    window.dispatchEvent(new Event("click"));
    onStateChange.mockClear();

    setVisibility("hidden");
    vi.advanceTimersByTime(100); // còn trong debounce
    setVisibility("visible"); // quay lại trước debounce, không có input mới sau đó

    vi.advanceTimersByTime(1000); // đủ idleTimeout kể từ lúc visible lại

    expect(onStateChange).toHaveBeenCalledTimes(1);
    const [state, , since] = onStateChange.mock.calls[0];
    expect(state).toBe("idle");
    expect(since).toBe(inputAt);
  });

  it("since: setSuspended(true) ép idle tức thời -> since bằng timestamp, không truy ngược về input trước đó", () => {
    makeDetector();
    window.dispatchEvent(new Event("click"));
    onStateChange.mockClear();

    detector!.setSuspended(true);

    expect(onStateChange).toHaveBeenCalledTimes(1);
    const [state, timestamp, since] = onStateChange.mock.calls[0];
    expect(state).toBe("idle");
    expect(since).toBe(timestamp);
  });
});
