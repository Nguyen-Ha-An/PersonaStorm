"use client";

import { useEffect } from "react";
import { PageShell } from "@/components/ui";
import { ErrorState } from "@/components/feedback";

/**
 * Error boundary for the authenticated app shell. By the time this renders,
 * the `(app)` layout's auth guard has already confirmed a session (it only
 * renders `children` once signed in), so it's safe to point recovery at the
 * dashboard. Deliberately chrome-free (no Sidebar/Topbar) — a boundary should
 * stay minimal so a failure in the shell itself can't take this down too.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="bg-tunnel flex min-h-screen items-center">
      <PageShell className="py-24">
        <ErrorState
          title="Unexpected error"
          message="Something broke while rendering this page. You can retry, or head back to your overview."
          detail={error.digest ? `Reference: ${error.digest}` : undefined}
          onRetry={reset}
          homeHref="/dashboard"
          homeLabel="Back to Overview"
        />
      </PageShell>
    </div>
  );
}
