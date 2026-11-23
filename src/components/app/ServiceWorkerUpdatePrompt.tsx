import { useEffect, useRef, useState } from "react";
import { checkForRunningAppUpdate, registerServiceWorker } from "@/lib/service-worker";

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

export function ServiceWorkerUpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [shellUpdate, setShellUpdate] = useState(false);
  const [warmWarning, setWarmWarning] = useState(false);
  const activationRequested = useRef(false);

  useEffect(() => {
    let mounted = true;
    let lastUpdateCheck = 0;
    const runningEntry = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
    const runningFingerprint = runningEntry ? new URL(runningEntry.src).pathname : null;

    const checkUpdate = async (force = false) => {
      if (!runningFingerprint || document.visibilityState !== "visible") return;
      if (!force && Date.now() - lastUpdateCheck < UPDATE_CHECK_INTERVAL_MS) return;
      lastUpdateCheck = Date.now();
      if (await checkForRunningAppUpdate(runningFingerprint) && mounted) setShellUpdate(true);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkUpdate();
    };

    const onControllerChange = () => {
      if (activationRequested.current) window.location.reload();
    };

    const onWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "SHELL_ASSET_WARM_FAILED") setWarmWarning(true);
      if (event.data?.type === "POCKETVAULT_SW_DISABLED") {
        try {
          window.localStorage.setItem(
            "pocketvault-service-worker-disabled-version",
            String(event.data.version || "unknown"),
          );
        } catch {
          // The worker still unregisters and clears PocketVault caches.
        }
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    navigator.serviceWorker?.addEventListener("controllerchange", onControllerChange);
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);

    void registerServiceWorker().then((nextRegistration) => {
      if (!mounted || !nextRegistration) return;
      setRegistration(nextRegistration);
      void nextRegistration.update().catch(() => {
        // A failed background check must not prevent normal app use.
      });
      void checkUpdate(true);
    });

    const interval = window.setInterval(() => void checkUpdate(), UPDATE_CHECK_INTERVAL_MS);

    return () => {
      mounted = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
      navigator.serviceWorker?.removeEventListener("message", onWorkerMessage);
    };
  }, []);

  if (!shellUpdate && !warmWarning) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-lg items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-sm shadow-lg md:bottom-4"
    >
      <span>
        {warmWarning
          ? "Some app files could not be saved. Stay online and reopen PocketVault before going offline."
          : "New version available. Tap to reload."}
      </span>
      <button
        type="button"
        className="shrink-0 rounded-lg bg-primary px-3 py-2 font-medium text-primary-foreground"
        onClick={() => {
          if (registration?.waiting) {
            activationRequested.current = true;
            registration.waiting.postMessage({ type: "SKIP_WAITING" });
          } else {
            window.location.reload();
          }
        }}
      >
        {warmWarning ? "Retry" : "Reload"}
      </button>
    </div>
  );
}
