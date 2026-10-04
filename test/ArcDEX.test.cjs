/**
 * ArcDEX integration tests: Factory → Pair → Router
 * Flow: deploy Factory → deploy Router → createPair(USDC,EURC) → addLiquidity (transfer + mint) → swapExactTokensForTokens
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

const parseUnits = (n, d) => ethers.parseUnits(String(n), d);
const ZERO = "0x0000000000000000000000000000000000000000";

describe("ArcDEX", function () {
  let factory, router, pair, usdc, eurc;
  let liquidityProvider, swapper;
  const USDC_DECIMALS = 6;
  const EURC_DECIMALS = 6;
  const LIQ_USDC = "1000000";   // 1M USDC (6 decimals)
  const LIQ_EURC = "1000000";  // 1M EURC
  const SWAP_IN = "1000";       // 1000 USDC

  async function deployFactory() {
    const [owner] = await ethers.getSigners();
    const ArcDEXFactory = await ethers.getContractFactory("ArcDEXFactory");
    factory = await ArcDEXFactory.deploy(owner.address);
    await factory.waitForDeployment();
    expect(await factory.getPair(ZERO, ZERO)).to.equal(ZERO);
    return factory.getAddress();
  }

  async function deployRouter(factoryAddress) {
    const ArcDEXRouter = await ethers.getContractFactory("ArcDEXRouter");
    router = await ArcDEXRouter.deploy(factoryAddress);
    await router.waitForDeployment();
    expect(await router.factory()).to.equal(factoryAddress);
    return router.getAddress();
  }

  async function createPair(tokenA, tokenB) {
    const tx = await factory.createPair(tokenA, tokenB);
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === "PairCreated"
    );
    expect(event).to.not.be.undefined;
    const pairAddress = event.args[2];
    expect(pairAddress).to.not.equal(ZERO);
    expect(await factory.getPair(tokenA, tokenB)).to.equal(pairAddress);
    expect(await factory.getPair(tokenB, tokenA)).to.equal(pairAddress);
    pair = await ethers.getContractAt("ArcDEXPair", pairAddress);
    return pairAddress;
  }

  async function addLiquidity(pairAddress, token0, token1, amount0, amount1, from, to) {
    const pairContract = await ethers.getContractAt("ArcDEXPair", pairAddress);
    const t0 = await ethers.getContractAt("MockERC20", token0);
    const t1 = await ethers.getContractAt("MockERC20", token1);
    await t0.connect(from).transfer(pairAddress, amount0);
    await t1.connect(from).transfer(pairAddress, amount1);
    const mintTx = await pairContract.mint(to);
    await mintTx.wait();
    const [r0, r1] = await pairContract.getReserves();
    expect(r0 > 0n && r1 > 0n).to.be.true;
  }

  it("1. Deploy Factory", async function () {
    await deployFactory();
    console.log("   OK - Factory deployed:", await factory.getAddress());
  });

  it("2. Deploy Router with Factory address", async function () {
    const factoryAddr = await factory.getAddress();
    await deployRouter(factoryAddr);
    console.log("   OK - Router deployed:", await router.getAddress());
    expect(await router.factory()).to.equal(factoryAddr);
  });

  it("3. Deploy mock USDC and EURC", async function () {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    usdc = await MockERC20.deploy("USDC", "USDC", USDC_DECIMALS);
    eurc = await MockERC20.deploy("EURC", "EURC", EURC_DECIMALS);
    await usdc.waitForDeployment();
    await eurc.waitForDeployment();
    console.log("   OK - USDC:", await usdc.getAddress(), "EURC:", await eurc.getAddress());
  });

  it("4. Create pair USDC/EURC via Factory", async function () {
    const usdcAddr = await usdc.getAddress();
    const eurcAddr = await eurc.getAddress();
    await createPair(usdcAddr, eurcAddr);
    console.log("   OK - Pair created:", await pair.getAddress());
    expect(await pair.token0()).to.equal(usdcAddr < eurcAddr ? usdcAddr : eurcAddr);
    expect(await pair.token1()).to.equal(usdcAddr < eurcAddr ? eurcAddr : usdcAddr);
  });

  it("5. Add liquidity (transfer to pair + mint)", async function () {
    const [,, lp] = await ethers.getSigners();
    liquidityProvider = lp;
    const usdcAddr = await usdc.getAddress();
    const eurcAddr = await eurc.getAddress();
    const pairAddr = await pair.getAddress();
    const amount0 = parseUnits(LIQ_USDC, USDC_DECIMALS);
    const amount1 = parseUnits(LIQ_EURC, EURC_DECIMALS);

    await usdc.mint(lp.address, amount0 * 2n);
    await eurc.mint(lp.address, amount1 * 2n);

    const token0 = await pair.token0();
    const token1 = await pair.token1();
    const usdcIs0 = token0 === usdcAddr;
    const am0 = usdcIs0 ? amount0 : amount1;
    const am1 = usdcIs0 ? amount1 : amount0;

    await addLiquidity(pairAddr, token0, token1, am0, am1, lp, lp.address);
    const [r0, r1] = await pair.getReserves();
    expect(r0 > 0n && r1 > 0n).to.be.true;
    console.log("   OK - Reserves:", r0.toString(), r1.toString());
  });

  it("6. Approve USDC (and EURC) for Router", async function () {
    const routerAddr = await router.getAddress();
    const max = ethers.MaxUint256;
    await usdc.connect(liquidityProvider).approve(routerAddr, max);
    await eurc.connect(liquidityProvider).approve(routerAddr, max);
    expect(await usdc.allowance(liquidityProvider.address, routerAddr)).to.equal(max);
    console.log("   OK - Allowance set for Router");
  });

  it("7. swapExactTokensForTokens (USDC -> EURC)", async function () {
    const [,,, user] = await ethers.getSigners();
    swapper = user;
    const routerAddr = await router.getAddress();
    const usdcAddr = await usdc.getAddress();
    const eurcAddr = await eurc.getAddress();

    const amountIn = parseUnits(SWAP_IN, USDC_DECIMALS);
    await usdc.mint(user.address, amountIn * 10n);
    await usdc.connect(user).approve(routerAddr, ethers.MaxUint256);

    const path = [usdcAddr, eurcAddr];
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
    const amountsOut = await router.getAmountsOut(amountIn, path);
    const amountOutMin = (amountsOut[1] * 95n) / 100n; // 5% slippage

    const balEurcBefore = await eurc.balanceOf(user.address);
    const tx = await router.connect(user).swapExactTokensForTokens(
      amountIn,
      amountOutMin,
      path,
      user.address,
      deadline
    );
    await tx.wait();
    const balEurcAfter = await eurc.balanceOf(user.address);
    expect(balEurcAfter > balEurcBefore).to.be.true;
    console.log("   OK - Swap executed, EURC received:", (balEurcAfter - balEurcBefore).toString());
  });

  it("8. Revert: swap without approve", async function () {
    const [,,,, user2] = await ethers.getSigners();
    const usdcAddr = await usdc.getAddress();
    const eurcAddr = await eurc.getAddress();
    await usdc.mint(user2.address, parseUnits("100", USDC_DECIMALS));
    const path = [usdcAddr, eurcAddr];
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
    const amountIn = parseUnits("10", USDC_DECIMALS);
    const amountsOut = await router.getAmountsOut(amountIn, path);
    const amountOutMin = (amountsOut[1] * 90n) / 100n;
    let reverted = false;
    try {
      await router.connect(user2).swapExactTokensForTokens(
        amountIn,
        amountOutMin,
        path,
        user2.address,
        deadline
      );
    } catch (e) {
      reverted = true;
    }
    expect(reverted).to.be.true;
  });

  it("9. Revert: expired deadline", async function () {
    const usdcAddr = await usdc.getAddress();
    const eurcAddr = await eurc.getAddress();
    const path = [usdcAddr, eurcAddr];
    const amountIn = parseUnits("1", USDC_DECIMALS);
    const pastDeadline = 1n;
    let reverted = false;
    try {
      await router.connect(swapper).swapExactTokensForTokens(
        amountIn,
        0n,
        path,
        swapper.address,
        pastDeadline
      );
    } catch (e) {
      reverted = true;
    }
    expect(reverted).to.be.true;
  });

  it("10. getAmountsOut and reserves consistency", async function () {
    const usdcAddr = await usdc.getAddress();
    const eurcAddr = await eurc.getAddress();
    const path = [usdcAddr, eurcAddr];
    const amountIn = parseUnits("100", USDC_DECIMALS);
    const amounts = await router.getAmountsOut(amountIn, path);
    expect(amounts.length).to.equal(2);
    expect(amounts[0]).to.equal(amountIn);
    expect(amounts[1] > 0n).to.be.true;
    const [reserveA, reserveB] = await router.getReserves(usdcAddr, eurcAddr);
    expect(reserveA > 0n && reserveB > 0n).to.be.true;
    console.log("   OK - getAmountsOut and getReserves consistent");
  });
});
