// FiskalBridge submission video — the ONE file to edit when re-timing.
//
// Each scene has a `dur` in seconds. Scene animations are authored against a
// nominal duration and are stretched automatically, so changing `dur` (for
// example to fit a voiceover) re-times the visuals and the captions together.
//
// Captions: each entry is a chunk of narration (max 2 lines on screen).
// By default a scene's chunks share its duration in proportion to their
// length. To pin a chunk to a voiceover, give it explicit times in seconds
// from the start of the scene: { text: "...", start: 1.2, end: 4.8 }.
(function (root) {
  const TIMELINE = {
    fps: 30,
    width: 1920,
    height: 1080,
    scenes: [
      { id: "title", dur: 6, captions: [] },
      {
        id: "rule",
        dur: 18,
        captions: [
          "In Croatia, every retail sale to a private customer must be fiscalized —",
          "reported to the Tax Administration in real time.",
          "Since January 2026 this applies to every payment method:",
          "cash, card, bank transfer, and PayPal.",
        ],
      },
      {
        id: "normal",
        dur: 26,
        captions: [
          "Normally it's simple. The customer pays,",
          "the invoicing software issues the invoice and sends it to the Tax Administration.",
          "The tax office answers with a unique code — the JIR — printed on the invoice.",
          "That code proves the sale was reported.",
        ],
      },
      {
        id: "gap",
        dur: 20,
        captions: [
          "PayPal doesn't work like that.",
          "The money lands in PayPal, not in the invoicing software —",
          "so no invoice is created and nothing is reported.",
          "Merchants copy every PayPal payment by hand,",
          "and refunds, which need a storno, are easy to forget.",
        ],
      },
      {
        id: "solution",
        dur: 30,
        captions: [
          "So we built FiskalBridge, a connector between PayPal and FIRA,",
          "a Croatian invoicing service that fiscalizes invoices.",
          "Connect PayPal and FIRA once. Every payment becomes an invoice, every refund a storno.",
          "Rules decide what's needed, AI prepares the invoice lines and VAT,",
          "and code checks every cent.",
          "Anything uncertain waits for the merchant to review.",
          "And we never touch the money.",
        ],
      },
      {
        // Real screen recording. Clips and lower-third labels are defined in
        // demo.json once the recording has been reviewed.
        id: "demo",
        dur: 50,
        captions: [
          "Here's the real thing in the PayPal sandbox.",
          "I buy two items and pay with PayPal…",
          "a few seconds later the invoice is in, with its lines, VAT and the AI's explanation.",
          "Now I refund it — the storno appears automatically.",
          "And if something needs a check, it waits for me:",
          "I fix it, the code validates it again, and it's sent.",
        ],
      },
      {
        id: "outro",
        dur: 15,
        captions: [
          { text: "FiskalBridge: PayPal payments in, fiscalized invoices out —", start: 0.4, end: 4.6 },
          { text: "so Croatian merchants can finally offer PayPal in their shops.", start: 4.6, end: 9.2 },
        ],
      },
    ],
  };

  // Resolve scene start times and caption times (absolute seconds).
  function resolve(tl) {
    let t = 0;
    const scenes = [];
    const captions = [];
    for (const s of tl.scenes) {
      const start = t;
      const chunks = s.captions.map((c) => (typeof c === "string" ? { text: c } : c));
      const auto = chunks.filter((c) => c.start == null);
      const pad = 0.4; // quiet lead-in / lead-out inside each scene
      const span = Math.max(0, s.dur - 2 * pad);
      const weight = (c) => c.text.length + 12; // +12 ≈ a short breath per chunk
      const total = auto.reduce((n, c) => n + weight(c), 0) || 1;
      let cur = pad;
      for (const c of chunks) {
        let a, b;
        if (c.start != null) {
          a = c.start;
          b = c.end;
        } else {
          a = cur;
          b = cur + (span * weight(c)) / total;
          cur = b;
        }
        captions.push({ scene: s.id, start: start + a, end: start + b - 0.08, text: c.text });
      }
      scenes.push({ id: s.id, start, dur: s.dur });
      t += s.dur;
    }
    return { scenes, captions, total: t };
  }

  const api = { TIMELINE, resolve };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FB = api;
})(typeof window !== "undefined" ? window : globalThis);
