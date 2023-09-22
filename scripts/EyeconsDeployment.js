const { ethers } = require("hardhat");

async function main() {
    const maximumSupply = 10000;
    const tokenPrice = 0;
    const subscriptionPrice = ethers.parseEther("40");
    const authorizer = "0x2ad2084e2582D054CCa4C4a1fAC8b1aBF60EFC58";
    const treasury = "0x1302818823b63B8C8313A1D1444B07110CCCF99B";
    const baseURI = "null/";
    const tether = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
    const priceOracle = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
    const Eyecons = await ethers.getContractFactory("Eyecons");
    const eyecons = await Eyecons.deploy(
        maximumSupply,
        tokenPrice,
        subscriptionPrice,
        authorizer,
        treasury,
        baseURI,
        tether,
        priceOracle
    );
    await eyecons.waitForDeployment();
    console.log("Address: ", eyecons.target);
}
  
main().catch((error) => {
    console.error(error);
    process.exit(1);
});