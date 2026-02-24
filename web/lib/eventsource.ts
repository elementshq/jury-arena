declare global {
  interface Window {
    __benchmarkES?: EventSource;
  }
}

export function openEventSource(url: string) {
  // 🔴 既存接続があれば必ず殺す
  window.__benchmarkES?.close();

  const es = new EventSource(url);
  window.__benchmarkES = es;
  return es;
}

export function closeEventSource() {
  window.__benchmarkES?.close();
  window.__benchmarkES = undefined;
}
