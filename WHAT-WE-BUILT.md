# What We Built During Flare Summer Signal

> Judging criterion 4 asks for explicit evidence of new work. This states plainly what exists
> as working code versus what is designed but not yet implemented — see `docs/DEMO-VIDEO.md`
> for why we chose honesty over overclaiming.

---

## Prior work

**None.** TrustLens was started from zero on 9 Aug 2026, after the registration window opened. There is no pre-existing codebase, product, or deployment. Everything listed below was written during the program.

---

## Built during the program

### Live static site (`site/`)

The actual working artifact — no backend, no build step, reads Flare directly from the browser.

| Component | What it does |
|---|---|
| `shell.js` — chain connection | Reads live XRP/USD and block height from FtsoV2 on Coston2 via raw `eth_call`, decodes the `(value, decimals, timestamp)` tuple correctly per-feed (XRP=6 decimals, not a hardcoded 18), refreshes every 15s, degrades to a labeled cached price if the RPC is unreachable |
| `app.js` — risk engine | Client-side logistic scoring function (distance-to-liquidation in σ, LTV, realized volatility, private-evidence weight), live feature attribution sorted by contribution magnitude, tier assignment (PRIME/STRONG/STANDARD/RESTRICTED), and a rendered mock ciphertext blob to make the privacy claim visible |
| `index.html` — public risk scan | A second, independent client-side scoring widget (contract/wallet risk) demonstrating the "what's public vs. private" split before the credit product is even introduced |
| `demo.html` — the credit engine | The main demo: sliders for collateral/borrow/volatility, four toggleable "private evidence" items, live-updating score, tier, and capital-efficiency comparison against an unattested baseline |
| `privacy.html` | The 9-stage data flow from browser to signed attestation, with an explicit public/private field split and a stated-limits section (hardware trust assumption, metadata leakage, "the score itself is a disclosure") |
| `flare.html` | Flare integration detail with the verified Coston2 `FtsoV2` address and feed-ID derivation shown as real code |
| `safety.html` | The model-vs-contract guardrail argument, the `TrustLensVault.borrow()` Solidity shown as code, and the honest status board this file mirrors |
| `tools/verify_ftso.py` | Zero-dependency Python script that independently confirms the RPC path and feed-ID encoding against Coston2 — used to sanity-check the site's own chain reads |

### Design documents (`docs/`)

| Document | What it captures |
|---|---|
| `STRATEGY.md` | Judging-criteria self-assessment, the pivot from "self-scored dashboard" to "credit oracle for a counterparty," and the risk register |
| `ARCHITECTURE.md` | Verified Coston2/FTSOv2 facts, the full enclave↔contract system design, the `RiskAttestation` struct and its four defenses, the ML label-construction spec, and the deterministic-inference rules the Go implementation would need to follow |
| `BUILD-PLAN.md` | The 5-day scope-tiered build plan this repository was executed against |
| `DEMO-VIDEO.md` | The actual recording script, written after the scope reality was clear — supersedes the aspirational script in `BUILD-PLAN.md` |

---

## Not built — designed only

Stated plainly, because judges trust teams that know their own edges:

| Component | Status |
|---|---|
| Go FCC extension (enclave scoring service) | Architecture fully specified in `docs/ARCHITECTURE.md`; no Go code written |
| `TrustLensVault.sol` and any other contracts | Solidity shown as illustrative code on `site/safety.html`; not implemented as a compilable contract, not deployed |
| Trained risk model | The logistic functional form runs live client-side; its coefficients are hand-tuned and illustrative, not fit to historical XRP/USD data |
| FDC attestation of XRPL facts | Specified; no integration code |
| Real FXRP transfer / ECIES encryption | Specified; the demo renders a mock ciphertext blob to visualize the claim, it does not perform real encryption |
| On-chain deployment of any kind | None. No contract addresses exist yet |

---

## Flare integration summary

| Flare component | Status here | Load-bearing in the design? |
|---|---|---|
| FTSOv2 | **Live** — real `eth_call` reads against Coston2, decoded correctly per-feed, running in every page load | Yes — used as a model input and, in the designed contract, as an independent collateral-floor check |
| Flare Confidential Compute | Specified, not implemented | Yes — without it the lender cannot trust a private score |
| Flare Data Connector | Specified, not implemented | Yes for the credit-history claim — prevents invented history |
| FAssets / FXRP | Specified, not implemented | Yes — the collateral asset the whole product underwrites |

---

## Known limitations

- Only one Flare primitive (FTSOv2) is live; the other three are architecture, not code.
- No smart contract has been written in Solidity or deployed — the enforcement logic shown on `site/safety.html` is illustrative code demonstrating the design, not a compiled artifact.
- The risk model's coefficients are hand-tuned, not trained on historical data — the training pipeline described in `docs/ARCHITECTURE.md` has not been run.
- Single collateral asset (XRP) and a single illustrative 7-day risk horizon in the design.
- Not investment advice, and nothing here is audited.

---

## Testing and feedback

| Tester | Date | Feedback | Action taken |
|---|---|---|---|
| — | — | — | — |
