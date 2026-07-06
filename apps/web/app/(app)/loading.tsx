import { PageShell, Skeleton } from "@/components/ui";

/**
 * Route-transition fallback for the authenticated app shell. Deliberately
 * generic — it must NOT render sidebar/topbar chrome (that's each page's own
 * DashboardShell), so a logged-out visitor can never glimpse dashboard
 * structure and an authenticated visitor never sees a jarring content-free
 * blackout between routes.
 */
export default function AppLoading() {
  return (
    <div className="bg-tunnel flex min-h-screen items-center justify-center">
      <PageShell className="flex w-full max-w-md flex-col items-center gap-5 py-24">
        <span
          className="h-6 w-6 animate-spin rounded-full border-2 border-storm-700 border-t-storm-300"
          role="status"
          aria-label="Loading"
        />
        <div className="w-full space-y-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </PageShell>
    </div>
  );
}
