/* ============================================================
   TrustLens — interactive risk engine (demo page only)

   Depends on shell.js, which owns the Flare connection and
   publishes window.TL = { price, live } plus a "tl:price" event.
   Deliberately declares no globals that shell.js already owns.
   ============================================================ */

(() => {
  const LIQ_THRESHOLD = 0.85; // position liquidates when LTV crosses this
  const SIGMA_CLAMP = 3.5;    // beyond this, a 7-day breach is negligible

  const TIERS = [
    { id: "prime",      max: 0.02, label: "PRIME",      ltv: 0.83, color: "--prime" },
    { id: "strong",     max: 0.05, label: "STRONG",     ltv: 0.75, color: "--strong" },
    { id: "standard",   max: 0.12, label: "STANDARD",   ltv: 0.67, color: "--standard" },
    { id: "restricted", max: 1.01, label: "RESTRICTED", ltv: 0.50, color: "--restricted" },
  ];

  // What an anonymous wallet gets today: 150% collateral => 67% LTV.
  const ANON_LTV = 0.67;

  const byId = (id) => document.getElementById(id);
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const price = () => window.TL.price;

  /* ----------------------------------------------------------
     Risk model — mirrors the logistic form that runs in the enclave
     ---------------------------------------------------------- */

  const MODEL = {
    intercept: 0.64,
    coef: {
      distance_to_liq_sigma: -0.85, // further from liquidation => safer
      ltv: 3.10,                    // higher leverage => riskier
      realized_vol: 2.35,           // more volatility => riskier
      private_evidence: -0.71,      // verified history => safer
    },
  };

  function score({ ltv, vol, evidence }) {
    const p0 = price();

    // Distance to liquidation, expressed in 7-day standard deviations.
    const liqPrice = (ltv / LIQ_THRESHOLD) * p0;
    const weeklyVol = vol * Math.sqrt(7 / 365);
    const distSigma = ltv <= 0
      ? SIGMA_CLAMP
      : Math.min(SIGMA_CLAMP, Math.log(p0 / liqPrice) / Math.max(weeklyVol, 1e-6));

    const terms = {
      distance_to_liq_sigma: MODEL.coef.distance_to_liq_sigma * distSigma,
      ltv: MODEL.coef.ltv * (ltv - 0.5),
      realized_vol: MODEL.coef.realized_vol * (vol - 0.6),
      private_evidence: MODEL.coef.private_evidence * evidence,
    };

    const z = MODEL.intercept + Object.values(terms).reduce((a, b) => a + b, 0);
    return { probability: 1 / (1 + Math.exp(-z)), distSigma, terms };
  }

  const tierFor = (p) => TIERS.find((t) => p <= t.max) || TIERS[TIERS.length - 1];

  /* ----------------------------------------------------------
     Reason generation — attribution, not hand-written copy
     ---------------------------------------------------------- */

  const REASON_TEXT = {
    distance_to_liq_sigma: (v, ctx) =>
      v < 0
        ? `Collateral sits <b>${ctx.distSigma.toFixed(1)}σ</b> from the liquidation price — a comfortable buffer`
        : `Liquidation price is only <b>${ctx.distSigma.toFixed(1)}σ</b> away at current volatility`,
    ltv: (v, ctx) =>
      v < 0
        ? `Requested LTV of <b>${(ctx.ltv * 100).toFixed(0)}%</b> is conservative`
        : `Requested LTV of <b>${(ctx.ltv * 100).toFixed(0)}%</b> raises leverage risk`,
    realized_vol: (v, ctx) =>
      v < 0
        ? `Market volatility at <b>${(ctx.vol * 100).toFixed(0)}%</b> is below the model's baseline`
        : `Elevated volatility at <b>${(ctx.vol * 100).toFixed(0)}%</b> widens the loss distribution`,
    private_evidence: (v, ctx) =>
      ctx.evidence > 0
        ? `<b>${ctx.evidenceCount} private attestation${ctx.evidenceCount > 1 ? "s" : ""}</b> verified inside the enclave`
        : `No private evidence supplied — scored as an anonymous counterparty`,
  };

  function buildReasons(terms, ctx) {
    return Object.entries(terms)
      .filter(([k, v]) => Math.abs(v) > 0.02 || k === "private_evidence")
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 4)
      .map(([k, v]) => ({
        text: REASON_TEXT[k](v, ctx),
        good: v < 0, // negative contribution to log-odds reduces risk
        weight: Math.abs(v),
      }));
  }

  /* ----------------------------------------------------------
     Rendering
     ---------------------------------------------------------- */

  const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 62;

  function readInputs() {
    const xrp = +byId("collateral").value;
    const borrow = +byId("borrow").value;
    const vol = +byId("vol").value / 100;

    const evidenceEls = [...document.querySelectorAll(".ev.on")];
    const evidence = evidenceEls.reduce((sum, el) => sum + +el.dataset.w, 0);

    const collateralUsd = xrp * price();
    const ltv = collateralUsd > 0 ? borrow / collateralUsd : 0;

    return { xrp, borrow, vol, evidence, evidenceCount: evidenceEls.length, collateralUsd, ltv };
  }

  function render() {
    const ctx = readInputs();
    const money = (n) => "$" + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

    // --- control labels ---
    byId("collateralVal").textContent = ctx.xrp.toLocaleString() + " XRP";
    byId("borrowVal").textContent = "$" + ctx.borrow.toLocaleString();
    byId("volVal").textContent = (ctx.vol * 100).toFixed(0) + "%";
    byId("collateralUsd").innerHTML =
      `≈ <b style="color:var(--text-dim)">${money(ctx.collateralUsd)}</b> ` +
      `at ${window.TL.live ? "live" : "cached"} FTSOv2 price`;
    byId("ltvHint").innerHTML =
      `loan-to-value: <b style="color:var(--text-dim)">${(ctx.ltv * 100).toFixed(1)}%</b>`;

    // --- score ---
    const { probability, distSigma, terms } = score(ctx);
    const tier = tierFor(probability);
    const color = cssVar(tier.color);

    // Percentages below 10 keep a decimal — rounding 0.4% to "0" reads as broken.
    const pct = probability * 100;
    const displayScore = pct < 10 ? pct.toFixed(1) : Math.round(pct).toString();

    // Gauge: sqrt scale so low-but-meaningful probabilities stay visible.
    const fill = byId("gaugeFill");
    fill.style.stroke = color;
    fill.style.strokeDashoffset = GAUGE_CIRCUMFERENCE * (1 - Math.min(Math.sqrt(probability), 1));
    byId("scoreNum").innerHTML = displayScore + '<span style="font-size:0.9rem">%</span>';
    byId("scoreNum").style.color = color;

    // Beacon lamps
    document.querySelectorAll(".lamp").forEach((l) => {
      l.classList.toggle("active", l.dataset.l === tier.id);
    });

    // Tier badge
    const badge = byId("tierBadge");
    badge.style.color = color;
    badge.style.background = color + "1a";
    badge.style.border = "1px solid " + color;
    byId("tierText").textContent = tier.label;

    // LTV verdict
    byId("ltvBig").textContent = (tier.ltv * 100).toFixed(0) + "%";
    byId("ltvBig").style.color = color;
    const approved = ctx.ltv <= tier.ltv;
    byId("ltvSub").innerHTML =
      `requires ${(100 / tier.ltv).toFixed(0)}% collateral · ` +
      (approved
        ? `<span style="color:var(--prime)">request approved</span>`
        : `<span style="color:var(--restricted)">request exceeds cap</span>`);

    // The whole point, in dollars: extra borrowing power on identical collateral.
    const delta = ctx.collateralUsd * (tier.ltv - ANON_LTV);
    byId("capEff").innerHTML =
      delta >= 0
        ? `<b style="color:var(--prime)">${money(delta)} unlocked</b> versus the same wallet with no attestation`
        : `<b style="color:var(--restricted)">${money(delta)} withheld</b> versus an unattested baseline`;

    // Reasons
    byId("reasons").innerHTML = buildReasons(terms, { ...ctx, distSigma })
      .map(
        (r, i) => `
        <div class="reason" style="animation-delay:${i * 60}ms">
          <div class="reason-bar" style="background:${r.good ? cssVar("--prime") : cssVar("--restricted")}"></div>
          <div class="reason-txt">${r.text}</div>
          <div class="reason-w">${r.good ? "−" : "+"}${r.weight.toFixed(2)}</div>
        </div>`
      )
      .join("");

    // Trace
    byId("trace").innerHTML = [
      ["price source", window.TL.live ? `FTSOv2 · $${price().toFixed(4)}` : "cached fallback"],
      ["private fields", `${ctx.evidenceCount} encrypted, 0 revealed`],
      ["model version", "trustlens-logit-v0.3"],
      ["image digest", "sha256:a7f3…9c21 (pinned)"],
      ["attestation", `valid 5 min · nonce ${Math.floor(Math.random() * 1e6)}`],
    ]
      .map(
        ([k, v]) =>
          `<div class="trace-row"><span class="ok">✓</span><span class="k">${k}</span><span class="v">${v}</span></div>`
      )
      .join("");

    renderBlob(ctx.evidenceCount);
  }

  /** Renders a deterministic-looking ciphertext so the privacy claim is visible. */
  function renderBlob(count) {
    if (count === 0) {
      byId("blob").textContent = "— no private evidence attached —";
      byId("blobSize").textContent = "0 bytes";
      return;
    }
    const bytes = 64 + count * 48;
    const hex = "0123456789abcdef";
    let out = "0x04";
    for (let i = 0; i < bytes; i++) {
      out += hex[(Math.random() * 16) | 0] + hex[(Math.random() * 16) | 0];
    }
    byId("blob").textContent = out;
    byId("blobSize").textContent = bytes + " bytes";
  }

  /* ----------------------------------------------------------
     "Analyze privately" — staged reveal for demo impact
     ---------------------------------------------------------- */

  async function runAnalysis() {
    const btn = byId("analyzeBtn");
    const steps = [
      "Encrypting evidence…",
      "Sending instruction on-chain…",
      "Awaiting provider consensus…",
      "Computing inside enclave…",
      "Signing attestation…",
    ];

    btn.disabled = true;
    for (const s of steps) {
      btn.textContent = s;
      renderBlob(document.querySelectorAll(".ev.on").length);
      await new Promise((r) => setTimeout(r, 380));
    }
    btn.textContent = "Analyze privately";
    btn.disabled = false;

    await window.TL.refreshChain();
    document.querySelector(".sim-output").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* ----------------------------------------------------------
     Wiring
     ---------------------------------------------------------- */

  ["collateral", "borrow", "vol"].forEach((id) => byId(id).addEventListener("input", render));

  document.querySelectorAll(".ev").forEach((el) =>
    el.addEventListener("click", () => {
      el.classList.toggle("on");
      render();
    })
  );

  byId("analyzeBtn").addEventListener("click", runAnalysis);

  // Re-render whenever the shell pulls a fresh price.
  document.addEventListener("tl:price", render);

  // Start with two attestations enabled so the first paint tells the story.
  document
    .querySelectorAll('.ev[data-k="history"], .ev[data-k="clean"]')
    .forEach((el) => el.classList.add("on"));

  render();
})();
