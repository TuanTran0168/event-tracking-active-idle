import { useEffect, useRef } from "react";

export const MONITORED_INPUT_EVENTS = [
  "mousemove",
  "keydown",
  "scroll",
  "touchstart",
  "click",
  "wheel",
] as const;

export type MonitoredInputEvent = (typeof MONITORED_INPUT_EVENTS)[number];

const LISTENER_OPTIONS: AddEventListenerOptions = {
  passive: true,
  capture: true,
};

export function useInputMonitor(
  inputThrottle: number,
  onInput: (eventName: MonitoredInputEvent, timestamp: number, handled: boolean) => void,
): void {
  const onInputRef = useRef(onInput);
  onInputRef.current = onInput;
  const throttleRef = useRef(inputThrottle);
  throttleRef.current = inputThrottle;

  useEffect(() => {
    let lastObservedAt = -Infinity;
    const handlers = new Map<MonitoredInputEvent, EventListener>();

    MONITORED_INPUT_EVENTS.forEach((eventName) => {
      const handler: EventListener = () => {
        const timestamp = Date.now();
        const handled = timestamp - lastObservedAt >= throttleRef.current;
        if (handled) lastObservedAt = timestamp;
        onInputRef.current(eventName, timestamp, handled);
      };

      handlers.set(eventName, handler);
      window.addEventListener(eventName, handler, LISTENER_OPTIONS);
    });

    return () => {
      MONITORED_INPUT_EVENTS.forEach((eventName) => {
        const handler = handlers.get(eventName);
        if (handler) window.removeEventListener(eventName, handler, LISTENER_OPTIONS);
      });
    };
  }, []);
}
