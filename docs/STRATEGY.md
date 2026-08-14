# TrustLens — Strategy & Positioning

> Internal document. This is the reasoning behind the product. Not for submission.

---

## 1. Hackathon intelligence (verified from the DoraHacks page)

| Fact | Value | Consequence |
|---|---|---|
| **Final submission deadline** | **14 Aug, 19:59** | You have ~5 working days. Scope must be brutal. |
| Judging period | 15–21 Aug | No post-deadline fixes. Demo must work on submit day. |
| Winner announcement | 24 Aug | — |
| Prize pool | $12,000 across **2 bounties** | — |
| Bounty 1 — Interoperable Asset Products | $6,000 (1st $4k / 2nd $2k) | FAssets / FXRP / cross-chain |
| Bounty 2 — Confidential Compute Apps | $6,000 (1st $4k / 2nd $2k) | Flare Confidential Compute (FCC) |
| Registered hackers | 507 | Most will not finish. A *working* demo is top-decile by default. |

**Judging criteria (exact wording):**

1. **Product usefulness** — does it solve a real user/developer/ecosystem/infra problem?
2. **Flare integration quality** — meaningful, or superficial?
3. **Technical execution** — *does the demo work?* Is the architecture credible and understandable?
4. **Evidence of new work** — clearly show what was newly built during the program.
5. **Clarity and future potential** — can you explain it, and is there a credible path beyond the hackathon?

**Three under-exploited scoring levers:**

- Criterion 3 says *"does the demo work"*. A large fraction of submissions will be slide decks and dead links. **A working, deployed, clickable demo is the single highest-ROI investment.**
- Criterion 4 rewards an explicit changelog. Almost nobody writes one. A `WHAT-WE-BUILT.md` with commit links is nearly free marks.
- The page explicitly invites *"deployed on Coston2, Songbird, or Flare Mainnet"*, *"traction signals"*, *"pilot users"*. Free differentiation: ship contract addresses + an explorer link + 3 real testers.

**Bounty targeting:** submit to **Bounty 2 (Confidential Compute)** as primary. The page permits "selected bounty or bounties" — the architecture below legitimately touches Bounty 1 via FXRP, so claim both, but let Bounty 2 carry the narrative. Bounty 2 is also likely the *thinner* field: FCC is new, Go-based, and harder to fake, so fewer teams will complete it.

---

## 2. Honest critique of the original TrustLens document

The instinct is good. The framing has three real problems.

### Problem A — The privacy story does not hold up (most serious)

The original flow is:

> User enters *their own* private risk tolerance → TEE computes a score → **the same user** reads the score.

If the only party who supplies the secret is also the only party who consumes the result, **the TEE is doing no work that `if (ltv > 0.6)` in the browser could not do.** A sharp judge will ask *"why not just compute this client-side?"* and the project collapses.

Confidential compute is only justified when:

> **A party who is not allowed to see the data must nevertheless trust the result of a computation over it.**

That is the pivot in §3.

### Problem B — Wrong technology stack for FCC

The document specifies Python / pandas / scikit-learn / XGBoost / FastAPI for the confidential layer. **Flare Compute Extensions are Go HTTP servers shipped as reproducible Docker images.** The image hash *is* the on-chain code version. A Python FastAPI service sitting on a VM is not a Flare Compute Extension and will score near-zero on "Flare integration quality".

Fix: train in Python, **export the model to a portable artifact, and run inference in Go inside the TEE.** (This turns out to be a feature — see §4.)

### Problem C — Length, hedging, and repetition

- 30 sections. Judges reviewing hundreds of entries will read the first screen.
- Sections 15 and 16 restate each other; "Flare Compute Extensions" appears twice verbatim in the source material.
- Pervasive hedging: *can*, *could*, *possible*, *would be configurable*. Reads as a proposal, not a product.
- `Confidence: 94%` is a credibility landmine. An unbacked confidence number invites exactly the scrutiny you cannot survive.

Fix: one tight README, hard claims, numbers you can defend.

---

## 3. The pivot: from *dashboard* to *credit oracle*

**Keep the name, keep the pillars, change who the secret is hidden from.**

| | Original | Repositioned |
|---|---|---|
| Whose data | User's own risk tolerance | User's **verifiable financial history** (XRPL account, off-chain assets) |
| Hidden from | The public | **The lender / protocol** |
| Output consumer | The user | **A smart contract that must act on it** |
| Value created | Information | **Capital efficiency** |
| Why TEE | Unclear | **Structurally necessary** |

### The product, in one sentence

> **TrustLens lets a borrower prove they deserve better loan terms without revealing the financial history that proves it.**

### Why this is structurally sound

In DeFi, every borrower is treated identically: a whale with a decade of clean XRPL settlement history and an anonymous fresh wallet both post ~150% collateral. That is a **real, expensive, universally acknowledged problem** — capital inefficiency caused by the absence of credit identity.

You cannot fix it by publishing credit data (privacy + competitive leakage). You cannot fix it by trusting a centralized scorer (that is TradFi). You *can* fix it with an attested TEE:

```
Borrower's private financial evidence
        │  (ECIES-encrypted to the TEE's public key)
        ▼
┌───────────────────────────────────────────┐
│  TrustLens Compute Extension (in TEE)     │
│  · decrypts evidence — never leaves enclave│
│  · verifies XRPL facts via FDC proofs      │
│  · reads XRP/USD via FTSOv2                │
│  · runs pinned, attested risk model        │
│  · signs {score, maxLTV, expiry, nonce}    │
└───────────────────────────────────────────┘
        │  signed attestation only
        ▼
  Lending contract: ecrecover → is this a registered
  TEE machine for our extension? → grant tier'd LTV
        │
        ▼
  Deterministic guardrail: live FTSOv2 price check,
  hard collateral floor. Contract overrules model.
```

The lender learns **one number and a signature**. Not the portfolio. Not the history.

### The line that wins the room

> "Alice posts 150% collateral. So does a wallet created this morning. TrustLens lets Alice prove she is not that wallet — **without showing anyone her books** — and borrow at 120% instead. The extra 30% is real money, unlocked by privacy."

---

## 4. The sleeper feature: the *model itself* is attested

This is the strongest technical differentiator available and almost nobody will use it.

An FCC extension's code version **is the hash of its reproducible Docker image**, registered on-chain. If the risk model is baked into that image, then:

- The exact model weights that scored a user are **cryptographically pinned and publicly identifiable**.
- The operator **cannot silently swap the model** to a biased or malicious version.
- A user can verify: *"the score that set my loan terms came from model `0xab12…`, the same model everyone else was scored with."*

That is **verifiable AI with a real trust anchor** — not a marketing phrase. It also directly answers "isn't this just an AI wrapper?": an AI wrapper cannot prove which model ran.

Consequence for engineering: inference must be **deterministic** (fixed-point or strictly reproducible float ops, no GPU nondeterminism, no network calls to a model API). This is another reason to compile the model into Go rather than call out to Python.

---

## 5. Making the ML defensible

The original doc's ML section would not survive a quant judge. Replace vibes with a well-posed problem.

**Bad framing:** "AI predicts risk." → unfalsifiable, untestable in 5 days.

**Good framing — a supervised problem with real labels from real data:**

> Given XRP market state and a position's LTV today, estimate
> **P(the position breaches its liquidation threshold within the next 7 days)**.

- **Labels are free and real.** Take years of historical XRP/USD daily data. For each day and each simulated LTV, look forward 7 days: did the price fall enough to breach? That is a genuine binary label from genuine history. No synthetic data.
- **Features:** realized volatility (7d/30d), max drawdown, return skew/kurtosis, distance-to-liquidation in σ units, current LTV, trend.
- **Model:** logistic regression or a small gradient-boosted ensemble. Small enough to reimplement exactly in Go.
- **Report calibration, not accuracy.** Brier score and a reliability curve. Compare against a Monte-Carlo GBM baseline. Saying *"when we say 20%, it happens 20% of the time"* is far more impressive than *"94% confidence"*.
- **State the limits out loud.** One asset, 7-day horizon, backtested on N years, not investment advice. Judges reward calibrated honesty and punish overclaiming.

Then the private inputs genuinely matter: the borrower's *other* holdings and history change their true risk, and only the TEE can see them.

---

## 6. Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| **FCC is "in final stages of development, not yet fully public"** | **High** | Assume friction. Spend Day 1 getting the Hello World scaffold running end-to-end *before* writing product code. If FCC blocks you, fall back to Tier C (§ BUILD-PLAN) and keep the TEE interface identical. |
| 5 days, ambitious scope | High | Tiered scope: Tier A must ship, B if time, C is stretch. Never start C before A is demo-able. |
| Go is unfamiliar | Medium | The extension is one HTTP handler and a scoring function. Keep all ML training in Python; only inference is Go. |
| Local proxy needs public HTTPS tunnel (ngrok/cloudflared) | Medium | Set up and test the tunnel on Day 1. This is a classic day-5 killer. |
| Demo depends on live testnet | Medium | **Record the video the day before the deadline.** Cache a known-good response for the live demo. |
| Model looks like a toy | Medium | Lead with calibration plot + backtest table in the README. |

---

## 7. Self-scoring against the official criteria

| Criterion | How TrustLens scores | Evidence to ship |
|---|---|---|
| Product usefulness | Capital efficiency in overcollateralized lending — a real, quantified, universal DeFi problem | "150% → 120%" worked example with dollar figures |
| Flare integration quality | FCC extension + FTSOv2 + FDC + FXRP. Each load-bearing; remove any one and the product breaks | Architecture diagram + a one-line justification per component |
| Technical execution | Deployed on Coston2, clickable demo, verifiable tx | Contract addresses + explorer links + 3-min video |
| Evidence of new work | Built from zero during the program | `WHAT-WE-BUILT.md` + clean commit history |
| Clarity & future potential | Risk-scoring as a reusable Flare primitive; other protocols consume the attestation | Roadmap + the "risk oracle for the ecosystem" framing |

**The one thing to protect above all else:** a working demo on 14 Aug. Ruthlessly cut anything that threatens it.
