/* StockBench slot push — no caching of app shell; notification click → briefing */
self.addEventListener("push", (event) => {
  let data = {
    title: "StockBench 브리핑",
    body: "새 브리핑이 발행되었습니다.",
    url: "/",
  };
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch {
    // keep defaults
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      data: { url: data.url },
      icon: "/favicon.ico",
      badge: "/favicon.ico",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (list) => {
      for (const client of list) {
        if ("focus" in client) {
          await client.focus();
          // Prefer hard navigate via page message — focus alone keeps a frozen PWA shell.
          try {
            client.postMessage({ type: "stockbench:push-open", url });
          } catch {
            if ("navigate" in client) {
              return client.navigate(url);
            }
          }
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    }),
  );
});
