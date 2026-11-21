import { useEffect, useRef, useState } from "react";
import { registerServiceWorker } from "@/lib/service-worker";

export function ServiceWorkerUpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [updateWaiting, setUpdateWaiting] = useState(false);
  const activationRequested = useRef(false);

  useEffect(() => {
    let mounted = true;
    let currentRegistration: ServiceWorkerRegistration | null = null;

    const onControllerChange = () => {
      if (activationRequested.current) window.location.reload();
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

    void registerServiceWorker().then((nextRegistration) => {
      if (!mounted || !nextRegistration) return;
      currentRegistration = nextRegistration;
      setRegistration(nextRegistration);
      setUpdateWaiting(Boolean(nextRegistration.waiting));
      nextRegistration.addEventListener("updatefound", onUpdateFound);
    });

    return () => {
      mounted = false;
      navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
      currentRegistration?.removeEventListener("updatefound", onUpdateFound);
    };
  }, []);

  if (!updateWaiting || !registration?.waiting) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-lg items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-sm shadow-lg md:bottom-4"
    >
      <span>New version available. Tap to reload.</span>
      <button
        type="button"
        className="shrink-0 rounded-lg bg-primary px-3 py-2 font-medium text-primary-foreground"
        onClick={() => {
          activationRequested.current = true;
          registration.waiting?.postMessage({ type: "SKIP_WAITING" });
        }}
      >
        Reload
      </button>
    </div>
  );
}
