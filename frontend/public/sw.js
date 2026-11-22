// Minimal service worker: keeps the app installable and shows a retry screen if a page load fails.
// It deliberately does NOT cache anything, because journal entries and photos must always be live.

const OFFLINE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>Horizon</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center;
         justify-content: center; gap: 16px; padding: 24px; box-sizing: border-box; text-align: center;
         background: #000; color: #fff; font-family: system-ui, sans-serif; }
  p { margin: 0; font-size: 16px; color: #a1a1a6; }
  button { height: 44px; padding: 0 24px; border: 0; border-radius: 10px; background: #fff; color: #000;
           font-size: 14px; font-weight: 500; cursor: pointer; }
</style>
</head>
<body>
  <p>Can't connect right now.</p>
  <button onclick="location.reload()">Try again</button>
</body>
</html>`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Only page loads are handled. Everything else (scripts, photos, API calls) goes to the network as normal.
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response(OFFLINE_HTML, {
          status: 503,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
    ),
  );
});