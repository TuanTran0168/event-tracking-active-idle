import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useActivityDetector } from "./useActivityDetector";

describe("useActivityDetector", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("bắt đầu ở idle và chuyển active khi có input", () => {
    const { result } = renderHook(() =>
      useActivityDetector({
        idleTimeout: 1000,
        visibilityDebounce: 1000,
        inputThrottle: 0,
      }),
    );

    expect(result.current).toBe("idle");

    act(() => {
      window.dispatchEvent(new Event("mousemove"));
    });

    expect(result.current).toBe("active");
  });

  it("gọi onStateChange và cleanup toàn bộ listener khi unmount", () => {
    const onStateChange = vi.fn();
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() =>
      useActivityDetector({
        idleTimeout: 1000,
        visibilityDebounce: 1000,
        inputThrottle: 0,
        onStateChange,
      }),
    );

    act(() => {
      window.dispatchEvent(new Event("click"));
    });
    expect(onStateChange).toHaveBeenCalledWith(
      "active",
      expect.any(Number),
      expect.any(Number),
    );

    unmount();
    expect(removeSpy).toHaveBeenCalled();

    onStateChange.mockClear();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it("suspended=true: ép state về idle ngay, input trong lúc suspend không có tác dụng", () => {
    const { result, rerender } = renderHook(
      (props: { suspended: boolean }) =>
        useActivityDetector({
          idleTimeout: 1000,
          visibilityDebounce: 1000,
          inputThrottle: 0,
          suspended: props.suspended,
        }),
      { initialProps: { suspended: false } },
    );

    act(() => {
      window.dispatchEvent(new Event("click"));
    });
    expect(result.current).toBe("active");

    act(() => {
      rerender({ suspended: true });
    });
    expect(result.current).toBe("idle");

    act(() => {
      window.dispatchEvent(new Event("mousemove"));
    });
    expect(result.current).toBe("idle");
  });

  it("suspended quay lại false: không tự nhảy active, chờ input thật mới chuyển", () => {
    const { result, rerender } = renderHook(
      (props: { suspended: boolean }) =>
        useActivityDetector({
          idleTimeout: 1000,
          visibilityDebounce: 1000,
          inputThrottle: 0,
          suspended: props.suspended,
        }),
      { initialProps: { suspended: true } },
    );

    expect(result.current).toBe("idle");

    act(() => {
      rerender({ suspended: false });
    });
    expect(result.current).toBe("idle");

    act(() => {
      window.dispatchEvent(new Event("click"));
    });
    expect(result.current).toBe("active");
  });

  it("bug: đổi config khi đang active không được gọi lại callback active trùng lặp", () => {
    const onStateChange = vi.fn();
    const { rerender } = renderHook(
      (props: {
        idleTimeout: number;
        visibilityDebounce: number;
        inputThrottle: number;
      }) => useActivityDetector({ ...props, onStateChange }),
      {
        initialProps: {
          idleTimeout: 1000,
          visibilityDebounce: 1000,
          inputThrottle: 0,
        },
      },
    );

    act(() => {
      window.dispatchEvent(new Event("click"));
    });
    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith(
      "active",
      expect.any(Number),
      expect.any(Number),
    );
    onStateChange.mockClear();

    // đổi config trong khi đang active, giống việc user thay đổi settings runtime
    rerender({ idleTimeout: 2000, visibilityDebounce: 1000, inputThrottle: 0 });

    act(() => {
      window.dispatchEvent(new Event("click"));
    });

    // state đã active từ trước, input mới không được tạo ra transition idle->active giả
    expect(onStateChange).not.toHaveBeenCalledWith(
      "active",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("since: forward đúng giá trị since từ core detector ra ngoài (idle do timeout thật)", () => {
    const onStateChange = vi.fn();

    renderHook(() =>
      useActivityDetector({
        idleTimeout: 500,
        visibilityDebounce: 1000,
        inputThrottle: 0,
        onStateChange,
      }),
    );

    const inputAt = Date.now();
    act(() => {
      window.dispatchEvent(new Event("click"));
    });
    onStateChange.mockClear();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onStateChange).toHaveBeenCalledTimes(1);
    const [state, timestamp, since] = onStateChange.mock.calls[0];
    expect(state).toBe("idle");
    expect(since).toBe(inputAt);
    expect(timestamp - since).toBe(500);
  });
});
