# TrustLens — 5-Day Build Plan

**Deadline: 14 Aug, 19:59.** Today is 9 Aug. That is five working days including submission day.

---

## The one rule

> **Something demo-able must exist end-to-end by the end of Day 2, even if every number in it is fake.**

Build the skeleton first, then replace fake parts with real ones. Teams that build components in isolation and integrate on the last day do not submit.

---

## Scope tiers — agree on these before writing code

### Tier A — must ship (this alone is a strong submission)

- [ ] FCC extension running on Coston2, scoring a position inside a TEE
- [ ] Private evidence ECIES-encrypted client-side, decrypted only in the enclave
- [ ] TEE-signed attestation verified on-chain via `ecrecover`
- [ ] FTSOv2 XRP/USD used for collateral valuation, in both the model and the contract guardrail
- [ ] Trained model with a real backtest and a calibration plot
- [ ] UI showing: request → private compute → score → tier → borrow
- [ ] Deployed contract addresses + explorer links
- [ ] 3-minute video
- [ ] README + `WHAT-WE-BUILT.md`

### Tier B — do only if Tier A is complete

- [ ] FDC `Web2Json` proof of an XRPL account fact feeding the score
- [ ] Actual FXRP transfer rather than a mock ERC-20
- [ ] Side-by-side comparison view: anonymous wallet vs. attested borrower

### Tier C — stretch, almost certainly not

- [ ] Multi-asset collateral
- [ ] Continuous monitoring / pre-liquidation alerts
- [ ] Third-party integration API

**Fallback:** if FCC blocks you (it is pre-production), ship the identical interface with a locally-run signer, label it honestly as "TEE simulation pending FCC availability", and show your enclave code plus registration attempt. Judges reward honest engineering over a fake demo. **Keep the Solidity verification path unchanged** — that is what proves you understood the architecture.

---

## Day 1 (9 Aug) — De-risk the unknowns

Do not write product code today. Today is purely about eliminating the things that can kill you on Day 5.

| # | Task | Done when |
|---|---|---|
| 1 | Clone `fce-extension-scaffold`, run Hello World end-to-end on Coston2 | `SAY_HELLO` returns through the full on-chain → TEE → result loop |
| 2 | Fund a Coston2 wallet from the faucet | Balance visible in explorer |
| 3 | Get `cloudflared`/`ngrok` tunnel working to port 6674 | Public HTTPS URL reaches your local proxy |
| 4 | Confirm FTSOv2 reads | `python tools/verify_ftso.py` prints a live XRP price |
| 5 | Download historical XRP/USD daily data | CSV on disk, several years |
| 6 | Skim `fce-weather-insurance` for the ECIES + `settle()` signature-verification pattern | You can point to the exact lines you will adapt |

**Day 1 exit criterion: an unmodified Hello World extension completes a round trip.** If this is not working by end of day, escalate — ask in the Flare hackathon Telegram immediately. Do not spend Day 2 debugging setup alone.

---

## Day 2 (10 Aug) — Skeleton end-to-end

| # | Task |
|---|---|
| 1 | Rename `GREETING` → `TRUSTLENS`, `SAY_HELLO` → `SCORE`. Keep strings identical across `config.go`, `extension.go`, and Solidity |
| 2 | Define request/response types: encrypted evidence in, `{riskScore, maxLtvBps, reasons[]}` out |
| 3 | Hardcode the score. Return `{riskScore: 1800, maxLtvBps: 8300}` constantly |
| 4 | Write `TrustLensVault.sol`: `requestScore()` sends the instruction, `borrow()` verifies the signature |
| 5 | Minimal UI: connect wallet, enter amount, call, poll, display |

**Day 2 exit criterion: click a button, a TEE returns a signed hardcoded score, a contract verifies the signature.** The hard part is now done. Everything after this is substitution.

---

## Day 3 (11 Aug) — Make the intelligence real

| # | Task |
|---|---|
| 1 | Build the training pipeline: features, forward-looking labels, walk-forward split |
| 2 | Fit logistic regression; produce Brier score + reliability curve; save the plot for the README |
| 3 | Export `model.json`; implement `Predict()` in Go |
| 4 | **Write the Python↔Go parity test** — 100 fixtures, agreement to 1e-9 |
| 5 | Replace the hardcoded score with real inference over FTSOv2 inputs + decrypted private evidence |
| 6 | Implement the reason strings (top contributing features, by coefficient × standardized value) |

**Day 3 exit criterion: the score moves correctly when you change the borrow amount or the private evidence.**

---

## Day 4 (12 Aug) — Privacy, polish, and proof

| # | Task |
|---|---|
| 1 | Real ECIES encryption in the browser to the TEE public key |
| 2 | Prove the privacy claim visually: show the encrypted blob in the tx, then the plaintext-free result |
| 3 | Add the layered defences: `subject`, `validUntil`, `nonce`, `MAX_ALLOWED_LTV_BPS` |
| 4 | Solidity tests for each defence, including the "compromised model" case |
| 5 | UI polish: tier badge, the 150%→120% comparison, calibration plot, reason list |
| 6 | Tier B if — and only if — everything above is green |

**Day 4 exit criterion: a stranger can use the app without you narrating it.**

---

## Day 5 (13 Aug) — Freeze and record

**Write no new features today.**

| # | Task |
|---|---|
| 1 | Deploy final contracts; record addresses in the README |
| 2 | **Record the 3-minute video** (script below). Multiple takes; pick the best |
| 3 | Write `WHAT-WE-BUILT.md` with commit links |
| 4 | Fill in every DoraHacks submission field |
| 5 | Fresh-clone the repo and follow your own Quickstart. Fix what breaks |
| 6 | Have 2–3 people actually use it; note their feedback as traction signal |
| 7 | **Submit.** Do not wait for the 14th |

Reserve the 14th purely as buffer. Submitting a day early costs nothing and protects you from every last-minute failure.

---

## The 3-minute video script

Timings are tight on purpose. Judges watch a lot of these.

**0:00–0:25 — The problem, in money**

> "This wallet has eight years of clean XRP Ledger history and a large verifiable portfolio. This one was created ten minutes ago. In DeFi lending today, both post 150% collateral. On a $100,000 loan, that's $30,000 sitting idle — not because the borrower is risky, but because the protocol has no safe way to find out they're not.
> They could publish their financial history. Nobody will do that."

**0:25–0:50 — The idea**

> "TrustLens scores the borrower inside a Trusted Execution Environment on Flare Confidential Compute. Their financial evidence is encrypted to the enclave. The lender never sees it. What the lender gets is a signed attestation — one number, verifiable on-chain."

**0:50–1:50 — Live demo, no narration of UI mechanics**

Connect wallet → enter $3,000 against XRP → attach private evidence → **Analyze Privately**.

> "That payload is ECIES-encrypted to the TEE's public key. Here it is in the transaction — unreadable. Inside the enclave it's decrypted, combined with live XRP/USD from FTSOv2, and scored by a model whose weights are pinned to the enclave's image hash. The operator cannot swap that model without changing the hash on-chain."

Result appears: **1.8% breach probability · PRIME · 83% LTV**.

> "Standard terms are 67% LTV. This borrower earned 83% — and proved they deserved it without revealing anything."

**1:50–2:20 — The guardrail (this is the credibility moment)**

> "Now the important part. Click borrow. The contract does not trust the model. It verifies the signature came from a registered TEE machine, checks the attestation hasn't expired, checks the nonce, then re-reads the XRP price from FTSOv2 and enforces a hard collateral floor. If the model were compromised entirely, this cap still holds. The AI proposes. The contract disposes."

Transaction succeeds. Show the explorer.

**2:20–2:50 — Rigour**

> "The model estimates the probability of breaching liquidation within seven days. Labels come from real XRP history — no synthetic data. We report calibration, not accuracy: when we say 20%, it happens about 20% of the time. Here's the reliability curve against a Monte-Carlo baseline."

**2:50–3:00 — Close**

> "Private intelligence, verifiable data, safer on-chain decisions. TrustLens is a risk oracle any Flare protocol can consume — the way they consume a price feed today."

---

## Video rules

- **Screen recording with voiceover.** No talking-head intro; it burns your best seconds.
- Show the **encrypted payload** and the **explorer transaction**. Those two shots are your proof.
- Pre-fund the wallet and pre-warm every path before recording.
- Have a cached known-good response ready in case the testnet stalls mid-take.

---

## Submission checklist (mirrors the DoraHacks required fields)

| Field | Content |
|---|---|
| Project name | TrustLens |
| Bounty | **Bounty 2 — Confidential Compute Apps** (primary); Bounty 1 — Interoperable Asset Products (secondary, via FXRP) |
| Short description | Private credit scoring for on-chain lending. Borrowers prove they deserve better loan terms without revealing the financial history that proves it. |
| Target user | DeFi borrowers holding XRP/FXRP who are over-collateralized; lending protocols that want to price risk per borrower; institutions that cannot publish positions |
| Demo link / video | 3-min video + live app URL |
| GitHub repo | Public, with README and `WHAT-WE-BUILT.md` |
| How it uses Flare | FCC extension (TEE scoring + signed attestation), FTSOv2 (XRP/USD in model *and* contract guardrail), FDC (XRPL fact attestation), FXRP (collateral) |
| Newly built during program | Everything — see `WHAT-WE-BUILT.md` |
| Contract addresses | `TrustLensVault`, `TrustLensRiskOracle`, extension ID, model image digest |
| Deployed on | Coston2 (chain 114) |
| Roadmap | Multi-asset → continuous monitoring → risk attestations as a shared Flare primitive |
| Traction | Testers, feedback, any protocol conversations |

---

## Things that will go wrong, and the answer

| Symptom | Cause | Fix |
|---|---|---|
| `unsupported op type` / `unsupported op command` | OPType/OPCommand strings differ between Go and Solidity | Make them byte-identical in all three places |
| Instruction never reaches the extension | Tunnel down, or proxy not reachable publicly | Re-establish tunnel; confirm the public `/info` endpoint responds |
| `ecrecover` returns the wrong address | Hashing/encoding mismatch between Go and Solidity | Use `abi.encode` (not `encodePacked`) and the same EIP-191 prefix on both sides |
| Collateral value wildly wrong | Assumed 18 decimals | XRP/USD is 6 decimals; use `getFeedByIdInWei` on-chain |
| Go and Python scores differ | Map iteration order | Iterate `FeatureOrder` explicitly |
| Out of gas on registration | Insufficient C2FLR for TEE fees | Top up from the faucet; fees are separate from gas |

---

## Where to get unstuck fast

Flare hackathon Telegram: `https://t.me/+5Vn6ZKhr6KI3NjIx`

FCC is pre-production. Asking a specific, well-framed question there on **Day 1** is far better than discovering a platform limitation on Day 4. It also puts your project on the organisers' radar before judging — which is not nothing.
