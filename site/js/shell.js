/* ============================================================
   TrustLens — shared shell
   Injects nav + footer on every page, owns the live Flare
   connection, and broadcasts price updates to whoever cares.
   ============================================================ */

const RPC = "https://coston2-api.flare.network/ext/C/rpc";
const FTSOV2 = "0x3d893C53D9e8056135C26C8c638B76C8b60Df726";
const XRP_USD = "0x015852502f55534400000000000000000000000000";
const SEL_GET_FEED = "0x93e9f806"; // getFeedById(bytes21)
const FALLBACK_PRICE = 1.0359; // last verified value, used only if RPC is unreachable

// Shared state other scripts read.
window.TL = { price: FALLBACK_PRICE, live: false, block: null };

const PAGES = [
  { href: "index.html", label: "Overview" },
  { href: "scan.html", label: "Scan" },
  { href: "problem.html", label: "Problem" },
  { href: "demo.html", label: "Risk Engine" },
  { href: "privacy.html", label: "Privacy" },
  { href: "flare.html", label: "Built on Flare" },
  { href: "safety.html", label: "Limits" },
];

const $ = (id) => document.getElementById(id);

// The lens motif, defined once and referenced by every page via <use href="#lens">.
const LENS_SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="lens" viewBox="0 0 100 100">
    <circle class="iris" cx="50" cy="50" r="38" />
    <path class="blade" d="M50 12 L69 45 L31 45 Z" />
    <path class="blade" d="M83 69 L45 69 L64 36 Z" opacity="0.55" />
    <path class="blade" d="M17 69 L36 36 L55 69 Z" opacity="0.75" />
    <circle class="pupil" cx="50" cy="50" r="11" />
  </symbol>
</svg>`;

const LENS = `<svg class="lens-mark" viewBox="0 0 100 100" aria-hidden="true"><use href="#lens" /></svg>`;

/* ------------------------------------------------------------
   Shell markup
   ------------------------------------------------------------ */

function currentPage() {
  const file = location.pathname.split("/").pop();
  return !file || file === "" ? "index.html" : file;
}

function injectShell() {
  const here = currentPage();

  // Favicon is registered here so every page picks it up without duplicating markup.
  if (!document.querySelector('link[rel="icon"]')) {
    const icon = document.createElement("link");
    icon.rel = "icon";
    icon.type = "image/svg+xml";
    icon.href = "favicon.svg";
    document.head.appendChild(icon);
  }

  if (!document.getElementById("lens")) {
    document.body.insertAdjacentHTML("afterbegin", LENS_SPRITE);
  }

  const links = PAGES.map(
    (p) =>
      `<a href="${p.href}"${p.href === here ? ' class="active" aria-current="page"' : ""}>${p.label}</a>`
  ).join("");

  document.body.insertAdjacentHTML(
    "afterbegin",
    `<nav>
      <div class="nav-inner">
        <a class="brand" href="index.html">${LENS} TrustLens</a>
        <div class="nav-links">${links}</div>
        <div class="chip" id="netChip" title="Live read from FTSOv2 on Flare Coston2">
          <span class="dot" id="netDot"></span>
          <span id="netText">connecting…</span>
        </div>
        <a class="nav-cta" href="demo.html">Launch app</a>
        <button class="nav-toggle" id="navToggle" aria-label="Toggle navigation" aria-expanded="false">☰</button>
      </div>
      <div class="nav-drawer" id="navDrawer">${links}</div>
    </nav>`
  );

  document.body.insertAdjacentHTML(
    "beforeend",
    `<footer>
      <div class="wrap">
        <div class="foot">
          <div>
            <div class="brand">${LENS} TrustLens</div>
            <div class="foot-tag">Private intelligence. Verifiable data. Safer on-chain decisions.</div>
          </div>
          <div class="foot-nav">
            <div class="foot-col">
              <h4>Pages</h4>
              ${PAGES.slice(1).map((p) => `<a href="${p.href}">${p.label}</a>`).join("")}
            </div>
            <div class="foot-col">
              <h4>Flare docs</h4>
              <a href="https://dev.flare.network/fcc/overview" target="_blank" rel="noopener">Confidential Compute</a>
              <a href="https://dev.flare.network/ftso/overview" target="_blank" rel="noopener">FTSOv2</a>
              <a href="https://dev.flare.network/fdc/overview" target="_blank" rel="noopener">Data Connector</a>
              <a href="https://coston2-explorer.flare.network" target="_blank" rel="noopener">Coston2 Explorer</a>
            </div>
          </div>
        </div>
        <p class="disclaimer">
          Built for the Flare Summer Signal hackathon. These pages run a demonstration risk model
          with illustrative coefficients and read live price data from FTSOv2 on Coston2 testnet.
          Not financial advice, contracts unaudited, no funds at risk.
        </p>
      </div>
    </footer>`
  );

  const toggle = $("navToggle");
  const drawer = $("navDrawer");
  toggle.addEventListener("click", () => {
    const open = drawer.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
}

/* ------------------------------------------------------------
   Flare RPC
   ------------------------------------------------------------ */

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

/** Reads a feed and decodes (value, decimals, timestamp). */
async function readFeed(feedId) {
  // bytes21 is left-aligned inside its 32-byte word
  const data = SEL_GET_FEED + feedId.slice(2).padEnd(64, "0");
  const raw = (await rpc("eth_call", [{ to: FTSOV2, data }, "latest"])).slice(2);

  const value = BigInt("0x" + raw.slice(0, 64));
  let decimals = BigInt("0x" + raw.slice(64, 128));
  if (decimals > 2n ** 255n) decimals -= 2n ** 256n; // int8 two's complement

  return { price: Number(value) / 10 ** Number(decimals) };
}

async function refreshChain() {
  const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };

  try {
    const [feed, blockHex] = await Promise.all([readFeed(XRP_USD), rpc("eth_blockNumber", [])]);

    window.TL.price = feed.price;
    window.TL.live = true;
    window.TL.block = Number(BigInt(blockHex));

    setText("statPrice", "$" + feed.price.toFixed(4));
    setText("statBlock", window.TL.block.toLocaleString());
    $("netDot").className = "dot live";
    $("netText").innerHTML = `Coston2 · XRP <b>$${feed.price.toFixed(4)}</b>`;
  } catch (err) {
    // Never let a network hiccup break the demo — degrade visibly but keep working.
    window.TL.live = false;
    setText("statPrice", "$" + FALLBACK_PRICE.toFixed(4));
    $("netDot").className = "dot stale";
    $("netText").textContent = "offline · cached price";
    console.warn("FTSOv2 read failed, using fallback:", err.message);
  }

  document.dispatchEvent(new CustomEvent("tl:price"));
}

/* ------------------------------------------------------------
   Scroll reveal (used on every page)
   ------------------------------------------------------------ */

function initReveals() {
  const obs = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
    { threshold: 0.08 }
  );
  document.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
}

/* ------------------------------------------------------------
   Waitlist form (index.html only, but wired here so it works
   regardless of which page hosts it — no backend, states the truth)
   ------------------------------------------------------------ */

function initWaitlist() {
  const form = $("waitForm");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const note = $("waitNote");
    note.textContent = "Noted locally — this demo has no backend, so nothing was sent.";
    note.style.color = "var(--verified)";
  });
}

injectShell();
initReveals();
initWaitlist();
refreshChain();
setInterval(refreshChain, 15000);

window.TL.refreshChain = refreshChain;
