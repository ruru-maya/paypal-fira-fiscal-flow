import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getShopConfig, shopCaptureOrder, shopCreateOrder, shopSubscriptionPlan } from "@/lib/fiskal/merchant.functions";

export const Route = createFileRoute("/shop/$merchantId")({
  head: () => ({
    meta: [
      { title: "Varaždin Souvenirs (demo) — FiskalBridge test shop" },
      { name: "description", content: "Sandbox demo shop: pay with a PayPal sandbox buyer and watch the invoice appear in FIRA." },
      { property: "og:title", content: "Varaždin Souvenirs (demo)" },
      { property: "og:description", content: "Sandbox demo shop for FiskalBridge — no real money." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Shop,
});

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { paypalOrders?: any; paypalSubs?: any } }

function loadSdk(src: string, ns: string) {
  return new Promise<void>((resolve, reject) => {
    if ((window as any)[ns]) return resolve();
    const s = document.createElement("script");
    s.src = src; s.setAttribute("data-namespace", ns); s.onload = () => resolve(); s.onerror = () => reject(new Error("PayPal SDK failed to load"));
    document.body.appendChild(s);
  });
}

function Shop() {
  const { merchantId } = Route.useParams();
  const cfgFn = useServerFn(getShopConfig);
  const createFn = useServerFn(shopCreateOrder);
  const captureFn = useServerFn(shopCaptureOrder);
  const planFn = useServerFn(shopSubscriptionPlan);
  const { data: cfg } = useQuery({ queryKey: ["shop", merchantId], queryFn: () => cfgFn({ data: { merchantId } }) });
  const [cart, setCart] = useState<Record<string, number>>({});
  const [done, setDone] = useState<string | null>(null);
  const cartRef = useRef(cart);
  cartRef.current = cart;
  const btnRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const renderBtnRef = useRef<(() => void) | null>(null);
  const items = Object.entries(cart).filter(([, q]) => q > 0);
  const hasItems = items.length > 0;
  const hasItemsRef = useRef(hasItems);
  hasItemsRef.current = hasItems;
  const products = cfg?.ok ? cfg.products : [];
  const total = items.reduce((s, [sku, q]) => s + (products.find((p) => p.sku === sku)?.price ?? 0) * q, 0);

  useEffect(() => {
    if (!cfg?.ok || !cfg.clientId) return;
    let cancelled = false;
    (async () => {
      await loadSdk(`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(cfg.clientId)}&currency=EUR&components=buttons`, "paypalOrders");
      if (cancelled || !window.paypalOrders) return;
      const renderOneTime = () => {
        if (!btnRef.current || !window.paypalOrders) return;
        btnRef.current.innerHTML = "";
        window.paypalOrders.Buttons({
          style: { layout: "vertical", shape: "pill" },
          createOrder: async () => {
            const c = Object.entries(cartRef.current).filter(([, q]) => q > 0).map(([sku, qty]) => ({ sku, qty }));
            if (!c.length) { toast.error("Add something to the cart first"); throw new Error("empty cart"); }
            return (await createFn({ data: { merchantId, cart: c } })).id;
          },
          onApprove: async (d: any) => {
            await captureFn({ data: { merchantId, orderId: d.orderID } });
            setCart({});
            setDone("Payment complete! The invoice will appear in the FiskalBridge dashboard in a few seconds.");
          },
          onError: (e: any) => toast.error(String(e?.message ?? e)),
        }).render(btnRef.current);
      };
      renderBtnRef.current = renderOneTime;
      if (hasItemsRef.current) renderOneTime();

      await loadSdk(`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(cfg.clientId)}&currency=EUR&vault=true&intent=subscription&components=buttons`, "paypalSubs");
      if (cancelled || !subRef.current) return;
      subRef.current.innerHTML = "";
      window.paypalSubs.Buttons({
        style: { layout: "horizontal", shape: "pill", label: "subscribe", tagline: false },
        createSubscription: async (_: any, actions: any) => {
          const { planId } = await planFn({ data: { merchantId } });
          return actions.subscription.create({ plan_id: planId });
        },
        onApprove: () => setDone("Welcome to the club! The first renewal invoice appears when PayPal bills the subscription."),
        onError: (e: any) => toast.error(String(e?.message ?? e)),
      }).render(subRef.current);
    })().catch((e) => toast.error(String(e)));
    return () => { cancelled = true; };
  }, [cfg?.ok, cfg && cfg.ok ? cfg.clientId : null]);

  // Render the pay buttons only once the cart has something in it, so they are never
  // drawn into a hidden container.
  useEffect(() => {
    if (hasItems) renderBtnRef.current?.();
  }, [hasItems]);

  if (cfg && !cfg.ok) return <main className="mx-auto max-w-md px-4 py-20 text-center text-muted-foreground">{cfg.error}</main>;

  return (
    <div className="min-h-screen">
      <div className="border-b border-warning bg-warning/40 px-4 py-2 text-center text-sm font-medium text-warning-foreground">
        <p>Sandbox demo — no real money. Log in to PayPal with a <strong className="font-bold">sandbox buyer account</strong> (from the Devpost testing instructions), not your real PayPal login.</p>
        <p className="mt-1">Or choose <strong className="font-bold">Debit or Credit Card</strong> and use a PayPal sandbox test card (any future expiry date, any CVV).</p>
      </div>
      <main className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Test shop</p>
        <h1 className="mt-1 text-3xl font-bold">Varaždin Souvenirs (demo)</h1>
        <p className="mt-2 text-muted-foreground">Payments go to {cfg?.ok ? cfg.businessName : "…"}'s PayPal sandbox and become FIRA documents automatically.</p>
        <Link to="/live/$merchantId" params={{ merchantId }} target="_blank" className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">Watch the invoice appear live →</Link>
        {done && <p className="mt-6 rounded-lg border border-success bg-success/10 p-4 font-medium text-success">{done}</p>}

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {products.map((p) => (
            <div key={p.sku} className="flex flex-col rounded-xl border bg-card p-5">
              <p className="font-semibold">{p.name}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">€{p.price.toFixed(2)}</p>
              <div className="mt-4 flex items-center gap-2">
                <Button size="icon" variant="outline" onClick={() => setCart({ ...cart, [p.sku]: Math.max(0, (cart[p.sku] ?? 0) - 1) })}><Minus className="h-4 w-4" /></Button>
                <span className="w-6 text-center tabular-nums">{cart[p.sku] ?? 0}</span>
                <Button size="icon" variant="outline" onClick={() => setCart({ ...cart, [p.sku]: (cart[p.sku] ?? 0) + 1 })}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">Cart</h2>
            {items.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Empty</p> : items.map(([sku, q]) => {
              const p = products.find((x) => x.sku === sku)!;
              return <p key={sku} className="mt-2 flex justify-between text-sm"><span>{q} × {p.name}</span><span className="tabular-nums">€{(p.price * q).toFixed(2)}</span></p>;
            })}
            <p className="mt-4 flex justify-between border-t pt-3 font-semibold"><span>Total</span><span className="tabular-nums">€{total.toFixed(2)}</span></p>
            <div ref={btnRef} className={hasItems ? "mt-4 min-h-12" : "hidden"} />
            {!hasItems && <p className="mt-4 rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">Add a product to pay</p>}
          </section>
          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">Souvenir of the Month club</h2>
            <p className="mt-1 text-2xl font-bold">€9.99<span className="text-sm font-normal text-muted-foreground">/month</span></p>
            <p className="mt-2 text-sm text-muted-foreground">A surprise Varaždin souvenir every month. Each renewal becomes an invoice.</p>
            <div ref={subRef} className="mt-4 min-h-12" />
          </section>
        </div>
      </main>
    </div>
  );
}
