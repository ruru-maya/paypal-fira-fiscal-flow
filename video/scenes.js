// Scene drawing for the FiskalBridge video. Every scene is a pure function of
// time: draw(t) returns an SVG string, where t is in *nominal* seconds (the
// durations in NOMINAL below). index.html stretches real time onto nominal
// time, so re-timing only ever happens in timeline.js.
(function () {
  const C = {
    teal: "#0f5c5c",
    tealSoft: "#d6ece8",
    ink: "#1a202c",
    amber: "#d97706",
    amberSoft: "#fef3c7",
    red: "#dc2626",
    mint: "#ecfdf5",
    grey: "#cbd5e1",
    white: "#ffffff",
  };
  const NOMINAL = { title: 6, rule: 18, normal: 26, gap: 20, solution: 30, demo: 50, outro: 15 };

  // Invoice photo used in scene 2. Set src + pixel size + the two focus
  // rectangles (in image pixels) once the real file is available.
  const INVOICE = window.INVOICE || { src: null, w: 900, h: 1200, focus1: [90, 330, 520, 60], focus2: [90, 980, 720, 60] };

  // ---------- helpers ----------
  const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const seg = (t, a, b) => cl((t - a) / (b - a));
  const eo = (x) => 1 - Math.pow(1 - x, 3);
  const eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const back = (x) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);
  const lerp = (a, b, k) => a + (b - a) * k;
  const lp = (p, q, k) => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  const qpt = (p0, c, p1, k) => lp(lp(p0, c, k), lp(c, p1, k), k);
  const rad = (d) => (d * Math.PI) / 180;
  const f = (n) => Math.round(n * 100) / 100;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

  function pop(t, at, cx, cy, inner, d = 0.4) {
    const k = seg(t, at, at + d);
    if (k <= 0) return "";
    return `<g transform="translate(${cx} ${cy}) scale(${f(back(k))}) translate(${-cx} ${-cy})" opacity="${f(cl(k * 3))}">${inner}</g>`;
  }
  function fade(t, at, inner, d = 0.4, until = null) {
    let k = seg(t, at, at + d);
    if (until != null) k *= 1 - seg(t, until, until + 0.3);
    return k <= 0 ? "" : `<g opacity="${f(k)}">${inner}</g>`;
  }
  function tx(x, y, s, o = {}) {
    return `<text x="${x}" y="${y}" font-size="${o.size || 30}" font-weight="${o.weight || 500}" fill="${o.fill || C.ink}" text-anchor="${o.anchor || "middle"}"${o.italic ? ' font-style="italic"' : ""}${o.ls ? ` letter-spacing="${o.ls}"` : ""}>${esc(s)}</text>`;
  }
  function arrow(t, at, p0, p1, o = {}) {
    const k = eo(seg(t, at, at + (o.d ?? 0.7)));
    if (k <= 0) return "";
    const c = o.c || lp(p0, p1, 0.5);
    const q1 = lp(p0, c, k);
    const e = lp(q1, lp(c, p1, k), k);
    const ang = (Math.atan2(e[1] - q1[1], e[0] - q1[0]) * 180) / Math.PI;
    const col = o.color || C.teal;
    const w = o.w || 8;
    let s = `<path d="M${f(p0[0])},${f(p0[1])} Q${f(q1[0])},${f(q1[1])} ${f(e[0])},${f(e[1])}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round"${o.dash ? ' stroke-dasharray="20 18"' : ""}/>`;
    if (!o.noHead) s += `<polygon points="10,0 -16,-14 -16,14" fill="${col}" stroke="${col}" stroke-width="4" stroke-linejoin="round" transform="translate(${f(e[0])} ${f(e[1])}) rotate(${f(ang)})"/>`;
    if (o.label) {
      const m = o.labelAt || qpt(p0, c, p1, 0.5);
      s += `<g opacity="${f(k)}">${tx(m[0], m[1] - 20, o.label, { size: o.labelSize || 28, weight: 600, fill: col, italic: o.italic })}</g>`;
    }
    return s;
  }
  function check(cx, cy, r = 22, col = C.teal) {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${col}"/><path d="M${cx - r * 0.45},${cy + r * 0.02} l${r * 0.3},${r * 0.32} l${r * 0.6},${-r * 0.62}" fill="none" stroke="#fff" stroke-width="${r * 0.24}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  function cross(cx, cy, r = 30) {
    const a = r * 0.38;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.red}"/><path d="M${cx - a},${cy - a} L${cx + a},${cy + a} M${cx + a},${cy - a} L${cx - a},${cy + a}" stroke="#fff" stroke-width="${r * 0.24}" stroke-linecap="round"/>`;
  }
  function bubble(t, at, o) {
    let k = seg(t, at, at + 0.35);
    if (o.until != null && t > o.until) k = 1 - seg(t, o.until, o.until + 0.2);
    if (k <= 0) return "";
    const size = o.size || 36;
    const lh = size * 1.3;
    const h = o.lines.length * lh + 46;
    const { x, y, w } = o;
    const x0 = x - w / 2, x1 = x + w / 2, y0 = y - h / 2, y1 = y + h / 2, r = 30;
    const [tX, tY] = o.tail;
    const bx = cl(tX, x0 + 70, x1 - 70);
    const d = `M${x0 + r},${y0} H${x1 - r} Q${x1},${y0} ${x1},${y0 + r} V${y1 - r} Q${x1},${y1} ${x1 - r},${y1} H${bx + 24} L${tX},${tY} L${bx - 24},${y1} H${x0 + r} Q${x0},${y1} ${x0},${y1 - r} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} Z`;
    let s = `<path d="${d}" fill="#fff" stroke="${C.ink}" stroke-width="6" stroke-linejoin="round"/>`;
    o.lines.forEach((ln, i) => {
      s += tx(x, y0 + 23 + lh * (i + 0.72), ln, { size, weight: 600 });
    });
    return `<g transform="translate(${tX} ${tY}) scale(${f(back(k))}) translate(${-tX} ${-tY})" opacity="${f(cl(k * 3))}">${s}</g>`;
  }

  // ---------- stick figure (x,y = feet) ----------
  function fig(x, y, o = {}) {
    const s = o.s ?? 1, col = o.col || C.ink, w = o.walk;
    let lA = -(o.legSpread ?? 9), lB = o.legSpread ?? 9;
    let aL = o.armL ?? -14, aR = o.armR ?? 14;
    let bob = 0;
    if (w != null) {
      lA = Math.sin(w) * 26; lB = -lA;
      if (o.armL == null) aL = -Math.sin(w) * 24;
      if (o.armR == null) aR = Math.sin(w) * 24;
      bob = -Math.abs(Math.sin(w)) * 5;
    }
    const hip = [0, -95], sh = [0, -168];
    const limb = (p, a, l) => [p[0] + Math.sin(rad(a)) * l, p[1] + Math.cos(rad(a)) * l];
    const fA = limb(hip, lA, 95), fB = limb(hip, lB, 95), hL = limb(sh, aL, 82), hR = limb(sh, aR, 82);
    const ln = (p, q) => `<line x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(q[0])}" y2="${f(q[1])}"/>`;
    const fx = (o.face ?? 0) * 6;
    const mood = o.mood || "smile";
    const mouth =
      mood === "sad" ? `<path d="M${fx - 11},-198 q11,-10 22,0"/>` :
      mood === "flat" ? `<path d="M${fx - 10},-201 h20"/>` :
      mood === "happy" ? `<path d="M${fx - 13},-206 q13,17 26,0 z" fill="${col}"/>` :
      `<path d="M${fx - 11},-205 q11,10 22,0"/>`;
    let g = `<g stroke="${col}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" fill="none">`;
    g += ln(hip, fA) + ln(hip, fB) + ln(sh, hip) + ln([0, -185], sh) + ln(sh, hL) + ln(sh, hR);
    g += `<circle cx="0" cy="-215" r="31" fill="#fff"/>`;
    if (o.cap) g += `<path d="M-31,-222 a31,31 0 0 1 62,0 z" fill="${col}" stroke-width="6"/><path d="M${(o.face ?? 1) * 20},-222 h${(o.face ?? 1) * 30}" stroke-width="9"/>`;
    g += `<g stroke-width="5">${mouth}</g></g>`;
    g += `<circle cx="${fx - 10}" cy="-217" r="4.5" fill="${col}"/><circle cx="${fx + 10}" cy="-217" r="4.5" fill="${col}"/>`;
    if (o.hold) g += `<g transform="translate(${f(hR[0])} ${f(hR[1])})">${o.hold}</g>`;
    return `<g transform="translate(${f(x)} ${f(y + bob)}) scale(${s})">${g}</g>`;
  }
  const cardIcon = (w = 64) => {
    const h = w * 0.64;
    return `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${w * 0.12}" fill="${C.amber}" stroke="${C.ink}" stroke-width="5"/><rect x="${-w / 2}" y="${-h * 0.22}" width="${w}" height="${h * 0.2}" fill="${C.ink}"/>`;
  };
  const coin = (cx, cy, r = 22) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${r}" fill="${C.amber}" stroke="${C.ink}" stroke-width="5"/><text x="${f(cx)}" y="${f(cy + r * 0.38)}" font-size="${r * 1.1}" font-weight="800" fill="#fff" text-anchor="middle">€</text>`;

  // ---------- icons ----------
  function shop(x, g, w = 380, h = 300, o = {}) {
    const y = g - h;
    let s = `<rect x="${x}" y="${y + 60}" width="${w}" height="${h - 60}" fill="#fff" stroke="${C.ink}" stroke-width="8" stroke-linejoin="round"/>`;
    // awning
    const n = 6, sw = (w + 40) / n;
    for (let i = 0; i < n; i++) {
      const ax = x - 20 + i * sw;
      s += `<path d="M${ax},${y} h${sw} v70 a${sw / 2},22 0 0 1 ${-sw},0 z" fill="${i % 2 ? "#fff" : C.teal}" stroke="${C.ink}" stroke-width="6" stroke-linejoin="round"/>`;
    }
    // door
    const dw = w * 0.24, dx = x + w * 0.1;
    s += `<rect x="${dx}" y="${g - (h - 60) * 0.72}" width="${dw}" height="${(h - 60) * 0.72}" rx="6" fill="${C.tealSoft}" stroke="${C.ink}" stroke-width="7"/><circle cx="${dx + dw - 16}" cy="${g - (h - 60) * 0.34}" r="6" fill="${C.ink}"/>`;
    // window
    const wx = x + w * 0.42, wy = y + 120, ww = w * 0.48, wh = (h - 60) * 0.5;
    s += `<rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" rx="6" fill="${o.windowFill || C.mint}" stroke="${C.ink}" stroke-width="7"/>`;
    if (!o.plainWindow) s += `<path d="M${wx + ww / 2},${wy} v${wh} M${wx},${wy + wh / 2} h${ww}" stroke="${C.ink}" stroke-width="5"/>`;
    return s;
  }
  function laptop(cx, cy, screen = "", label = null) {
    let s = `<rect x="${cx - 125}" y="${cy - 95}" width="250" height="165" rx="14" fill="#fff" stroke="${C.ink}" stroke-width="8"/>`;
    s += screen;
    s += `<path d="M${cx - 165},${cy + 70} h330 l-18,30 h-294 z" fill="${C.tealSoft}" stroke="${C.ink}" stroke-width="8" stroke-linejoin="round"/>`;
    if (label) s += tx(cx, cy + 148, label, { size: 30, weight: 600 });
    return s;
  }
  const screenLines = (cx, cy) =>
    `<g stroke="${C.grey}" stroke-width="9" stroke-linecap="round"><path d="M${cx - 90},${cy - 55} h110 M${cx - 90},${cy - 25} h180 M${cx - 90},${cy + 5} h150"/></g><path d="M${cx + 20},${cy + 38} h70" stroke="${C.teal}" stroke-width="11" stroke-linecap="round"/>`;
  function cloud(cx, cy, s = 1, label = "PayPal", dy = 0) {
    return `<g transform="translate(${cx} ${cy}) scale(${s})"><path d="M-120,55 C-185,55 -185,-30 -125,-38 C-125,-100 -45,-120 -12,-72 C22,-125 115,-100 108,-36 C170,-36 172,55 115,55 Z" fill="#fff" stroke="${C.ink}" stroke-width="${8 / s}" stroke-linejoin="round"/>${tx(-5, 22 + dy, label, { size: 44, weight: 800, fill: C.ink })}</g>`;
  }
  // Government building; (cx, by) = bottom centre of the building, label below.
  function gov(cx, by, s = 1, label = true) {
    let g = `<g transform="translate(${cx} ${by}) scale(${s})" stroke="${C.ink}" stroke-width="${7 / s}" stroke-linejoin="round">`;
    g += `<rect x="-125" y="-22" width="250" height="22" fill="${C.tealSoft}"/>`;
    g += `<rect x="-110" y="-150" width="220" height="22" fill="${C.tealSoft}"/>`;
    for (const px of [-88, -34, 20, 74]) g += `<rect x="${px}" y="-128" width="24" height="106" fill="#fff"/>`;
    g += `<path d="M-128,-150 L0,-225 L128,-150 Z" fill="#fff"/><circle cx="0" cy="-178" r="13" fill="${C.teal}" stroke="none"/></g>`;
    if (label) g += tx(cx, by + 40, "Tax Administration", { size: 30, weight: 700 }) + tx(cx, by + 76, "(Porezna uprava)", { size: 26, weight: 500 });
    return g;
  }
  function sheet(cx, cy, s = 1, o = {}) {
    let g = `<g transform="translate(${f(cx)} ${f(cy)}) scale(${s}) rotate(${o.rot || 0})"><rect x="-55" y="-72" width="110" height="144" rx="6" fill="#fff" stroke="${C.ink}" stroke-width="6"/>`;
    g += `<g stroke="${C.grey}" stroke-width="7" stroke-linecap="round"><path d="M-36,-48 h50 M-36,-26 h72 M-36,-4 h60"/></g>`;
    if (o.jir) g += `<rect x="-40" y="22" width="80" height="34" rx="8" fill="${C.teal}"/><text x="0" y="47" font-size="24" font-weight="800" fill="#fff" text-anchor="middle">JIR</text>`;
    else if (o.storno) g += `<text x="0" y="48" font-size="20" font-weight="800" fill="${C.amber}" text-anchor="middle">STORNO</text>`;
    else g += `<path d="M-36,34 h40" stroke="${C.grey}" stroke-width="7" stroke-linecap="round"/>`;
    return g + `</g>`;
  }
  const jirTag = (cx, cy, s = 1) =>
    `<g transform="translate(${f(cx)} ${f(cy)}) scale(${s})"><rect x="-62" y="-30" width="124" height="60" rx="14" fill="${C.teal}" stroke="${C.ink}" stroke-width="5"/><text x="0" y="14" font-size="38" font-weight="800" fill="#fff" text-anchor="middle">JIR</text></g>`;
  const pill = (cx, cy, w, h, label, o = {}) =>
    `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${o.rx ?? h / 2}" fill="${o.fill || "#fff"}" stroke="${o.stroke || C.ink}" stroke-width="${o.sw || 6}"/>` +
    tx(cx + (o.dx || 0), cy + (o.size || 30) * 0.36, label, { size: o.size || 30, weight: o.weight || 700, fill: o.color || C.ink });
  const bg = (extra = "") => `<rect width="1920" height="1080" fill="${C.mint}"/>${extra}`;
  const ground = (y = 780) => `<path d="M60,${y} H1860" stroke="${C.ink}" stroke-width="8" stroke-linecap="round"/>`;

  // ============ Scene 0: title ============
  function title(t) {
    let s = bg();
    const k = eo(seg(t, 0.2, 0.9));
    s += `<g opacity="${f(k)}" transform="translate(0 ${f((1 - k) * 30)})"><text x="960" y="430" font-size="190" font-weight="800" text-anchor="middle" letter-spacing="-4"><tspan fill="${C.ink}">Fiskal</tspan><tspan fill="${C.teal}">Bridge</tspan></text></g>`;
    s += fade(t, 1.0, tx(960, 530, "PayPal payments in, fiscalized invoices out.", { size: 56, weight: 500 }), 0.6);
    s += pop(t, 1.8, 520, 760, cloud(520, 760, 0.85));
    s += arrow(t, 2.3, [690, 750], [1250, 750], { c: [970, 610], d: 1.0, w: 12 });
    s += pop(t, 3.2, 1350, 750, sheet(1350, 750, 1.15, { jir: true }));
    return s;
  }

  // ============ Scene 1: the rule ============
  function rule(t) {
    const G = 780;
    let s = bg() + ground(G);
    s += shop(1100, G, 380, 310);
    // customer walks in
    const wk = eio(seg(t, 0.3, 4.2));
    const cx = lerp(110, 770, wk);
    const walking = t > 0.3 && t < 4.2;
    const pay = eo(seg(t, 4.3, 4.9));
    s += fig(cx, G, { walk: walking ? cx / 26 : null, face: 1, armR: walking ? null : lerp(14, 68, pay), hold: pay > 0.2 ? `<g opacity="${f(pay)}" transform="translate(22 -6)">${cardIcon(60)}</g>` : "" });
    s += fig(965, G, { col: C.teal, cap: true, face: -1, armL: lerp(-14, -60, pay) });
    s += bubble(t, 5.0, { x: 800, y: 400, w: 520, lines: ["Every sale must", "be reported."], tail: [950, 525], size: 38 });
    // tax administration
    s += pop(t, 6.4, 1720, G, gov(1720, G - 8, 0.82, false));
    s += fade(t, 6.7, tx(1720, G + 44, "Tax Administration", { size: 30, weight: 700 }) + tx(1720, G + 80, "(Porezna uprava)", { size: 26 }));
    s += arrow(t, 7.4, [1510, 680], [1600, 680], { label: "real time", labelSize: 26, labelAt: [1556, 660] });
    // payment methods
    const chips = [
      ["Cash", `<rect x="-30" y="-18" width="60" height="36" rx="5" fill="${C.tealSoft}" stroke="${C.ink}" stroke-width="5"/><circle r="9" fill="none" stroke="${C.ink}" stroke-width="4"/>`],
      ["Card", cardIcon(58)],
      ["Bank transfer", `<path d="M-30,-6 L0,-26 L30,-6 Z M-24,0 v18 M-8,0 v18 M8,0 v18 M24,0 v18 M-32,24 h64" fill="${C.tealSoft}" stroke="${C.ink}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`],
      ["PayPal", null],
    ];
    const widths = [280, 280, 440, 300];
    let x = (1920 - (widths.reduce((a, b) => a + b, 0) + 3 * 34)) / 2;
    chips.forEach(([label, icon], i) => {
      const at = 10.4 + i * 1.5, w = widths[i], cxp = x + w / 2, cy = 150;
      const pp = label === "PayPal";
      let c = `<rect x="${x}" y="${cy - 55}" width="${w}" height="110" rx="26" fill="${pp ? C.amberSoft : "#fff"}" stroke="${pp ? C.amber : C.ink}" stroke-width="${pp ? 8 : 6}"/>`;
      if (icon) c += `<g transform="translate(${x + 62} ${cy})">${icon}</g>`;
      c += tx(icon ? x + 108 : x + 36, cy + 14, label, { size: pp ? 44 : 38, weight: pp ? 800 : 700, anchor: "start" });
      s += pop(t, at, cxp, cy, c);
      s += pop(t, at + 0.45, x + w - 46, cy, check(x + w - 46, cy, 24));
      x += w + 34;
    });
    return s;
  }

  // ============ Scene 2: the normal flow + real invoice ============
  function normal(t) {
    let s = bg();
    const flowOut = 1 - seg(t, 15.0, 15.5);
    if (flowOut > 0) {
      let a = "";
      const got = seg(t, 13.9, 14.3);
      a += pop(t, 0.2, 230, 640, fig(230, 640, { face: 1, mood: got > 0.5 ? "happy" : "smile", armR: lerp(lerp(14, 70, eo(seg(t, 1.6, 2.2))) , 60, got) , hold: t > 1.7 && t < 3.4 ? cardIcon(56) : "" }));
      a += fade(t, 0.4, tx(230, 700, "Customer", { size: 30, weight: 600 }));
      a += pop(t, 0.6, 860, 470, laptop(860, 470, t > 5 ? fade(t, 5.0, screenLines(860, 470)) : "", "Invoicing software"));
      a += pop(t, 1.0, 1570, 560, gov(1570, 560, 1.0));
      a += arrow(t, 2.2, [340, 480], [670, 480], { label: "pays", labelSize: 32 });
      a += arrow(t, 7.2, [1010, 400], [1420, 400], { c: [1215, 290], label: "invoice data", labelSize: 30, labelAt: [1215, 335], d: 0.9 });
      // JIR flies back
      const jk = eio(seg(t, 10.6, 12.0));
      a += arrow(t, 10.6, [1420, 520], [1040, 520], { c: [1230, 640], d: 1.4, color: C.teal });
      if (jk > 0 && t < 12.6) { const p = qpt([1420, 520], [1230, 640], [1040, 520], jk); a += `<g opacity="${f(1 - seg(t, 12.2, 12.6))}">${jirTag(p[0], p[1] + 2)}</g>`; }
      // printed invoice goes to the customer
      const mk = eio(seg(t, 13.0, 14.1));
      const ip = qpt([860, 710], [600, 800], [345, 520], mk);
      a += pop(t, 12.3, 860, 710, sheet(ip[0], ip[1], lerp(1.15, 0.8, mk), { jir: true }));
      s += `<g opacity="${f(flowOut)}">${a}</g>`;
    }
    const k = seg(t, 15.2, 15.8);
    if (k > 0) {
      // fit image into the stage, then zoom towards the two focus rectangles
      const box = { x: 960, y: 500, w: 1500, h: 700 };
      const s0 = Math.min(box.w / INVOICE.w, box.h / INVOICE.h);
      const view = (r, zoomW) => (r ? { cx: r[0] + r[2] / 2, cy: r[1] + r[3] / 2, s: Math.min((box.w * zoomW) / r[2], s0 * 3.2) } : { cx: INVOICE.w / 2, cy: INVOICE.h / 2, s: s0 });
      const v0 = view(null), v1 = view(INVOICE.focus1, 0.55), v2 = view(INVOICE.focus2, 0.8);
      const k1 = eio(seg(t, 17.6, 19.0)), k2 = eio(seg(t, 21.0, 22.4));
      const mix = (a, b, q) => ({ cx: lerp(a.cx, b.cx, q), cy: lerp(a.cy, b.cy, q), s: lerp(a.s, b.s, q) });
      const v = mix(mix(v0, v1, k1), v2, k2);
      const img = INVOICE.src
        ? `<image href="${INVOICE.src}" width="${INVOICE.w}" height="${INVOICE.h}" preserveAspectRatio="none"/>`
        : `<rect width="${INVOICE.w}" height="${INVOICE.h}" fill="#fff" stroke="${C.grey}" stroke-width="4"/>` + tx(INVOICE.w / 2, 200, "PLACEHOLDER", { size: 60, weight: 800, fill: C.grey }) + tx(INVOICE.w / 2, 270, "invoice-real-fiscalized.png goes here", { size: 34, fill: C.grey });
      const rect = (r, a) => (a > 0 ? `<rect x="${r[0] - 10}" y="${r[1] - 8}" width="${r[2] + 20}" height="${r[3] + 16}" rx="10" fill="none" stroke="${C.teal}" stroke-width="${f(7 / v.s)}" opacity="${f(a)}"/>` : "");
      let p = `<clipPath id="stage"><rect x="0" y="118" width="1920" height="764"/></clipPath>`;
      p += `<g clip-path="url(#stage)"><g transform="translate(${f(box.x - v.cx * v.s)} ${f(box.y - v.cy * v.s)}) scale(${f(v.s)})">${img}${rect(INVOICE.focus1, seg(t, 18.6, 19.0) * (1 - k2))}${rect(INVOICE.focus2, seg(t, 22.0, 22.4))}</g></g>`;
      p += `<rect x="0" y="0" width="1920" height="118" fill="${C.teal}"/>`;
      p += tx(960, 74, "A real fiscalized invoice — this is what every sale needs (personal details blacked out)", { size: 36, weight: 600, fill: "#fff" });
      s += `<g opacity="${f(k)}">${p}</g>`;
    }
    return s;
  }

  // ============ Scene 3: the PayPal gap ============
  function gap(t) {
    let s = bg();
    const G = 720;
    s += pop(t, 0.2, 150, G, fig(150, G, { face: 1, armR: lerp(14, 70, eo(seg(t, 1.2, 1.8))) }));
    s += fade(t, 0.3, tx(150, G + 58, "Customer", { size: 30, weight: 600 }));
    s += pop(t, 0.5, 520, 430, cloud(520, 430, 1.25, "PayPal", -12));
    const q = seg(t, 7.3, 7.7);
    s += pop(t, 0.8, 1060, 450, laptop(1060, 450, q > 0 ? `<text x="1060" y="475" font-size="${f(120 * back(q))}" font-weight="800" fill="${C.red}" text-anchor="middle" opacity="${f(cl(q * 3))}">?</text>` : "", "Invoicing software"));
    const sad = t > 12;
    s += pop(t, 1.1, 1500, G, fig(1500, G, { col: C.teal, cap: true, face: t > 12 ? 1 : -1, mood: t > 15.8 ? "sad" : sad ? "flat" : "smile", armR: sad ? 60 : 14, armL: t > 15.8 ? -150 : -14 }));
    s += fade(t, 1.2, tx(1500, G + 58, "Merchant", { size: 30, weight: 600 }));
    // money goes into the cloud
    s += arrow(t, 1.8, [245, 520], [372, 470], { c: [300, 470] });
    for (let i = 0; i < 3; i++) {
      const a = 2.3 + i * 0.75, k = eio(seg(t, a, a + 0.9));
      if (k <= 0) continue;
      const end = [470 + i * 44, 480];
      const p = qpt([235, 545], [330, 330], end, k);
      s += coin(p[0], p[1], lerp(24, 16, k));
    }
    // broken link
    s += arrow(t, 5.0, [722, 440], [872, 440], { color: C.red, dash: true, d: 0.8, w: 9 });
    s += pop(t, 5.9, 792, 440, cross(792, 440, 28));
    s += pop(t, 8.6, 1060, 660, pill(1060, 668, 420, 62, "No invoice · nothing reported", { size: 27, color: C.red, stroke: C.red, sw: 5 }));
    // pile of papers
    const n = Math.floor(cl((t - 12.6) / 0.45, 0, 14));
    for (let i = 0; i < n; i++) {
      const born = 12.6 + i * 0.45;
      const rot = ((i * 37) % 13) - 6, dx = ((i * 53) % 17) - 8;
      s += pop(t, born, 1730 + dx, G - 14 - i * 15, `<g transform="translate(${1730 + dx} ${G - 14 - i * 15}) rotate(${rot})"><rect x="-70" y="-10" width="140" height="20" rx="4" fill="#fff" stroke="${C.ink}" stroke-width="5"/><path d="M-50,0 h${60 + ((i * 29) % 30)}" stroke="${C.grey}" stroke-width="5" stroke-linecap="round"/></g>`, 0.3);
    }
    s += bubble(t, 12.3, { x: 1480, y: 250, w: 640, lines: ["So I copy every PayPal", "payment by hand…"], tail: [1500, 455], until: 15.7, size: 38 });
    s += bubble(t, 16.0, { x: 1480, y: 250, w: 640, lines: ["…and refunds need", "a storno too!"], tail: [1500, 455], size: 38 });
    return s;
  }

  // ============ Scene 4: the solution ============
  function solution(t) {
    let s = bg();
    const Y = 400;
    s += pop(t, 0.5, 180, Y, cloud(180, Y, 1.0));
    // FiskalBridge box
    const bx = 480, bw = 590, by = 190, bh = 460;
    let box = `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="28" fill="#fff" stroke="${C.teal}" stroke-width="9"/>`;
    box += `<path d="M${bx},${by + 92} v-64 a28,28 0 0 1 28,-28 h${bw - 56} a28,28 0 0 1 28,28 v64 z" fill="${C.teal}"/>`;
    box += tx(bx + bw / 2, by + 64, "FiskalBridge", { size: 50, weight: 800, fill: "#fff" });
    s += pop(t, 1.5, bx + bw / 2, by + bh / 2, box, 0.5);
    const stages = [
      [15.8, "Rules decide", "invoice / storno / nothing"],
      [17.6, "AI maps", "lines + VAT"],
      [20.6, "Code checks", "totals to the cent"],
    ];
    stages.forEach(([at, a, b], i) => {
      const ry = by + 112 + i * 114;
      let r = `<rect x="${bx + 24}" y="${ry}" width="${bw - 48}" height="98" rx="18" fill="${C.mint}" stroke="${C.teal}" stroke-width="4"/>`;
      r += `<circle cx="${bx + 76}" cy="${ry + 49}" r="27" fill="${C.teal}"/>` + tx(bx + 76, ry + 61, String(i + 1), { size: 34, weight: 800, fill: "#fff" });
      r += tx(bx + 122, ry + 44, a, { size: 34, weight: 800, anchor: "start" });
      r += tx(bx + 122, ry + 80, b, { size: 28, weight: 500, anchor: "start" });
      s += pop(t, at, bx + bw / 2, ry + 49, r);
    });
    // FIRA
    let fira = `<rect x="1190" y="${Y - 95}" width="290" height="190" rx="24" fill="#fff" stroke="${C.ink}" stroke-width="8"/>`;
    fira += tx(1335, Y - 8, "FIRA", { size: 60, weight: 800 }) + tx(1335, Y + 42, "invoicing service", { size: 30, weight: 500 });
    s += pop(t, 3.5, 1335, Y, fira);
    s += pop(t, 5.5, 1740, Y + 75, gov(1740, Y + 75, 0.95));
    // arrows
    s += arrow(t, 9.5, [335, Y], [455, Y], { label: "webhook", italic: true, labelSize: 28, labelAt: [408, Y - 14] });
    s += arrow(t, 10.4, [1082, Y], [1166, Y]);
    s += arrow(t, 11.2, [1492, Y], [1590, Y]);
    const jk = eio(seg(t, 12.2, 13.5));
    s += arrow(t, 12.2, [1690, 215], [1420, 290], { c: [1540, 150], d: 1.3, w: 7 });
    if (jk > 0) { const p = qpt([1690, 215], [1540, 150], [1420, 290], Math.min(jk, 0.5)); s += jirTag(p[0], p[1] - 4, 0.8); }
    // refund loop
    let loop = pill(215, 215, 350, 70, "Refund → storno", { size: 30, stroke: C.amber, fill: C.amberSoft, dx: 22 });
    loop += `<g transform="translate(78 215)" fill="none" stroke="${C.amber}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M13,-8 a15,15 0 1 0 2,12"/><path d="M15,-20 v13 h-13"/></g>`;
    s += pop(t, 13.9, 215, 215, loop);
    // review branch
    const RY = 770;
    s += arrow(t, 23.0, [660, 662], [660, RY - 52], { color: C.amber, d: 0.4 });
    s += pop(t, 23.3, 660, RY, pill(660, RY, 250, 76, "Not sure?", { size: 34, stroke: C.amber, fill: C.amberSoft }));
    s += arrow(t, 24.0, [800, RY], [900, RY], { color: C.amber, d: 0.4 });
    let rq = `<rect x="925" y="${RY - 62}" width="330" height="124" rx="20" fill="#fff" stroke="${C.ink}" stroke-width="7"/>`;
    rq += `<g stroke="${C.amber}" stroke-width="8" stroke-linecap="round"><path d="M958,${RY - 22} h34 M958,${RY + 4} h34 M958,${RY + 30} h34"/></g>` + tx(1128, RY + 12, "Review queue", { size: 34, weight: 800 });
    s += pop(t, 24.4, 1090, RY, rq);
    s += arrow(t, 25.1, [1268, RY], [1368, RY], { color: C.amber, d: 0.4 });
    s += pop(t, 25.5, 1440, 860, fig(1440, 860, { s: 0.8, col: C.teal, cap: true, face: 1, armR: 120, mood: "smile" }));
    s += pop(t, 26.0, 1530, 690, check(1530, 690, 26));
    s += fade(t, 26.0, tx(1570, 705, "merchant approves", { size: 32, weight: 700, anchor: "start" }));
    // badge
    let badge = `<rect x="50" y="${RY - 70}" width="390" height="140" rx="26" fill="${C.teal}"/>`;
    badge += `<path d="M112,${RY - 36} l34,-12 l34,12 v26 c0,24 -18,38 -34,46 c-16,-8 -34,-22 -34,-46 z" fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round"/>`;
    badge += tx(200, RY - 8, "We never touch", { size: 30, weight: 700, fill: "#fff", anchor: "start" }) + tx(200, RY + 32, "the money.", { size: 30, weight: 700, fill: "#fff", anchor: "start" });
    s += pop(t, 27.2, 245, RY, badge);
    return s;
  }

  // ============ Scene 5: screen recording (drawn by ffmpeg; this is the overlay) ============
  function demo(t, ctx) {
    if (ctx && ctx.overlay) return "";
    return `<rect width="1920" height="1080" fill="${C.ink}"/>` + tx(960, 500, "Scene 5 — real screen recording goes here", { size: 60, weight: 700, fill: "#fff" }) + tx(960, 570, "(waiting for the recording files)", { size: 36, fill: C.grey });
  }

  // ============ Scene 6: outro ============
  function outro(t) {
    const G = 780;
    let s = bg() + ground(G);
    // shop with a big window listing payment options
    const x = 250, w = 640, h = 470, y = G - h;
    let sh = `<rect x="${x}" y="${y + 60}" width="${w}" height="${h - 60}" fill="#fff" stroke="${C.ink}" stroke-width="8"/>`;
    const n = 8, sw = (w + 40) / n;
    for (let i = 0; i < n; i++) sh += `<path d="M${x - 20 + i * sw},${y} h${sw} v70 a${sw / 2},22 0 0 1 ${-sw},0 z" fill="${i % 2 ? "#fff" : C.teal}" stroke="${C.ink}" stroke-width="6" stroke-linejoin="round"/>`;
    sh += `<rect x="${x + 40}" y="${G - 260}" width="140" height="260" rx="6" fill="${C.tealSoft}" stroke="${C.ink}" stroke-width="7"/><circle cx="${x + 160}" cy="${G - 130}" r="7" fill="${C.ink}"/>`;
    const wx = x + 230, wy = y + 122, ww = 370, wh = 300;
    sh += `<rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" rx="8" fill="${C.mint}" stroke="${C.ink}" stroke-width="7"/>`;
    sh += tx(wx + ww / 2, wy + 46, "We accept", { size: 30, weight: 800, fill: C.teal });
    s += sh;
    ["Cash", "Card", "Bank transfer"].forEach((l, i) => {
      const ly = wy + 96 + i * 50;
      s += check(wx + 44, ly - 10, 15) + tx(wx + 74, ly, l, { size: 30, weight: 600, anchor: "start" });
    });
    const py = wy + 96 + 3 * 50 + 8;
    s += pop(t, 2.4, wx + ww / 2, py - 10, `<rect x="${wx + 16}" y="${py - 42}" width="${ww - 32}" height="62" rx="14" fill="${C.amberSoft}" stroke="${C.amber}" stroke-width="6"/>` + check(wx + 46, py - 11, 17, C.amber) + tx(wx + 78, py + 2, "PayPal", { size: 38, weight: 800, anchor: "start" }), 0.5);
    const joy = eo(seg(t, 2.8, 3.3));
    const hop = t > 3 && t < 8.5 ? -Math.abs(Math.sin((t - 3) * 3.2)) * 16 : 0;
    s += fig(1090, G + hop, { col: C.teal, cap: true, face: -1, mood: joy > 0.5 ? "happy" : "smile", armL: lerp(-14, -135, joy), armR: lerp(14, 135, joy) });
    s += bubble(t, 3.8, { x: 1330, y: 330, w: 620, lines: ["Now I can take PayPal", "in my shop!"], tail: [1120, 520], size: 40 });
    // end card
    const k = eo(seg(t, 9.2, 10.0));
    if (k > 0) {
      let e = `<rect width="1920" height="1080" fill="${C.mint}"/>`;
      e += `<text x="960" y="290" font-size="150" font-weight="800" text-anchor="middle" letter-spacing="-3"><tspan fill="${C.ink}">Fiskal</tspan><tspan fill="${C.teal}">Bridge</tspan></text>`;
      e += tx(960, 372, "PayPal payments in, fiscalized invoices out.", { size: 44, weight: 500 });
      e += tx(960, 500, "paypal-fira-fiscal-flow.lovable.app", { size: 50, weight: 700, fill: C.teal });
      e += tx(960, 576, "github.com/ruru-maya/paypal-fira-fiscal-flow", { size: 44, weight: 600, fill: C.ink });
      e += `<rect x="260" y="660" width="1400" height="150" rx="22" fill="#fff" stroke="${C.amber}" stroke-width="5"/>`;
      e += tx(960, 722, "Demo: PayPal sandbox + FIRA Testing mode (offers, not fiscal invoices).", { size: 36, weight: 600 });
      e += tx(960, 774, "Live mode issues fiscal invoices with a JIR.", { size: 36, weight: 600 });
      s += `<g opacity="${f(k)}">${e}</g>`;
    }
    return s;
  }

  window.SCENES = { title, rule, normal, gap, solution, demo, outro };
  window.NOMINAL = NOMINAL;
})();
