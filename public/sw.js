// Service worker: installability plus the photo share target. It caches nothing, so the menu
// is never stale. A photo shared to the app (POST /admin/share) is kept in this browser's
// IndexedDB and Add bottle opens with it as a reference; photos never go to the server.
const DB_NAME = "mixology-share";
const STORE = "files";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.pathname === "/admin/share") {
    event.respondWith(handleShare(event.request));
  }
  // Everything else: passthrough (no respondWith), handled by the browser as usual.
});

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveShare(file) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ blob: file, type: file.type || "image/jpeg", name: file.name || "share.jpg", at: Date.now() }, "latest");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function handleShare(request) {
  let saved = false;
  try {
    const form = await request.formData();
    const files = form.getAll("images").concat(form.getAll("image"));
    const file = files.find((f) => f instanceof File && f.size > 0);
    if (file) {
      await saveShare(file);
      saved = true;
    }
  } catch {
    // Fall through to Add bottle even if storage fails.
  }
  // If not signed in, /admin/bottles/new redirects to sign-in and back; the photo waits in IndexedDB.
  return Response.redirect(new URL(`/admin/bottles/new?shared=${saved ? 1 : 0}`, self.registration.scope), 303);
}
