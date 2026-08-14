<div align="center">

# TrustLens

### Private credit scoring for on-chain lending

**Prove you deserve better loan terms — without revealing the financial history that proves it.**

Built for **Flare Summer Signal** · Bounty 2 (Confidential Compute Apps) · Bounty 1 (Interoperable Asset Products)

[Live risk engine](https://trustlens-flare.vercel.app/demo.html) · [Run it locally](#run-it-locally) · [What's actually built](WHAT-WE-BUILT.md) · [Full status](https://trustlens-flare.vercel.app/safety.html#status)

Mirrored at [gracetemmy.github.io/trustlens](https://gracetemmy.github.io/trustlens/) if the primary link is ever unreachable.

</div>

---

## The problem

In DeFi lending, **every borrower is treated as a stranger.**

A wallet with eight years of clean XRP Ledger settlement history and $400k in verifiable assets posts the same **150% collateral** as a wallet created ten minutes ago.

That gap is not a rounding error. On a $100,000 loan it is **$30,000 of capital left idle** — not because the borrower is risky, but because the protocol has no safe way to learn that they are not.

The obvious fix is to let borrowers share their financial history. Nobody will do that. Publishing your balance sheet on a transparent chain leaks your net worth, your strategy, and your positions to every competitor and every liquidation bot watching.

| Option | Cost |
|---|---|
| Publish your financial history | Total loss of privacy |
| Trust a centralized credit scorer | You rebuilt TradFi, with a database nobody can audit |

**TrustLens is the third option.**

---

## The solution

TrustLens scores a borrower's risk **inside a Trusted Execution Environment** on Flare Confidential Compute, and emits a **signed attestation** that a lending contract can verify on-chain.

The lender learns exactly one thing: *the maximum LTV this borrower has earned.* Not the portfolio. Not the history. Not the strategy.

```
  Borrower's private financial evidence
            │
            │  ECIES-encrypted to the TEE's public key.
            │  Unreadable to the operator, the relayer, and the chain.
            ▼
 ┌────────────────────────────────────────────────────┐
 │   TrustLens Compute Extension  ·  runs in a TEE    │
 │                                                     │
 │   1. Decrypts evidence inside the enclave           │
 │   2. Verifies XRPL account facts  → FDC proofs      │
 │   3. Reads live XRP/USD           → FTSOv2          │
 │   4. Scores with a hash-pinned, attested model      │
 │   5. Signs { score, maxLTV, expiry, nonce }         │
 └────────────────────────────────────────────────────┘
            │
            │  Only the signed attestation leaves the enclave.
            ▼
 ┌────────────────────────────────────────────────────┐
 │   TrustLensVault.sol  ·  on Flare                  │
 │                                                     │
 │   ecrecover(attestation) → is this signer a         │
 │   registered TEE machine for our extension?         │
 │                                                     │
 │   THEN: hard deterministic guardrail →              │
 │   re-read FTSOv2 price, enforce collateral floor.   │
 │   The contract can always overrule the model.       │
 └────────────────────────────────────────────────────┘
            │
            ▼
     Borrow FXRP at an earned, personalized LTV
```

**Target outcome: 150% → 120% collateral, with the lender's safety guaranteed by a signature and a price check, not by trust.**

This diagram is the full design — the section below is honest about how much of it is running today versus specified for the next build phase.

---

## What's actually live right now

Judges click links, so here is the exact line between what runs and what's designed, mirrored on [`site/safety.html`](site/safety.html#status):

| Component | Status | Where |
|---|---|---|
| Live FTSOv2 reads (XRP/USD, block height) on Coston2 | ✅ **Live** | Every page, refreshed every 15s — [`site/js/shell.js`](site/js/shell.js) |
| Interactive risk engine (logistic scoring, live feature attribution) | ✅ **Live** | [`site/demo.html`](site/demo.html) — [`site/js/app.js`](site/js/app.js) |
| Public-vs-private input scan (page-1 hero widget) | ✅ **Live**, client-side only | [`site/index.html`](site/index.html) |
| `TrustLensVault.sol` guardrail logic (subject/expiry/nonce/LTV-cap) | ◐ Written and shown as code | [`site/safety.html`](site/safety.html) |
| Enclave extension architecture (Go, FCC-shaped) | ◐ Specified against the FCC docs | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Trained model coefficients | ○ Not yet — current weights are illustrative, hand-tuned | [`site/js/app.js`](site/js/app.js) |
| Deployed contracts / on-chain attestation round trip | ○ Not yet | — |

Nothing above is hidden in fine print — the demo says this about itself, out loud, because a risk product that overstates its own limits is the last thing anyone should trust.

---

## Why this needs a TEE (and is not an "AI wrapper")

The honest test for any confidential-compute project:

> *Could you delete the TEE and compute this in the browser?*

For TrustLens, no — and the reason is structural:

- The **borrower** owns the data and will not publish it.
- The **lending contract** must act on a conclusion drawn from that data.
- These are **different parties with opposing incentives.** The borrower is motivated to overstate; the lender cannot verify without seeing.

A TEE is the only component that can hold the secret, compute honestly, and produce a result the counterparty can verify without ever seeing the input. Remove it and the product does not degrade — it ceases to exist.

### The model itself is attested

An FCC extension's on-chain code version is **the hash of its reproducible Docker image.** A risk model compiled into that image cannot be silently swapped by the operator. Any borrower could verify that the model which set their loan terms is byte-for-byte the model everyone else was scored with — and that it was not quietly retrained to disadvantage them.

An API-calling "AI wrapper" cannot make that guarantee. This is the trust anchor an ordinary model-as-a-service can't offer, and it's the reason the architecture is built around FCC rather than any off-chain inference API.

---

## How TrustLens uses Flare

Each component is load-bearing in the design. Remove any one and the product breaks.

| Flare component | What it does here | Status |
|---|---|---|
| **FTSOv2** | Live XRP/USD, decentralized, ~1.8s block-latency feeds — collateral valuation input, used identically in the model and as a deterministic guardrail | ✅ Live — reading Coston2 in the browser right now |
| **Flare Confidential Compute (FCC)** | Hosts the scoring extension in a TEE; signs attestations with a registered TEE identity | ◐ Specified — architecture defined against the FCC docs, not yet deployed (FCC is itself pre-production) |
| **Flare Data Connector (FDC)** | Attests XRP Ledger account facts (payment history, account age), turning self-reported claims into proven facts | ◐ Specified |
| **FAssets / FXRP** | The collateral asset being borrowed against — brings XRP, a non-smart-contract asset, into a programmable lending position | ◐ Specified |

> Flare is not decoration here. TrustLens is designed around an oracle, an external-data prover, a confidential runtime, and an EVM to enforce the outcome. Flare is the only network that ships all four as first-class primitives — which is why one of the four is already running against it, live, rather than mocked.

---

## The risk model

We deliberately avoid unfalsifiable claims like "AI predicts risk." The model answers a narrow, testable question:

> Given current XRP market conditions and a position's LTV, what is the probability this position **breaches its liquidation threshold within 7 days**?

- **Real labels from real history (designed).** For every day of historical XRP/USD data and each simulated LTV, look 7 days forward and record whether the threshold was breached. No synthetic data — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#4-the-ml-pipeline) for the full label construction.
- **Features:** realized volatility, distance-to-liquidation in standard deviations, current LTV, and (once the enclave is live) the borrower's private evidence.
- **Calibration over accuracy.** The plan is to report Brier score and a reliability curve against a Monte-Carlo baseline, not an unbacked confidence number.
- **What's running today:** the same logistic functional form, live in the browser at [`site/demo.html`](site/demo.html), with **illustrative, hand-tuned coefficients** — clearly labeled as such on the page. Training on real historical data with walk-forward validation is the next step, not yet done.

**Stated limits:** one asset, one horizon, not audited, not investment advice. The model advises; the smart contract's collateral floor is what's designed to actually protect the lender.

---

## Run it locally

The only thing that runs today is a static site with a live on-chain data connection — no build step, no backend, no dependencies beyond Python's stdlib.

```powershell
# 1. Serve the site
python -m http.server 5173 --directory site
# then open http://localhost:5173

# 2. (optional) Sanity-check the live FTSOv2 connection independently
python tools/verify_ftso.py
```

`verify_ftso.py` talks directly to `coston2-api.flare.network` and prints the live XRP/USD, FLR/USD, BTC/USD, and ETH/USD feeds — useful for confirming the RPC path works before trusting anything the page shows.

Any static file server works in place of `python -m http.server` (`npx serve site`, VS Code Live Server, etc.).

---

## Repository layout

```
trustlens/
├── README.md
├── WHAT-WE-BUILT.md        what shipped during the program vs. what's still designed
├── docs/
│   ├── STRATEGY.md         positioning and judging-criteria self-assessment (internal)
│   ├── ARCHITECTURE.md     verified Flare facts + full system design (enclave, contract, ML pipeline)
│   ├── BUILD-PLAN.md       the 5-day build plan this was executed against
│   └── DEMO-VIDEO.md       the actual (honest) demo video script
├── site/                   the live artifact — static, reads Coston2 directly from the browser
│   ├── index.html          hero + public risk scan
│   ├── demo.html           the interactive credit engine (the main demo)
│   ├── privacy.html        the 9-step data flow, public vs. private
│   ├── flare.html          Flare integration detail, verified live
│   ├── safety.html         the model-vs-contract guardrail, and the honest status board
│   └── js/                 shell.js (chain reads, nav) + app.js (scoring, rendering)
└── tools/
    └── verify_ftso.py      zero-dependency FTSOv2 sanity check
```

The Go enclave extension, Solidity vault, and trained model referenced throughout the docs above are **designed, not yet implemented as code** in this repository. See [`WHAT-WE-BUILT.md`](WHAT-WE-BUILT.md) for the precise line and [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md) for the build sequence that would complete them.

---

## Roadmap

| Horizon | Milestone |
|---|---|
| **Next** | Ship the Go FCC extension and `TrustLensVault.sol` from `docs/ARCHITECTURE.md`; deploy to Coston2; replace illustrative coefficients with a trained, calibrated model |
| **Then** | FDC-attested XRPL history feeding the score; real FXRP transfers; multi-asset collateral |
| **Later** | **TrustLens as a shared primitive** — any Flare protocol requests a signed risk attestation for a user and prices risk without ever holding their data; portable private credit identity across chains |

The end state is not a dashboard. It is a **risk oracle for the Flare ecosystem**: privacy-preserving underwriting that any protocol can consume, the way any protocol today consumes a price feed.

---

<div align="center">

**TrustLens** — Private intelligence. Verifiable data. Safer on-chain decisions.

</div>
