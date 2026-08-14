# TrustLens — pitch site & live risk engine

A single-page site that explains TrustLens and lets anyone **use** the risk engine
in the browser. It reads live XRP/USD from **FTSOv2 on Flare Coston2** — no backend,
no build step, no dependencies.

## Run it

```powershell
python -m http.server 5173 --directory site
```

Then open <http://localhost:5173>.

Any static server works (`npx serve site`, Live Server, etc.). Opening `index.html`
directly via `file://` also mostly works, but a server is preferred so the RPC
`fetch` runs from a proper origin.

## What's actually live

| Element | Source |
| --- | --- |
| XRP/USD price | `getFeedById()` on FtsoV2 `0x3d893C53D9e8056135C26C8c638B76C8b60Df726`, Coston2 |
| Block height | `eth_blockNumber` on `coston2-api.flare.network` |
| Risk score | Logistic model evaluated client-side, using the live price |
| Everything else | Illustrative — the enclave and vault are described, not deployed |

The price refreshes every 15s. If the RPC is unreachable the status dot goes grey,
the page falls back to a cached price, and the simulator keeps working — a dead
network should never kill a live demo.

## The demo moment

The default state is deliberately tuned so that **toggling private evidence alone
walks the beacon through every tier**, on identical collateral:

| Private evidence | Risk | Signal |
| --- | --- | --- |
| none | 13.0% | 🔴 RESTRICTED |
| 1 item | 7.3% | 🟠 STANDARD |
| 2 items | 3.5% | 🟡 STRONG |
| all 4 | 1.4% | 🟢 PRIME |

Same wallet, same collateral, same market. The only variable is how much the
borrower can *prove* — which is the entire thesis, demonstrated live rather than
asserted on a slide.

## Deploy

It's static, so anything works:

```powershell
# GitHub Pages
git subtree push --prefix site origin gh-pages

# Netlify / Vercel / Cloudflare Pages
#   publish directory: site      build command: (none)
```

## Files

```
site/
├── index.html      # all copy and structure
├── css/styles.css  # design system, animations, responsive rules
└── js/app.js       # RPC reads, risk model, rendering
```

Model coefficients live in the `MODEL` constant at the top of `app.js`, and tier
thresholds in `TIERS` directly above it. Both are intentionally easy to retune —
swap in trained weights and the page needs no other changes.
