const { ethers } = require("hardhat");

async function main() {
    const eye = ethers.ZeroAddress;
    const authority = "0x2ad2084e2582D054CCa4C4a1fAC8b1aBF60EFC58";
    const MultichainRewardDistributor = await ethers.getContractFactory("MultichainRewardDistributorV1");
    const multichainRewardDistributor = await upgrades.deployProxy(
        MultichainRewardDistributor,
        [eye, authority],
        { initializer: "initialize", kind: "uups"}
    );
    await multichainRewardDistributor.waitForDeployment();
    console.log("Address: ", multichainRewardDistributor.target);
}
  
main().catch((error) => {
    console.error(error);
    process.exit(1);
});