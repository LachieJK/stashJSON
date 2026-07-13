import { getServerSession } from "@/lib/betterAuth";
import { NavBar } from "./NavBar";

// Server half of the global navbar: reads the Better Auth session (so the nav
// shows the right actions with no client-side flash) and hands plain props to
// the interactive <NavBar>. Mounted once, in the root layout, so navigation is
// identical across the marketing, auth, and dashboard route groups.
export async function SiteNav() {
  const session = await getServerSession();
  return (
    <NavBar authed={Boolean(session)} email={session?.user.email ?? null} />
  );
}
