// Dialogue Web Push Service Worker

self.addEventListener("push", function (event) {
  if (!event.data) {
    console.log("Push event had no data.");
    return;
  }

  try {
    const payload = event.data.json();
    const title = payload.title || "Dialogue";
    const options = {
      body: payload.message || "",
      icon: "/icon.png",
      badge: "/icon.png",
      data: {
        actionUrl: payload.actionUrl || "/",
      },
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (err) {
    console.error("Error parsing push notification data:", err);
  }
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const actionUrl = event.notification.data?.actionUrl || "/";
  const targetUrl = new URL(actionUrl, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      // Find if any window/tab is already open for this origin
      for (const client of clientList) {
        if ("focus" in client) {
          // Navigate existing tab to the targeted action URL and focus it
          return client.navigate(targetUrl).then((c) => {
            if (c) c.focus();
          });
        }
      }
      // If no window is open, open a new tab/window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
