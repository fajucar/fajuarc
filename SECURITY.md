# Security Policy

FajuARC handles **real funds** on Arc Mainnet: users' embedded wallets,
Circle developer-controlled wallets, scheduled payments signed by the
backend, and a Uniswap V2–style DEX. Please treat any vulnerability
accordingly.

## Reporting a vulnerability

**Do not open a public issue, pull request or discussion.**

Report privately through GitHub:
**Security → Report a vulnerability** on this repository
(GitHub Private Vulnerability Reporting).

Please include:

- what an attacker can do (e.g. move funds, read another user's data,
  trigger a payment, bypass auth)
- steps to reproduce or a proof of concept — on **Arc Testnet** only
- affected component (frontend, `server/`, `contracts/`, scripts) and commit

## What to expect

- Acknowledgement within **72 hours**.
- An initial assessment within **7 days**.
- Fixes for issues that put funds at risk are prioritized over everything
  else. You will be told when the fix is deployed.
- With your permission, you'll be credited once the issue is resolved.

## Scope

In scope:

- `server/` — authentication (`server/auth.mjs`), wallet provisioning,
  scheduled payments, the AI agent's on-chain actions
- `src/` — transaction building, approvals, signing flows
- `contracts/` — the deployed DEX and token contracts
- Leaked credentials or personal data anywhere in the repository or its history

Out of scope:

- Vulnerabilities in third-party services (Privy, Circle, Upstash, Arc,
  Anthropic) — report those to the vendor
- Denial of service, rate-limit exhaustion, or spam
- Social engineering, phishing, or physical attacks
- Issues that require a compromised user device or browser

## Rules

- Test only on Arc Testnet and only with your own accounts and wallets.
- Never access, modify or move funds or data that are not yours.
- Give us reasonable time to fix the issue before any public disclosure.

Good-faith research that follows these rules will not be pursued legally.

## Supported versions

Only the latest commit on `main`, as deployed, is supported.
