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
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/dashboard" className="font-bold text-primary">FiskalBridge</Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link to="/dashboard" className="rounded-md px-3 py-1.5 hover:bg-muted" activeProps={{ className: "bg-muted" }}>Dashboard</Link>
            <Link to="/settings" className="rounded-md px-3 py-1.5 hover:bg-muted" activeProps={{ className: "bg-muted" }}>Settings</Link>
            <Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button>
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
