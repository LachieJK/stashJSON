import type { Metadata } from "next";
import { Endpoint } from "../_components";

export const metadata: Metadata = { title: "Misc · StashJSON docs" };

export default function DocsMiscPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Misc</h1>
      <p className="mt-3 max-w-prose text-muted">
        Service-level endpoints that don&apos;t belong to a resource.
      </p>

      <Endpoint
        method="GET"
        path="/health"
        description="Health check. Requires no authentication — use it for uptime monitors and load-balancer probes."
        responseBody={`{
  "status": "ok"
}`}
      />
    </div>
  );
}
