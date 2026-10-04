# Contracts

| Path | Origin | License |
|---|---|---|
| `v2-core/` | [Uniswap/v2-core](https://github.com/Uniswap/v2-core) | GPL-3.0-or-later ([LICENSE-GPL-3.0](LICENSE-GPL-3.0)) |
| `v2-periphery/` | [Uniswap/v2-periphery](https://github.com/Uniswap/v2-periphery) | GPL-3.0-or-later ([LICENSE-GPL-3.0](LICENSE-GPL-3.0)) |
| `MyCustomCoin.sol` | FajuARC | MIT (see [/LICENSE](../LICENSE)) |

## Credits

The AMM contracts in `v2-core/` and `v2-periphery/` are the work of
Uniswap Labs and are redistributed here under the terms of the GNU General
Public License, version 3 or (at your option) any later version. All
credit for the original design and implementation goes to the Uniswap
authors.

## Local modifications

These copies are **modified** from upstream:

- `v2-periphery/libraries/UniswapV2Library.sol` — `pairFor` uses the init
  code hash of this repository's compiled `UniswapV2Pair`, not upstream's.
- All files — an `SPDX-License-Identifier: GPL-3.0-or-later` header was
  added.

Use `git log -- contracts/` for the full change history.

## Warranty

As stated in the GPL, this code is provided WITHOUT ANY WARRANTY. These
contracts have **not** been independently audited in their modified form.
