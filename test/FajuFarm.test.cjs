/**
 * FajuFarm basic tests: addPool, deposit, withdraw, harvest, pendingRewards
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

const parseUnits = (n, d) => ethers.parseUnits(String(n), d || 18);

describe("FajuFarm", function () {
  let farm, rewardToken, lpToken;
  let owner, user1;

  before(async function () {
    [owner, user1] = await ethers.getSigners();

    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    rewardToken = await MockERC20.deploy("FAJU", "FAJU", 18);
    lpToken = await MockERC20.deploy("USDC-EURC-LP", "LP", 18);
    await rewardToken.waitForDeployment();
    await lpToken.waitForDeployment();

    const startTime = Math.floor(Date.now() / 1000) - 60;
    const endTime = startTime + 86400 * 30; // 30 days
    const rewardPerSecond = parseUnits("1", 18); // 1 FAJU/sec

    const FajuFarm = await ethers.getContractFactory("FajuFarm");
    farm = await FajuFarm.deploy(
      await rewardToken.getAddress(),
      rewardPerSecond,
      startTime,
      endTime
    );
    await farm.waitForDeployment();

    await rewardToken.mint(await farm.getAddress(), parseUnits("1000000", 18));
    await lpToken.mint(user1.address, parseUnits("1000", 18));
  });

  it("addPool adds pool with allocPoint", async function () {
    await farm.addPool(await lpToken.getAddress(), 100);
    const pool = await farm.poolInfo(0);
    expect(pool.lpToken).to.equal(await lpToken.getAddress());
    expect(pool.allocPoint).to.equal(100n);
    expect(await farm.totalAllocPoint()).to.equal(100n);
  });

  it("deposit stakes LP and accrues rewards", async function () {
    const amount = parseUnits("100", 18);
    await lpToken.connect(user1).approve(await farm.getAddress(), amount);
    await farm.connect(user1).deposit(0, amount);

    const user = await farm.userInfo(0, user1.address);
    expect(user.amount).to.equal(amount);

    await ethers.provider.send("evm_increaseTime", [60]);
    await ethers.provider.send("evm_mine", []);

    const pending = await farm.pendingRewards(0, user1.address);
    expect(pending).to.be.gt(0);
  });

  it("harvest sends rewards to user", async function () {
    const balBefore = await rewardToken.balanceOf(user1.address);
    await farm.connect(user1).harvest(0);
    const balAfter = await rewardToken.balanceOf(user1.address);
    expect(balAfter).to.be.gt(balBefore);
  });

  it("withdraw returns LP", async function () {
    const amount = parseUnits("50", 18);
    const lpBefore = await lpToken.balanceOf(user1.address);
    await farm.connect(user1).withdraw(0, amount);
    const lpAfter = await lpToken.balanceOf(user1.address);
    expect(lpAfter - lpBefore).to.equal(amount);
  });
});
