/* ============================================================
   TrustLens — pre-signature risk scan (landing page)

   Scoring is deterministic: the same address always produces the
   same verdict, so a demo can be repeated on stage without surprises.
   Factor data is a sample dataset (labelled as such in the UI) —
   the only live input is the FTSOv2 reference price from shell.js.
   ============================================================ */

(() => {
  const $ = (id) => document.getElementById(id);

  /* ---------- Factor definitions — weights match the published table ---------- */

  const FACTORS = [
    { key: "age",        name: "Contract age & verification", weight: 22 },
    { key: "liquidity",  name: "Liquidity depth & lock",      weight: 20 },
    { key: "holders",    name: "Holder concentration",        weight: 18 },
    { key: "permission", name: "Permission surface",          weight: 16, critical: true },
    { key: "oracle",     name: "Oracle price deviation",      weight: 14 },
    { key: "exploit",    name: "Known exploit patterns",      weight: 10, critical: true },
  ];

  // A critical factor scoring at or below this caps the whole verdict at STOP,
  // so deep liquidity can never rescue a contract that can mint without limit.
  const CRITICAL_FLOOR = 25;

  /* ---------- Hand-authored sample cases ---------- */

  const CASES = {
    safe: {
      address: "0x4d2c...8ba1",
      scores: { age: 94, liquidity: 88, holders: 79, permission: 91, oracle: 96, exploit: 100 },
      notes: {
        age: "verified 14 months ago",
        liquidity: "$4.2M, locked 2 yrs",
        holders: "top holder 6.1%",
        permission: "no mint, no pause",
        oracle: "0.2% from FTSOv2",
        exploit: "no pattern match",
      },
    },
    caution: {
      address: "0x9f61...2e07",
      scores: { age: 31, liquidity: 44, holders: 38, permission: 62, oracle: 71, exploit: 88 },
      notes: {
        age: "deployed 9 days ago",
        liquidity: "$61k, unlocked",
        holders: "top holder 34%",
        permission: "owner can pause",
        oracle: "2.4% from FTSOv2",
        exploit: "no pattern match",
      },
    },
    danger: {
      address: "0xc07b...41fa",
      scores: { age: 12, liquidity: 21, holders: 8, permission: 4, oracle: 33, exploit: 15 },
      notes: {
        age: "deployed 2 days ago",
        liquidity: "$3.1k, withdrawable",
        holders: "top holder 91%",
        permission: "unlimited mint",
        oracle: "18.7% from FTSOv2",
        exploit: "matches 2 known",
      },
    },
  };

  /* ---------- Deterministic fallback for arbitrary input ---------- */

  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
  }

  /** Derives a stable, plausible-looking profile from any address string. */
  function derive(address) {
    const h = hash(address.toLowerCase());
    const scores = {};
    const notes = {};
    FACTORS.forEach((f, i) => {
      // Each factor takes a different slice of the hash.
      const slice = (h >>> (i * 4)) & 0xff;
      scores[f.key] = Math.round((slice / 255) * 100);
      notes[f.key] = "sample dataset";
    });
    return { address, scores, notes };
  }

  /* ---------- Verdict ---------- */

  const VERDICTS = {
    proceed: { label: "PROCEED",  glyph: "✓", colour: "var(--verified)", note: "No factor crossed a warning threshold." },
    caution: { label: "CAUTION",  glyph: "!", colour: "var(--amber)",    note: "Proceed only if you understand the flagged factors." },
    stop:    { label: "STOP",     glyph: "✕", colour: "var(--alert)",    note: "A critical factor failed. Do not sign this transaction." },
  };

  function evaluate(profile) {
    const totalWeight = FACTORS.reduce((s, f) => s + f.weight, 0);
    const score = Math.round(
      FACTORS.reduce((s, f) => s + profile.scores[f.key] * f.weight, 0) / totalWeight
    );

    const criticalFailure = FACTORS.some(
      (f) => f.critical && profile.scores[f.key] <= CRITICAL_FLOOR
    );

    let verdict;
    if (criticalFailure || score < 40) verdict = "stop";
    else if (score < 72) verdict = "caution";
    else verdict = "proceed";

    return { score, verdict, criticalFailure };
  }

  function factorColour(v) {
    if (v >= 70) return "var(--verified)";
    if (v >= 40) return "var(--amber)";
    return "var(--alert)";
  }

  /* ---------- Build the aperture blades ---------- */

  function buildBlades() {
    const g = $("blades");
    if (!g) return;
    const cx = 95, cy = 95, r = 78, span = 64; // slight overlap so the iris reads as closed
    let out = "";
    for (let i = 0; i < 6; i++) {
      const a0 = ((i * 60 - span / 2) * Math.PI) / 180;
      const a1 = ((i * 60 + span / 2) * Math.PI) / 180;
      const x0 = (cx + r * Math.cos(a0)).toFixed(2), y0 = (cy + r * Math.sin(a0)).toFixed(2);
      const x1 = (cx + r * Math.cos(a1)).toFixed(2), y1 = (cy + r * Math.sin(a1)).toFixed(2);
      out += `<path class="ap-blade" d="M${cx} ${cy} L${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1} Z" />`;
    }
    g.innerHTML = out;
  }

  /* ---------- Render ---------- */

  function renderFactors(profile, staggered) {
    const host = $("factors");
    host.innerHTML = FACTORS.map((f) => {
      const v = profile.scores[f.key];
      return `
        <div class="factor" data-k="${f.key}">
          <div class="f-name">${f.name}</div>
          <div class="f-meter"><i style="background:${factorColour(v)}"></i></div>
          <div class="f-verdict" style="color:${factorColour(v)}">${profile.notes[f.key]}</div>
        </div>`;
    }).join("");

    const rows = [...host.querySelectorAll(".factor")];
    rows.forEach((row, i) => {
      const v = profile.scores[FACTORS[i].key];
      const show = () => {
        row.classList.add("in");
        row.querySelector(".f-meter i").style.width = v + "%";
      };
      if (staggered) setTimeout(show, 120 + i * 130);
      else show();
    });
  }

  function renderVerdict({ score, verdict, criticalFailure }, profile) {
    const v = VERDICTS[verdict];

    $("apScore").textContent = score;
    $("apScore").style.color = v.colour;

    const card = $("verdictCard");
    card.style.borderColor = v.colour;
    $("vcGlyph").textContent = v.glyph;
    $("vcGlyph").style.background = v.colour;
    $("vcGlyph").style.color = "var(--ink-900)";
    $("vcTitle").textContent = v.label;
    $("vcTitle").style.color = v.colour;
    $("vcNote").textContent = criticalFailure
      ? "A critical factor failed — this caps the verdict regardless of the other scores."
      : v.note;
    card.classList.add("show");

    const ap = $("aperture");
    ap.setAttribute("aria-label", `Trust score ${score} of 100. Verdict: ${v.label}.`);
  }

  /* ---------- Scan sequence ---------- */

  let running = false;

  async function scan(profile) {
    if (running) return;
    running = true;

    const ap = $("aperture");
    const btn = $("scanGo");
    const state = $("scanState");

    btn.disabled = true;
    $("verdictCard").classList.remove("show");
    $("factors").innerHTML = "";
    ap.classList.remove("open");
    ap.classList.add("scanning");

    const steps = [
      "reading chain state",
      "querying FTSOv2",
      "checking permissions",
      "scoring factors",
    ];
    for (const s of steps) {
      state.textContent = s;
      await new Promise((r) => setTimeout(r, 340));
    }

    ap.classList.remove("scanning");
    ap.classList.add("open");
    state.textContent = "complete · sample dataset";

    const result = evaluate(profile);
    renderVerdict(result, profile);
    renderFactors(profile, true);

    btn.disabled = false;
    running = false;
  }

  /* ---------- Wiring ---------- */

  buildBlades();

  $("scanForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = $("addr").value.trim();
    if (!raw) return;
    // Recognise the sample addresses so the curated cases stay reachable by typing.
    const match = Object.values(CASES).find((c) => c.address === raw);
    scan(match || derive(raw));
  });

  document.querySelectorAll(".sample").forEach((b) =>
    b.addEventListener("click", () => {
      const c = CASES[b.dataset.case];
      $("addr").value = c.address;
      scan(c);
    })
  );

  /* ---------- Live header stats from the shared shell ---------- */

  function syncStats() {
    const tl = window.TL;
    if (!tl) return;
    if (typeof tl.price === "number") $("statPrice").textContent = "$" + tl.price.toFixed(4);
    if (tl.block) $("statBlock").textContent = tl.block.toLocaleString();
  }
  document.addEventListener("tl:price", syncStats);
  syncStats();

  /* ---------- Scroll reveal + animated weight bars ---------- */

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        // The weight table fills only once it's actually on screen.
        e.target.querySelectorAll?.(".bar-row").forEach((row, i) => {
          setTimeout(() => {
            row.querySelector(".bar-fill").style.width = row.dataset.w * 2.6 + "%";
          }, i * 90);
        });
        io.unobserve(e.target);
      });
    },
    { threshold: 0.15 }
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  // First paint: show the safe case so the instrument is never empty.
  renderFactors(CASES.safe, false);
  renderVerdict(evaluate(CASES.safe), CASES.safe);
  $("aperture").classList.add("open");
  $("addr").value = CASES.safe.address;
})();
