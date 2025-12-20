"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function PWARegistration() {
	const { user, isLoaded } = useUser();

	useEffect(() => {
		if (
			typeof window === "undefined" ||
			!("serviceWorker" in navigator) ||
			!isLoaded
		) {
			return;
		}

		const registerSW = async () => {
			try {
				await navigator.serviceWorker.register("/sw.js", {
					scope: "/",
				});

				// Wait for the service worker to be ready (active and controlling the page)
				const registration = await navigator.serviceWorker.ready;
				console.log("SW ready and active:", registration);

				if (user) {
					await subscribeToPush(registration);
				}
			} catch (error) {
				console.error("SW registration failed:", error);
			}
		};

		registerSW();
	}, [user, isLoaded]);

	const subscribeToPush = async (registration: ServiceWorkerRegistration) => {
		try {
			console.log(
				"Checking push permission state:",
				Notification.permission
			);

			// Check if permission is already granted
			if (Notification.permission === "denied") {
				console.warn("Push notification permission denied by user");
				return;
			}

			// Request permission if not granted
			if (Notification.permission === "default") {
				console.log("Requesting push notification permission...");
				const permission = await Notification.requestPermission();
				console.log("Permission request result:", permission);
				if (permission !== "granted") return;
			}

			console.log("Subscribing to push manager...");
			// Subscribe to push
			const subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: VAPID_PUBLIC_KEY,
			});

			console.log("Push subscription successful:", subscription);

			// Send subscription to backend
			console.log("Sending subscription to backend...");
			const response = await fetch("/api/push/subscribe", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(subscription),
			});

			if (response.ok) {
				console.log("Subscription saved to backend successfully");
			} else {
				console.error(
					"Failed to save subscription to backend:",
					response.status,
					await response.text()
				);
			}
		} catch (error) {
			console.error("Push subscription process failed:", error);
		}
	};

	return null; // This is a logic-only component
}
