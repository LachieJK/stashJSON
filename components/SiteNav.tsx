import { getServerSession } from "@/lib/betterAuth";
import { NavBar } from "./NavBar";

// Server half of the global navbar: reads the Better Auth session (so the nav
// shows the right actions with no client-side flash) and hands plain props to
// the interactive <NavBar>. Mounted by the marketing and dashboard layouts; the
// full-viewport (auth) pages render without it.
export async function SiteNav() {
  const session = await getServerSession();
  return (
    <NavBar authed={Boolean(session)} email={session?.user.email ?? null} />
  );
}
