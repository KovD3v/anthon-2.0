const CACHE_NAME = "anthon-v1";
const ASSETS_TO_CACHE = ["/", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			return cache.addAll(ASSETS_TO_CACHE);
		})
	);
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches.keys().then((cacheNames) => {
			return Promise.all(
				cacheNames
					.filter((name) => name !== CACHE_NAME)
					.map((name) => caches.delete(name))
			);
		})
	);
	self.clients.claim();
});

self.addEventListener("fetch", (event) => {
	// Only handle GET requests, same-origin assets, and ignore API
	if (
		event.request.method !== "GET" ||
		!event.request.url.startsWith(self.location.origin) ||
		event.request.url.includes("/api/")
	) {
		return;
	}

	event.respondWith(
		fetch(event.request)
			.then((response) => {
				// Check if we received a valid response
				if (
					!response ||
					response.status !== 200 ||
					response.type !== "basic"
				) {
					return response;
				}

				// Clone the response if it hasn't been used yet
				if (!response.bodyUsed) {
					const responseToCache = response.clone();
					caches.open(CACHE_NAME).then((cache) => {
						cache.put(event.request, responseToCache);
					});
				}

				return response;
			})
			.catch(() => {
				// If network fails, serve from cache
				return caches.match(event.request);
			})
	);
});

self.addEventListener("push", (event) => {
	let data = {};
	if (event.data) {
		try {
			data = event.data.json();
		} catch (e) {
			data = { title: "New Message", body: event.data.text() };
		}
	}

	const title = data.title || "Anthon";
	const options = {
		body: data.body || "You have a new message from your coach.",
		icon: "/icon-192.png",
		badge: "/icon-192.png",
		data: data.url || "/",
		vibrate: [200, 100, 200],
		actions: [{ action: "open", title: "Open Anthon" }],
	};

	event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const urlToOpen = event.notification.data || "/";

	event.waitUntil(
		clients
			.matchAll({ type: "window", includeUncontrolled: true })
			.then((windowClients) => {
				// Check if there is already a window open and focus it
				for (let i = 0; i < windowClients.length; i++) {
					const client = windowClients[i];
					if (client.url === urlToOpen && "focus" in client) {
						return client.focus();
					}
				}
				// If no window found, open a new one
				if (clients.openWindow) {
					return clients.openWindow(urlToOpen);
				}
			})
	);
});
