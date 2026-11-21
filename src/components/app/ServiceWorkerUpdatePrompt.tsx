import { useEffect, useRef, useState } from "react";
import { registerServiceWorker } from "@/lib/service-worker";

export function ServiceWorkerUpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [updateWaiting, setUpdateWaiting] = useState(false);
  const [shellUpdate, setShellUpdate] = useState(false);
  const [warmWarning, setWarmWarning] = useState(false);
  const activationRequested = useRef(false);

  useEffect(() => {
    let mounted = true;
    let currentRegistration: ServiceWorkerRegistration | null = null;

    const onControllerChange = () => {
      if (activationRequested.current) window.location.reload();
    };

    const onWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "SHELL_UPDATED") setShellUpdate(true);
      if (event.data?.type === "SHELL_ASSET_WARM_FAILED") setWarmWarning(true);
    };

    const onUpdateFound = () => {
      const installing = currentRegistration?.installing;
      if (!installing) return;

      installing.addEventListener("statechange", () => {
        if (mounted && installing.state === "installed" && navigator.serviceWorker.controller) {
          setUpdateWaiting(true);
        }
      });
    };

    navigator.serviceWorker?.addEventListener("controllerchange", onControllerChange);
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);

    void registerServiceWorker().then((nextRegistration) => {
      if (!mounted || !nextRegistration) return;
      currentRegistration = nextRegistration;
      setRegistration(nextRegistration);
      setUpdateWaiting(Boolean(nextRegistration.waiting));
      nextRegistration.addEventListener("updatefound", onUpdateFound);
      void nextRegistration.update().catch(() => {
        // A failed background check must not prevent normal app use.
      });
    });

    return () => {
      mounted = false;
      navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
      navigator.serviceWorker?.removeEventListener("message", onWorkerMessage);
      currentRegistration?.removeEventListener("updatefound", onUpdateFound);
    };
  }, []);

  if (!updateWaiting && !shellUpdate && !warmWarning) return null;

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
