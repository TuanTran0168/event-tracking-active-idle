export type ActivityState = "idle" | "active";

export interface ActivityDetectorOptions {
  idleTimeout: number;
  visibilityDebounce: number;
  inputThrottle: number;
  onStateChange: (state: ActivityState, timestamp: number, since: number) => void;
}

export type ActivityDetectorThresholds = Pick<
  ActivityDetectorOptions,
  "idleTimeout" | "visibilityDebounce" | "inputThrottle"
>;

export interface ActivityDetector {
  getState: () => ActivityState;
  updateOptions: (options: Partial<ActivityDetectorThresholds>) => void;
  setSuspended: (suspended: boolean) => void;
  destroy: () => void;
}

const INPUT_EVENTS = [
  "mousemove",
  "keydown",
  "scroll",
  "touchstart",
  "click",
  "wheel",
] as const;

const INPUT_LISTENER_OPTIONS: AddEventListenerOptions = {
  passive: true,
  capture: true,
};

const VISIBILITY_CHANGE_EVENT = "visibilitychange";
const HIDDEN_VISIBILITY_STATE: DocumentVisibilityState = "hidden";
const IDLE: ActivityState = "idle";
const ACTIVE: ActivityState = "active";
const NOT_YET_PROCESSED = -Infinity;

const THRESHOLD_KEYS = [
  "idleTimeout",
  "visibilityDebounce",
  "inputThrottle",
] as const satisfies readonly (keyof ActivityDetectorThresholds)[];

function assertValidThreshold(name: string, value: number): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(
      `[activity-detector] ${name} must be a finite, non-negative number, got: ${value}`,
    );
  }
}

function assertValidThresholds(
  values: Partial<ActivityDetectorThresholds>,
): void {
  THRESHOLD_KEYS.forEach((key) => {
    const value = values[key];
    if (value !== undefined) assertValidThreshold(key, value);
  });
}

export function createActivityDetector(
  options: ActivityDetectorOptions,
): ActivityDetector {
  assertValidThresholds(options);

  const { onStateChange } = options;
  let idleTimeout = options.idleTimeout;
  let visibilityDebounce = options.visibilityDebounce;
  let inputThrottle = options.inputThrottle;

  let state: ActivityState = IDLE;
  let lastProcessedAt = NOT_YET_PROCESSED;
  let hiddenSince: number | null = null;
  let idleTimerId: ReturnType<typeof setTimeout> | null = null;
  let visibilityTimerId: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;
  let suspended = false;

  const setState = (next: ActivityState, timestamp: number, since: number = timestamp) => {
    if (state === next) return;
    state = next;
    onStateChange(next, timestamp, since);
  };

  const clearIdleTimer = () => {
    if (idleTimerId !== null) {
      clearTimeout(idleTimerId);
      idleTimerId = null;
    }
  };

  const scheduleIdleTimer = (delay: number = idleTimeout) => {
    clearIdleTimer();
    idleTimerId = setTimeout(() => {
      idleTimerId = null;
      setState(IDLE, Date.now(), lastProcessedAt);
    }, delay);
  };

  const clearVisibilityTimer = () => {
    if (visibilityTimerId !== null) {
      clearTimeout(visibilityTimerId);
      visibilityTimerId = null;
    }
  };

  const scheduleVisibilityTimer = (delay: number = visibilityDebounce) => {
    clearVisibilityTimer();
    visibilityTimerId = setTimeout(() => {
      visibilityTimerId = null;
      if (document.visibilityState === HIDDEN_VISIBILITY_STATE) {
        setState(IDLE, Date.now(), hiddenSince ?? Date.now());
      }
    }, delay);
  };

  const handleInput = () => {
    if (suspended) return;
    const now = Date.now();
    if (now - lastProcessedAt < inputThrottle) return;
    lastProcessedAt = now;
    setState(ACTIVE, now);
    scheduleIdleTimer();
  };

  const handleVisibilityChange = () => {
    if (suspended) return;
    if (document.visibilityState === HIDDEN_VISIBILITY_STATE) {
      hiddenSince = Date.now();
      clearIdleTimer();
      scheduleVisibilityTimer();
    } else {
      const wasHidden = hiddenSince !== null;
      hiddenSince = null;
      clearVisibilityTimer();
      if (wasHidden && state === ACTIVE) {
        scheduleIdleTimer();
      }
    }
  };

  INPUT_EVENTS.forEach((eventName) => {
    window.addEventListener(eventName, handleInput, INPUT_LISTENER_OPTIONS);
  });
  document.addEventListener(VISIBILITY_CHANGE_EVENT, handleVisibilityChange);

  return {
    getState: () => state,
    updateOptions: (next) => {
      assertValidThresholds(next);

      if (next.idleTimeout !== undefined) idleTimeout = next.idleTimeout;
      if (next.visibilityDebounce !== undefined)
        visibilityDebounce = next.visibilityDebounce;
      if (next.inputThrottle !== undefined)
        inputThrottle = next.inputThrottle;
      if (idleTimerId !== null) {
        scheduleIdleTimer(Math.max(0, idleTimeout - (Date.now() - lastProcessedAt)));
      }
      if (visibilityTimerId !== null && hiddenSince !== null) {
        scheduleVisibilityTimer(
          Math.max(0, visibilityDebounce - (Date.now() - hiddenSince)),
        );
      }
    },
    setSuspended: (next: boolean) => {
      if (suspended === next) return;
      suspended = next;
      if (suspended) {
        clearIdleTimer();
        clearVisibilityTimer();
        setState(IDLE, Date.now());
      }
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      INPUT_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, handleInput, INPUT_LISTENER_OPTIONS);
      });
      document.removeEventListener(VISIBILITY_CHANGE_EVENT, handleVisibilityChange);
      clearIdleTimer();
      clearVisibilityTimer();
    },
  };
}
