import { useEffect, useRef, useState } from "react";
import {
  createActivityDetector,
  type ActivityDetector,
  type ActivityState,
} from "./activity-detector";

export interface UseActivityDetectorOptions {
  idleTimeout: number;
  visibilityDebounce: number;
  inputThrottle: number;
  onStateChange?: (state: ActivityState, timestamp: number) => void;
}

export function useActivityDetector({
  idleTimeout,
  visibilityDebounce,
  inputThrottle,
  onStateChange,
}: UseActivityDetectorOptions): ActivityState {
  const [state, setState] = useState<ActivityState>("idle");
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  const detectorRef = useRef<ActivityDetector | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const detector = createActivityDetector({
      idleTimeout,
      visibilityDebounce,
      inputThrottle,
      onStateChange: (nextState, timestamp) => {
        setState(nextState);
        onStateChangeRef.current?.(nextState, timestamp);
      },
    });
    detectorRef.current = detector;

    return () => {
      detector.destroy();
      detectorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    detectorRef.current?.updateOptions({
      idleTimeout,
      visibilityDebounce,
      inputThrottle,
    });
  }, [idleTimeout, visibilityDebounce, inputThrottle]);

  return state;
}
