import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DemoBanner, merchantQuery } from "@/components/fiskal/shared";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: Layout,
});

function Layout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery(merchantQuery());
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <div className="min-h-screen">
      {data?.merchant?.demo_mode && <DemoBanner />}
      <header className="bg-gradient-to-r from-primary to-[oklch(0.3_0.09_205)] text-primary-foreground shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/dashboard" className="text-lg font-bold">FiskalBridge</Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link to="/dashboard" className="rounded-md px-3 py-1.5 font-medium hover:bg-white/15" activeProps={{ className: "bg-white/20" }}>Dashboard</Link>
            <Link to="/settings" className="rounded-md px-3 py-1.5 font-medium hover:bg-white/15" activeProps={{ className: "bg-white/20" }}>Settings</Link>
            <Button variant="ghost" size="sm" className="hover:bg-white/15 hover:text-primary-foreground" onClick={signOut}>Sign out</Button>
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
