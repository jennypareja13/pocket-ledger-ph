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

  if (
    !shouldRegisterServiceWorker({
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
