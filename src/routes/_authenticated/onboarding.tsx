import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BusinessForm, FiraForm, PaypalForm } from "@/components/fiskal/forms";
import { merchantQuery } from "@/components/fiskal/shared";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Set up — FiskalBridge" }, { name: "description", content: "Connect PayPal and FIRA in three steps." }] }),
  component: Onboarding,
});

const STEPS = ["Your business", "Connect PayPal", "Connect FIRA"];

function Onboarding() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery(merchantQuery());
  const [step, setStep] = useState(0);
  if (isLoading) return null;
  const m = data?.merchant;
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <ol className="mb-10 flex gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <button onClick={() => (i === 0 || m) && setStep(i)} className="w-full text-left">
              <div className={`h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
              <p className={`mt-2 text-xs font-medium ${i === step ? "text-foreground" : "text-muted-foreground"}`}>Step {i + 1} · {s}</p>
            </button>
          </li>
        ))}
      </ol>
      <h1 className="mb-2 text-3xl font-bold">{STEPS[step]}</h1>
      <p className="mb-8 text-muted-foreground">
        {step === 0 && "Tell us a little about your business so invoices come out right."}
        {step === 1 && "Paste your PayPal app keys. We'll set up the connection for you automatically."}
        {step === 2 && "Paste your FIRA key. From then on, every PayPal payment becomes an invoice."}
      </p>
      {step === 0 && <BusinessForm merchant={m} onDone={() => setStep(1)} />}
      {step === 1 && (
        <>
          <PaypalForm merchant={m} webhookUrl={data?.webhookUrl ?? null} />
          {m?.paypal_connected_at && <Button className="mt-6" variant="secondary" onClick={() => setStep(2)}>Next: FIRA →</Button>}
        </>
      )}
      {step === 2 && (
        <>
          <FiraForm merchant={m} />
          {m?.fira_connected_at && <Button className="mt-6" onClick={() => navigate({ to: "/dashboard" })}>Finish → Dashboard</Button>}
        </>
      )}
    </main>
  );
}
