import type { Route as RootRoute } from "@/routes/__root";
import type { Route as PrivacyNoticeRoute } from "@/routes/privacy-notice";
import type { Route as ResetPasswordRoute } from "@/routes/reset-password";

declare module "@tanstack/react-router" {
  interface FileRoutesByPath {
    "/privacy-notice": {
      id: "/privacy-notice";
      path: "/privacy-notice";
      fullPath: "/privacy-notice";
      preLoaderRoute: typeof PrivacyNoticeRoute;
      parentRoute: typeof RootRoute;
    };
    "/reset-password": {
      id: "/reset-password";
      path: "/reset-password";
      fullPath: "/reset-password";
      preLoaderRoute: typeof ResetPasswordRoute;
      parentRoute: typeof RootRoute;
    };
  }
}
