import { createFileRoute, Link } from "@tanstack/react-router";
import { PRIVACY_NOTICE_TEXT } from "@/lib/privacy-notice";

export const Route = createFileRoute("/privacy-notice" as never)({
  ssr: false,
  head: () => ({ meta: [{ title: "PocketVault Privacy Notice" }] }),
  component: PrivacyNoticePage,
});

function PrivacyNoticePage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl space-y-4 px-4 py-8">
      <h1 className="font-display text-2xl font-semibold">PocketVault Privacy Notice</h1>
      <article className="whitespace-pre-wrap rounded-xl border bg-card p-4 text-sm leading-6">
        {PRIVACY_NOTICE_TEXT}
      </article>
      <Link to="/auth" className="text-sm text-primary underline">
        Back to sign in
      </Link>
    </main>
  );
}
