# FajuARC

Stablecoin payments, swaps and an AI payments agent on [Arc](https://arc.network), the
EVM chain where **USDC is the native gas token**.

**Live app:** https://fajucar211225.vercel.app

> ⚠️ FajuARC runs on **Arc Mainnet with real funds**. The code is provided as-is,
> without warranty, and has not been independently audited. See [SECURITY.md](SECURITY.md).

## Features

- **Social login with embedded wallets.** Users sign in with email or a social
  account through [Privy](https://privy.io) and get an embedded EVM wallet. MetaMask
  and WalletConnect are supported as well.
- **P2P payments.** Send USDC and EURC, and share payment links (`/pay`) with QR codes.
- **DEX.** A Uniswap V2 fork (swap, add and remove liquidity, manage positions), plus
  Uniswap V3 pools on networks where V3 is deployed.
- **Farming.** Stake LP tokens in the FajuFarm contract.
- **AI agent.** A chat agent built on Anthropic Claude that reads balances, sends tokens
  and schedules recurring payments. Immediate transfers are signed by the user in
  the wallet; scheduled payments are created by the backend and run later. The chat
  requires signing in with Privy (email, Google or a wallet).
- **Scheduled payments.** A backend cron executes payments at the scheduled time. They
  are sent from the user's Privy embedded wallet, through a Privy session signer the
  user authorizes once. External wallets such as Rabby and MetaMask cannot be used for
  scheduled payments, because Privy only accepts session signers on embedded wallets.
  The agent first shows a summary, and the payment is only created after the user
  types "sim" or "yes" to confirm.

  The Circle Developer-Controlled Wallets infrastructure is configured, and the backend
  requires its credentials to start, but it is not the active payment path.

## Architecture

```
┌──────────────────────────┐        ┌─────────────────────────────────────┐
│ Frontend (Vite + React)  │  HTTP  │ Backend (Node + Express, server/)   │
│ wagmi/viem, Privy SDK    │ ─────▶ │ Privy auth · Claude agent · cron    │
│ src/                     │        │ Circle wallets · Upstash Redis      │
└────────────┬─────────────┘        └──────────────────┬──────────────────┘
             │ JSON-RPC                                │ JSON-RPC
             ▼                                         ▼
                    Arc (Mainnet 5042 / Testnet 5042002)
                    DEX + token contracts (contracts/)
```

| Path | Contents |
|---|---|
| `src/` | React app: pages, wallet and DEX hooks, network and token config |
| `server/` | Express API, auth (`auth.mjs`), AI agent (`agent.mjs`), scheduler, Circle and Privy signers |
| `server/network.mjs` | Single source of truth for the active network and its credentials |
| `contracts/` | Solidity: Uniswap V2 fork (GPL-3.0) and the FAJU/ARCX token |
| `scripts/` | Circle setup, deployment and maintenance scripts ([details](scripts/README.md)) |
| `test/` | Hardhat contract tests |

### Network isolation

The backend refuses to start unless `ARC_NETWORK` is set explicitly to `mainnet` or
`testnet`. Every secret is read only from its network-suffixed name (for example
`CIRCLE_API_KEY_MAINNET`), and nothing falls back across networks. Circle keys are
checked against their `LIVE_`/`TEST_` prefix, and Redis keys are namespaced per network.

## Getting started

Requirements: Node.js 20 or later (developed on Node 24), plus accounts on Privy,
Circle (Developer-Controlled Wallets), Upstash Redis and Anthropic.

```bash
git clone https://github.com/fajucar/fajuarc.git
cd fajuarc
npm install            # .npmrc enables legacy-peer-deps
cp .env.example .env   # then fill in the values
```

Set up Circle once per network:

```bash
ARC_NETWORK=testnet node scripts/circle-setup-entity-secret.mjs
ARC_NETWORK=testnet node scripts/create-wallet-set.mjs
```

Run the frontend (http://localhost:3000) and the backend (http://localhost:3002) together:

```bash
npm run dev
```

**Use Arc Testnet for development.** Mainnet credentials move real money.

### Other commands

```bash
npm run build                                   # type-check + production build
npm run lint
npx hardhat test --config hardhat.config.cjs    # contract tests
```

## Environment variables

Every variable is documented in [`.env.example`](.env.example). Anything prefixed with
`VITE_` ends up in the browser bundle, so never put a secret in a `VITE_` variable.

## Deployment

- **Frontend:** Vercel. `vercel.json` rewrites all routes to the SPA.
- **Backend:** any Node host. It currently runs on Render's Free plan, so the first
  response after the service has been idle can take about 50 seconds. Set the variables
  from `.env.example` in the host's dashboard. Never upload a `.env` file.

## Security

Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
Do not open public issues for security problems.

## License

- Project code: [MIT](LICENSE)
- `contracts/v2-core/` and `contracts/v2-periphery/`: derived from Uniswap V2, licensed
  [GPL-3.0-or-later](contracts/LICENSE-GPL-3.0). See [contracts/README.md](contracts/README.md).
