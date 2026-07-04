"use client";

import { useEffect } from "react";
import { PageShell } from "@/components/ui";
import { ErrorState } from "@/components/feedback";

/** Global error boundary — catches render/runtime errors in any route. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error for debugging without exposing internals to the user.
    console.error(error);
  }, [error]);

  return (
    <PageShell className="py-24">
      <ErrorState
        title="Unexpected error"
        message="Something broke while rendering this page. You can retry, or head back and start a new storm."
        detail={error.digest ? `Reference: ${error.digest}` : undefined}
        onRetry={reset}
      />
    </PageShell>
  );
}
