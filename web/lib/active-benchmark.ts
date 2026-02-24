export const ACTIVE_KEY = "jury-arena:active-benchmark-id";
export const EVT_ACTIVE_CHANGED = "active-benchmark-changed";

export function getActive(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_KEY);
}

export function setActive(v: string | null) {
  if (typeof window === "undefined") return;
  if (!v) window.localStorage.removeItem(ACTIVE_KEY);
  else window.localStorage.setItem(ACTIVE_KEY, v);
  window.dispatchEvent(new Event(EVT_ACTIVE_CHANGED));
}
