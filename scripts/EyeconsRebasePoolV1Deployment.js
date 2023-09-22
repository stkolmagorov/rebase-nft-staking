const { ethers, upgrades } = require("hardhat");

async function main() {
    const upgradingPrice = ethers.parseEther("40");
    const tether = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
    const treasury = "0x1302818823b63B8C8313A1D1444B07110CCCF99B";
    const eye = "0x9a257c90fa239fba07771ef7da2d554d148c2e89";
    const eyecons = "0x73E1774db3Ee62117441F2140e50Ea186A31B3CE";
    const authority = "0x2ad2084e2582D054CCa4C4a1fAC8b1aBF60EFC58";
    const EyeconsRebasePool = await ethers.getContractFactory("EyeconsRebasePoolV1");
    const eyeconsRebasePool = await upgrades.deployProxy(
        EyeconsRebasePool,
        [upgradingPrice, tether, treasury, eye, eyecons, authority],
        { initializer: "initialize", kind: "uups" }
    );
    await eyeconsRebasePool.waitForDeployment();
    console.log("Address: ", eyeconsRebasePool.target);
}
  
main().catch((error) => {
    console.error(error);
    process.exit(1);
});