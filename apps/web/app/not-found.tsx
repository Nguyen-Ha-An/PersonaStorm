import { PageShell } from "@/components/ui";
import { ErrorState } from "@/components/feedback";

export default function NotFound() {
  return (
    <PageShell className="py-24">
      <ErrorState
        title="Page not found"
        message="That page doesn't exist. Storms are held in memory, so a link may also have expired if the API restarted."
        homeLabel="Back to the wind tunnel"
      />
    </PageShell>
  );
}
