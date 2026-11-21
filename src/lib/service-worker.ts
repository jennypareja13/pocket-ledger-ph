import { shouldRegisterServiceWorker } from "./service-worker-policy";

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || typeof navigator === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;

  let topLevel = false;
  try {
    topLevel = window.top === window.self;
  } catch {
    topLevel = false;
  }

  let disabled = false;
  try {
    disabled = window.localStorage.getItem("pocketvault-service-worker-disabled") === "true";
  } catch {
    // If storage is unavailable, preserve normal registration behavior.
  }

  if (
    !shouldRegisterServiceWorker({
      disabled,
      production: import.meta.env.PROD,
      topLevel,
      secureContext: window.isSecureContext,
      hostname: window.location.hostname,
    })
  ) {
    return null;
  }

  try {
    return await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  } catch (error) {
    console.warn("PocketVault offline support could not be registered.", error);
    return null;
  }
}
