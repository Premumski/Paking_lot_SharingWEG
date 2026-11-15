/* Service worker: Web Push (N-01) and PWA install. No offline caching of personal data. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = { title: "Stellplatz-Sharing", body: "", url: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, { body: data.body, icon: "/icons/icon-192.png", data: { url: data.url } }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  if (!url.startsWith("/")) return;
  event.waitUntil(self.clients.openWindow(url));
});

self.addEventListener("fetch", () => {});
