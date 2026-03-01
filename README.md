# Settl

## What it does

Settl is a yield optimising, multi-chain payroll system with built in intelligent anomaly detection on Arc.

## Key features:

- Automatic USYC yield on idle treasury capital with configurable rebalancing policies
- Pay run settlement across multiple chains in a single transaction via Circle CCTP
- Anomaly detection for fradulent behaviour flagging
- Google-based onboarding via Circle wallets
- Built-in time tracking, schedules, holidays, and time-off approval
- Linear USDC vesting grants for employee compensation
- Admin dashboard with real-time treasury, yield, and earnings overview

## How it works

### Yield on idle capital

When USDC is deposited into the treasury `Core.sol`, if reserves are over a the threshold (defined in the policy), or if the USDC is not immediately needed to cover expenses (like payroll), USDC is converted to USYC, which is a a yield-bearing stablecoin on Arc. This earns the treasury yield until it's needed, optimising company revenue generation.

Before a pay run, the system automatically redeems enough USYC back to USDC to cover the payroll. This happens on a configurable policy:

- **Threshold policy** — convert to USYC whenever the USDC balance exceeds a set amount
- **Payday policy** — auto-redeem enough USYC to cover the upcoming pay run
- **Manual** — treasurer controls conversions on demand

```
┌─────────────────────────────────────────┐
│             Treasury (Core.sol)         │
│                                         │
│  USDC surplus ──→ USYC (earning yield)  │
│  USYC ──→ USDC (just before payday)    │
│                                         │
└─────────────────────────────────────────┘
```

## Paying employees

On payday, a single transaction covers every employee regardless of which chain they're on:

- **Employees on Arc** — USDC transferred directly instantly
- **Employees on other chains** — USDC is burned on Arc via Circle's CCTP protocol. Circle attests the burn, then native USDC is minted on the employee's chain

```
Treasury vault (Arc)
  ├── Arc employees        → direct transfer, instant
  └── Cross-chain employees → burn on Arc → Circle attests → mint on destination
```

Supported chains: **Ethereum · Base · Arbitrum · Arc**

## Employee onboarding

Reduce the friction of onboarding employees onto crypto enterprise systems. Either employers can sign up with:

- **Self-custody wallet** — connect MetaMask, Coinbase Wallet, or any WalletConnect wallet.
- **Google** — Circle wallet creates a non-custodial wallet, the employee sets a PIN. There is no wallet setup, or private key management.

## Anomaly detection

To mitigate employees falsifying check in/out times, the system detects anomalies based on past behavioural patterns.

**Technical explanation:**

- Convert each event timestamp into a 2D point: (minutes from midnight, shift duration); ~93% of normal behaviour forms a dense “safe zone” that updates as new data arrives.
- Use Isolation Forest to flag points in low-density regions: fewer splits / shorter isolation depth => easier to isolate => anomaly.
- Cross-check anomalies with the Stork oracle (reputation score) to reduce false positives and decide intent.
- Trigger actions: high reputation => “trusted outlier” => CEO review; low reputation ⇒ “malicious outlier” ⇒ USYC rebalance to maximise treasury yield.

## CCTP integration

Cross-chain payouts use **Circle's Cross-Chain Transfer Protocol v2**

1. `CctpBridge` pulls USDC from the treasury and calls `TokenMessenger.depositForBurn` on Arc.
2. Circle's attestation service confirms the burn.
3. USDC is minted on the destination chain, automatically via Circle's forwarder, or by the backend submitting the `receiveMessage` transaction directly.

---

## Smart contracts

| Contract         | What it does                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Core.sol`       | Treasury vault. Holds USDC, authorizes payouts, connects to vesting and rebalancing.                                   |
| `Rebalance.sol`  | Converts USDC → USYC for yield, and USYC → USDC before payday.                                                         |
| `PayRun.sol`     | Payroll engine. Records each batch on-chain, routes Arc payments directly and cross-chain payments through the bridge. |
| `CctpBridge.sol` | Pulls USDC from the vault and initiates Circle CCTP burns for cross-chain employees.                                   |
| `Vesting.sol`    | Linear USDC vesting grants — employer-funded, cancellable, with a delegated allocator role.                            |

All contracts deployed on **Arc Testnet** (ChainID 5042002):

- Core address: 0xa8ce1f3b7c71a9c577686c93c4e8b4924bb5c5ca
- Payrun address: 0xa5a046e6dc6a10bfd54d88be7744680392feed79
- Rebalance address: 0x3504c84a71902d1af3a74ec50826db8b3a9f67d6
- Vesting address: 0x8688a03e4ec16b26dbaffa67a76fd2c3cebe7c68

---

## Tech stack

**Frontend** — Next.js 15, React 19, Wagmi, RainbowKit, Circle W3S SDK, Tailwind CSS

**Backend** — Fastify, Viem, Zod, SQLite, Node.js 22

**Contracts** — Solidity 0.8.30, Foundry, OpenZeppelin, Circle CCTP v2

---

## Running locally

```bash
# Install dependencies
pnpm install

# Set up env vars and start frontend
cd frontend && cp .env.local

NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
NEXT_PUBLIC_ARC_RPC_URL=
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ARC_CEO_ADDRESS=0x13e00D9810d3C8Dc19A8C9A172fd9A8aC56e94e0
NEXT_PUBLIC_ARC_CORE_ADDRESS=0xa8ce1f3b7c71a9c577686c93c4e8b4924bb5c5ca
NEXT_PUBLIC_ARC_PAYRUN_ADDRESS=0xa5a046e6dc6a10bfd54d88be7744680392feed79
NEXT_PUBLIC_ARC_REBALANCE_ADDRESS=0x3504c84a71902d1af3a74ec50826db8b3a9f67d6
NEXT_PUBLIC_ARC_VESTING_ADDRESS=0x8688a03e4ec16b26dbaffa67a76fd2c3cebe7c68
NEXT_PUBLIC_ARC_USYC_ADDRESS=0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C
NEXT_PUBLIC_ARC_USYC_TELLER_ADDRESS=0x9fdF14c5B14173D74C08Af27AebFf39240dC105A
NEXT_PUBLIC_CIRCLE_APP_ID=
NEXT_PUBLIC_CIRCLE_GOOGLE_CLIENT_ID=

pnpm dev
```

Set `CHAIN_MODE=mock` in the backend `.env.local` to run without real contract calls — useful for demoing the UI without a funded wallet.

---
