import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/betterAuth";
import { prisma } from "@/lib/db";
import { ApiKeysManager } from "./ApiKeysManager";

// Account overview: profile + programmatic API key management. The dashboard
// itself is session-authed; these keys are for external API consumers.
export default async function AccountPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect("/login");

  return (
    <>
      <div className="card">
        <h1 className="text-base font-semibold">Account</h1>
        <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted">Name</dt>
          <dd>{user.name}</dd>
          <dt className="text-muted">Email</dt>
          <dd>{user.email}</dd>
          <dt className="text-muted">Plan</dt>
          <dd>
            <span className="pill">{user.tier}</span>
          </dd>
        </dl>
      </div>

      <ApiKeysManager />
    </>
  );
}
