# Scripts

Utility scripts. All of them read `.env` from the project root
(see [`.env.example`](../.env.example)).

## Circle setup (run once per network)

| Script | What it does |
|---|---|
| `circle-setup-entity-secret.mjs` | Generates and registers a Circle Entity Secret, saves `CIRCLE_ENTITY_SECRET_<NET>` to `.env` |
| `create-wallet-set.mjs` | Creates a Circle Wallet Set, saves `CIRCLE_WALLET_SET_ID_<NET>` to `.env` (`--force` to replace) |

```bash
ARC_NETWORK=testnet node scripts/circle-setup-entity-secret.mjs
ARC_NETWORK=testnet node scripts/create-wallet-set.mjs
```

Neither script prints the API key or the Entity Secret.

## Contract deployment (Hardhat)

Requires `DEPLOYER_PRIVATE_KEY` in `.env`.

| Script | What it does |
|---|---|
| `deploy-tokens.cjs` | Deploys the FAJU and ARCX tokens (`MyCustomCoin`) |
| `deploy-v2-dex.cjs` | Deploys the Uniswap V2 factory and router |
| `deploy-fajufarm.cjs`, `deploy-fajufarm-hardhat.cjs` | Deploys the FajuFarm staking contract |
| `create-v3-pools.cjs` | Creates and initializes V3 pools on Arc Testnet |
| `test-deployer.cjs` | Checks the deployer key and its balance |

```bash
npx hardhat run scripts/deploy-v2-dex.cjs --network arcTestnet
```

## Manual on-chain checks (Arc Testnet)

`test-add-liquidity.cjs`, `test-router-swap.cjs`, `test-router-swap-reverse.cjs`
send real transactions against the testnet DEX with the deployer key.

## Other

| Script | What it does |
|---|---|
| `validate-deployments.ts` | Validates `src/config/deployments.arc-testnet.json` |
| `security-check.cjs` | Runs `npm audit`, lint and contract tests |
| `../server/scripts/*` | Backend maintenance: automation-wallet balance, Circle balance diagnostics, JSON → Redis import |
