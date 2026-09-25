// Minimal service worker: enough for the app to be installable. No caching, so the menu is
// never stale; every request goes to the network exactly as it would without a worker.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // Passthrough: not calling respondWith() lets the browser handle the request normally.
});
