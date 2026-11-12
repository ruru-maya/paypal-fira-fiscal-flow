import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — FiskalBridge" },
      { name: "description", content: "Choose a new password for your FiskalBridge account." },
      { property: "og:title", content: "Set a new password — FiskalBridge" },
      { property: "og:description", content: "Choose a new password for your FiskalBridge account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated.");
    navigate({ to: "/dashboard" });
  }
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">FiskalBridge</p>
        <h1 className="mt-2 text-3xl font-bold">Set a new password</h1>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <div className="space-y-2"><Label>New password</Label><Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <Button className="w-full" size="lg" disabled={busy}>Save password</Button>
        </form>
      </div>
    </main>
  );
}
