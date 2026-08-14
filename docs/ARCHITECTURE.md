# TrustLens — Technical Architecture

Everything marked ✅ was verified live against Coston2 or read from the official Flare docs on 9 Aug 2026. Everything marked ⚠️ must be confirmed during Day 1 setup.

---

## 1. Verified Flare facts

### Network

```
Coston2 RPC      https://coston2-api.flare.network/ext/C/rpc
Chain ID         114  (0x72)                                    ✅ verified
Explorer         https://coston2-explorer.flare.network
Faucet           https://faucet.flare.network/coston2
```

### FTSOv2 ✅ verified live

```
FtsoV2 (Coston2)  0x3d893C53D9e8056135C26C8c638B76C8b60Df726
```

Feed IDs are 21 bytes: `0x01` (category: crypto) + ASCII of the feed name, right-padded with zeros.

| Feed | ID | Live value at verification |
|---|---|---|
| XRP/USD | `0x015852502f55534400000000000000000000000000` | 1.035935 (decimals **6**) |
| FLR/USD | `0x01464c522f55534400000000000000000000000000` | 0.006090 (decimals **8**) |
| BTC/USD | `0x014254432f55534400000000000000000000000000` | 64826.37 (decimals **2**) |
| ETH/USD | `0x014554482f55534400000000000000000000000000` | 1914.012 (decimals **3**) |

> ⚠️ **Decimals differ per feed and are not constant.** XRP is 6, BTC is 2, FLR is 8. Never hardcode 18. Always use the returned `decimals`. This is the most common FTSOv2 integration bug.

Interface:

```solidity
function getFeedById(bytes21 _feedId)
    external payable
    returns (uint256 _value, int8 _decimals, uint64 _timestamp);

function getFeedsById(bytes21[] calldata _feedIds)
    external payable
    returns (uint256[] memory, int8[] memory, uint64);

function getFeedByIdInWei(bytes21 _feedId)
    external payable
    returns (uint256 _value, uint64 _timestamp);
```

Notes:
- These are **`payable`, not `view`** — off-chain reads must use `staticCall` / `eth_call`, and on-chain calls may require a fee (see `IFeeCalculator`).
- `getFeedByIdInWei` returns 18-decimal values and sidesteps the decimals problem for on-chain math. **Prefer it inside contracts.**
- Get the address at runtime via `ContractRegistry` rather than hardcoding.

### Flare Confidential Compute (FCC)

Reference material:

| Resource | Link |
|---|---|
| Overview | https://dev.flare.network/fcc/overview |
| Getting started | https://dev.flare.network/fcc/guides/getting-started |
| Weather insurance example | https://dev.flare.network/fcc/guides/weather-insurance-extension |
| Troubleshooting | https://dev.flare.network/fcc/troubleshooting |
| Scaffold repo | `github.com/flare-foundation/fce-extension-scaffold` |
| Full worked example | `github.com/flare-foundation/fce-weather-insurance` |

Key mechanics:

- An extension is a **Go HTTP server** exposing `POST /action` and `GET /state`.
- It ships as **three Docker services**: `extension-tee` (your Go code + TEE node), `ext-proxy` (public interface, watches chain for instructions), `redis` (proxy queue/state).
- **Code version = hash of the reproducible Docker image**, registered on-chain.
- On-chain entry is your own `InstructionSender` contract calling `TeeExtensionRegistry.sendInstructions()` (requires a fee).
- Operations are identified by `OPType` and `OPCommand` as `bytes32` in Solidity and matching **string constants** in Go via `teeutils.ToHash(...)`.
- Results are **signed by the TEE identity**; contracts verify with `ecrecover` against the registered TEE address.
- The weather example proves the two patterns we need: **ECIES-encrypted payloads decrypted only inside the TEE**, and **on-chain signature-verified settlement**.

> ⚠️ FCC is *"in the final stages of development and not yet a fully public production system."* Expect rough edges. Coston2 only. Registry addresses come from `config/coston2/deployed-addresses.json`, not yet from `FlareContractRegistry`.

> ⚠️ **The single most common failure:** `OPType`/`OPCommand` strings must be byte-identical across `config.go`, `extension.go`, and the Solidity contract, or you get `unsupported op type`.

### FDC attestation types

Relevant to TrustLens:

| Type | Use here |
|---|---|
| `XRPPayment` | Prove a specific XRPL payment, including memo and destination tag |
| `XRPPaymentNonexistence` | Prove a payment was *not* made by a deadline |
| `Payment` | Generic external-chain native payment |
| `BalanceDecreasingTransaction` | Detect balance-reducing activity |
| `Web2Json` | Fetch any JSON API and apply a `jq` filter — the escape hatch for XRPL account history |
| `EVMTransaction` | EVM events, for cross-chain history |
| `AddressValidity` | Confirm an XRPL address is well-formed |

For a 5-day build, **`Web2Json` against a public XRPL data API is the pragmatic choice** for "account age / payment count", with `XRPPayment` as the rigorous demonstration of a single proven fact.

### FXRP

FAssets brings XRP to Flare as FXRP. Also available: **Firelight vaults — ERC-4626 vaults compatible with FXRP** (`https://dev.flare.network/fxrp/firelight.md`), which give you a standard, composable vault interface instead of writing a lending pool from scratch. Strongly consider building on ERC-4626 rather than inventing a vault.

---

## 2. System design

```
┌──────────────┐
│   Next.js    │  wallet connect · position builder · risk display
│      UI      │  encrypts private evidence to TEE pubkey (ECIES)
└──────┬───────┘
       │ 1. requestScore(encryptedEvidence, fdcProof)  [tx + fee]
       ▼
┌───────────────────────────┐
│ TrustLensVault.sol        │──► TeeExtensionRegistry.sendInstructions()
│ (also InstructionSender)  │    OPType "TRUSTLENS" / OPCommand "SCORE"
└───────────────────────────┘
       │ 2. instruction relayed by data providers
       ▼
┌───────────────────────────┐
│ ext-proxy (public HTTPS)  │  queues, forwards, serves results
└──────┬────────────────────┘
       │ 3. POST /action
       ▼
┌──────────────────────────────────────────────────┐
│ extension-tee   ·  Go  ·  inside the enclave     │
│                                                  │
│  a. ECIES-decrypt private evidence               │
│  b. validate FDC proof of XRPL facts             │
│  c. read XRP/USD from FTSOv2 (eth_call)          │
│  d. engineer features                            │
│  e. score with embedded model.json               │
│  f. derive maxLTV tier from probability          │
│  g. sign the attestation struct                  │
└──────┬───────────────────────────────────────────┘
       │ 4. signed attestation polled by UI
       ▼
┌───────────────────────────┐
│ TrustLensVault.borrow()   │  ecrecover → registered TEE?
│                           │  expiry ok? nonce unused?
│                           │  FTSOv2 price → collateral floor?
│                           │  → transfer FXRP
└───────────────────────────┘
```

---

## 3. The attestation

The contract between the enclave and the chain. Keep it small and versioned.

```solidity
struct RiskAttestation {
    address subject;       // borrower this score belongs to
    bytes32 policyHash;    // keccak(modelVersion, thresholds, featureSpec)
    uint16  riskScore;     // 0..10000 basis points
    uint16  maxLtvBps;     // earned LTV, e.g. 8300 = 83%
    uint64  issuedAt;
    uint64  validUntil;    // short — minutes, not days
    uint256 nonce;         // single use
}
```

Go signs `keccak256(abi.encode(attestation))` using the TEE identity key. Solidity verifies:

```solidity
function borrow(RiskAttestation calldata a, bytes calldata sig, uint256 amount) external {
    require(a.subject == msg.sender,            "wrong subject");
    require(block.timestamp <= a.validUntil,    "attestation expired");
    require(!usedNonce[a.nonce],                "replay");
    require(a.policyHash == activePolicyHash,   "stale policy");

    address signer = keccak256(abi.encode(a)).toEthSignedMessageHash().recover(sig);
    require(teeMachineRegistry.isRegistered(extensionId, signer), "not a TEE signer");

    usedNonce[a.nonce] = true;

    // Deterministic guardrail — the model never gets the last word.
    uint16 ltv = a.maxLtvBps > MAX_ALLOWED_LTV_BPS ? MAX_ALLOWED_LTV_BPS : a.maxLtvBps;
    (uint256 price,) = ftsoV2.getFeedByIdInWei(XRP_USD);
    require(_collateralValue(msg.sender, price) * ltv / 10000 >= amount, "insufficient collateral");

    _disburse(msg.sender, amount);
}
```

**Four defences, deliberately layered:**

| Defence | Stops |
|---|---|
| `subject == msg.sender` | Using someone else's good score |
| `validUntil` | Scoring in calm markets, borrowing in a crash |
| `nonce` | Replaying one good score repeatedly |
| `MAX_ALLOWED_LTV_BPS` + live price check | A compromised or buggy model draining the pool |

That last row is the point worth making to judges: **the AI proposes, the contract disposes.** Even total model compromise cannot exceed a protocol-level hard cap.

---

## 4. The ML pipeline

### Training (Python, off-chain, done once)

```
model/
  data.py       # fetch historical XRP/USD OHLC
  features.py   # SHARED FEATURE SPEC — mirrored exactly in Go
  train.py      # fit + calibrate + backtest
  export.py     # emit model.json
  model.json    # committed; baked into the Docker image
```

**Label construction (this is the honest core):**

For each historical day *t* and simulated LTV *l*, the liquidation price is
`P_liq = P_t · l / LIQUIDATION_THRESHOLD`.
Label = 1 if `min(P_{t+1..t+7}) ≤ P_liq`, else 0.

Real prices, real outcomes, no synthetic data.

**Features:** `realized_vol_7d`, `realized_vol_30d`, `max_drawdown_30d`, `return_skew_30d`, `ltv`, `distance_to_liq_sigma`, `momentum_7d`, `momentum_30d`.

`distance_to_liq_sigma = ln(P_t / P_liq) / (realized_vol_7d · √7)` — the single most predictive feature, and interpretable.

**Model:** logistic regression first. It is small, monotone, trivially reimplemented in Go, and explainable by coefficient. Only upgrade to a shallow GBM if calibration demands it.

**Validation:** walk-forward split (never random — this is time series). Report **Brier score** and a **reliability curve** versus a Monte-Carlo GBM baseline.

### Inference (Go, inside the TEE)

```go
type Model struct {
    Version      string             `json:"version"`
    Intercept    float64            `json:"intercept"`
    Coefficients map[string]float64 `json:"coefficients"`
    FeatureOrder []string           `json:"feature_order"`
    Means        map[string]float64 `json:"means"`   // standardization
    Stds         map[string]float64 `json:"stds"`
}

func (m *Model) Predict(f map[string]float64) float64 {
    z := m.Intercept
    for _, name := range m.FeatureOrder {          // fixed order = determinism
        z += m.Coefficients[name] * ((f[name] - m.Means[name]) / m.Stds[name])
    }
    return 1.0 / (1.0 + math.Exp(-z))
}
```

**Determinism rules — non-negotiable:**
1. Iterate `FeatureOrder`, never a map (Go map order is randomized).
2. No goroutine-dependent accumulation.
3. No network calls during scoring; fetch inputs first, then score.
4. `model.json` is committed and baked in, never downloaded at runtime.

**Parity test:** the same 100 fixture inputs must produce identical outputs in Python and Go to 1e-9. Write this test on Day 3; it protects the entire attestation story.

### Probability → LTV tier

```
P(breach in 7d)      Tier        maxLTV
< 2%                 PRIME       83%   (≈120% collateral)
2–5%                 STRONG      75%
5–12%                STANDARD    67%   (≈150% — today's default)
> 12%                RESTRICTED  50%
```

Private evidence moves a borrower *up* this table. That is the entire product: **the reward for proving something privately is measured in basis points of capital.**

---

## 5. Repository layout

```
trustlens/
├── README.md
├── WHAT-WE-BUILT.md
├── docs/
│   ├── STRATEGY.md
│   ├── ARCHITECTURE.md
│   └── BUILD-PLAN.md
├── model/                 Python: train, calibrate, export model.json
├── extension/             Go FCC extension (forked from fce-extension-scaffold)
│   ├── internal/config/   OPType / OPCommand constants
│   ├── internal/extension/ handlers
│   ├── pkg/types/         request/response structs
│   ├── pkg/scoring/       model.json + deterministic inference
│   └── docker-compose.yml
├── contracts/             Foundry: TrustLensVault, interfaces, deploy scripts
└── app/                   Next.js UI + ECIES client-side encryption
```

---

## 6. Local development

Prerequisites: Docker Desktop, Foundry, Go, Node, and **ngrok or cloudflared**.

```bash
# expose the local proxy publicly — required, and a classic day-5 blocker
cloudflared tunnel --url http://localhost:6674
```

Fund a Coston2 wallet with C2FLR from the faucet for gas *and* TEE registration/instruction fees.

Sanity check FTSOv2 independently of everything else:

```bash
python tools/verify_ftso.py
```

If that prints a live XRP price, your RPC path and feed IDs are correct — isolate any later failure to the TEE layer, not the data layer.
