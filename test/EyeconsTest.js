const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Eyecons", () => {
    const PRICE_ORACLE_ANSWER = 200000000000n;
    const SIGNATURE_EXAMPLE 
        = "0x21fbf0696d5e0aa2ef41a2b4ffb623bcaf070461d61cf7251c74161f82fec3a4370854bc0a34b3ab487c1bc021cd318c734c51ae29374f2beb0e6f2dd49b4bf41c";
    const LOOKS_RARE_TRANSFER_MANAGER = "0xf42aa99F011A1fA7CDA90E5E98b277E306BcA83e";

    const generateSignature = async (account, amount) => {
        const signatureId = await eyecons.currentSignatureId();
        const hash = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256", "uint256"],
                [account.address, amount, signatureId]
            )
        );
        return authorizer.signMessage(ethers.getBytes(hash));
    }

    before(async () => {
        [owner, alice, authorizer, treasury] = await ethers.getSigners();
    });

    const fixture = async () => {
        const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
        const erc20MockInstance = await ERC20Mock.deploy();
        await erc20MockInstance.transfer(alice.address, ethers.parseEther("1000000"));
        const PriceOracleMock = await ethers.getContractFactory("PriceOracleMock");
        const priceOracleInstance = await PriceOracleMock.deploy();
        const Eyecons = await ethers.getContractFactory("Eyecons");
        const eyeconsInstance = await Eyecons.deploy(
            4,
            0,
            ethers.parseEther("40"),
            authorizer.address,
            treasury.address,
            "ipfs://",
            erc20MockInstance.target,
            priceOracleInstance.target
        );
        return { erc20MockInstance, eyeconsInstance };
    }

    beforeEach(async () => {
        const { erc20MockInstance, eyeconsInstance } = await loadFixture(fixture);
        tether = erc20MockInstance;
        eyecons = eyeconsInstance;
    });

    it("Successful deployment", async () => {
        // Checks
        expect(await eyecons.tokenPrice()).to.equal(0);
        expect(await eyecons.subscriptionPrice()).to.equal(ethers.parseEther("40"));
        expect(await eyecons.authorizer()).to.equal(authorizer.address);
        expect(await eyecons.treasury()).to.equal(treasury.address);
        expect(await eyecons.tether()).to.equal(tether.target);
        expect(await eyecons.baseURI()).to.equal("ipfs://");
        expect(await eyecons.publicPeriodEnabled()).to.equal(false);
        expect(await eyecons.tradingEnabled()).to.equal(false);
        expect(await eyecons.supportsInterface(ethers.toBeHex(0x4e2312e0))).to.equal(false);
    });

    it("Successful enablePublicPeriod() execution", async () => {
        // Attemt to enable from not the owner
        await expect(eyecons.connect(authorizer).enablePublicPeriod())
            .to.be.revertedWith("Ownable: caller is not the owner");
        // Successful enabling
        await eyecons.enablePublicPeriod();
        expect(await eyecons.publicPeriodEnabled()).to.equal(true);
    });

    it("Successful enableTrading() execution", async () => {
        // Attemt to enable from not the owner
        await expect(eyecons.connect(authorizer).enableTrading())
            .to.be.revertedWith("Ownable: caller is not the owner");
        // Successful enabling
        await eyecons.enableTrading();
        expect(await eyecons.tradingEnabled()).to.equal(true);
    });

    it("Successful updateDefaultRoyalty() execution", async () => {
        // Attemt to update from not the owner
        await expect(eyecons.connect(authorizer).updateDefaultRoyalty(100))
            .to.be.revertedWith("Ownable: caller is not the owner");
        // Attempt to update with invalid percentage
        await expect(eyecons.updateDefaultRoyalty(99)).to.be.revertedWithCustomError(eyecons, "InvalidRoyaltyPercentage");
        await expect(eyecons.updateDefaultRoyalty(1001)).to.be.revertedWithCustomError(eyecons, "InvalidRoyaltyPercentage");
        // Successful updating
        let royaltyInfo = await eyecons.royaltyInfo(1, 1000);
        expect(royaltyInfo[0]).to.equal(await treasury.address);
        expect(royaltyInfo[1]).to.equal(100);
        await eyecons.updateDefaultRoyalty(500);
        royaltyInfo = await eyecons.royaltyInfo(1, 1000);
        expect(royaltyInfo[0]).to.equal(await treasury.address);
        expect(royaltyInfo[1]).to.equal(50);
    });

    it("Successful updateAuthorizer() execution", async () => {
        // Attemt to update from not the owner
        await expect(eyecons.connect(authorizer).updateAuthorizer(treasury.address))
            .to.be.revertedWith("Ownable: caller is not the owner");
        // Successful updating
        await eyecons.updateAuthorizer(treasury.address);
        expect(await eyecons.authorizer()).to.equal(treasury.address);
    });

    it("Successful updateTreasury() execution", async () => {
        // Attemt to update from not the owner
        await expect(eyecons.connect(authorizer).updateTreasury(authorizer.address))
            .to.be.revertedWith("Ownable: caller is not the owner");
        // Successful updating
        await eyecons.updateTreasury(authorizer.address);
        expect(await eyecons.treasury()).to.equal(authorizer.address);
    });

    it("Successful updateBaseURI() execution", async () => {
        // Attemt to update from not the owner
        await expect(eyecons.connect(authorizer).updateBaseURI("EYE"))
            .to.be.revertedWith("Ownable: caller is not the owner");
        // Successful updating
        await eyecons.updateBaseURI("EYE");
        expect(await eyecons.baseURI()).to.equal("EYE");
    });

    it("Successful increaseAvailableAmountToMint() execution", async () => {
        // Attemt to increase from not the owner
        await expect(eyecons.connect(authorizer).increaseAvailableAmountToMint(100))
            .to.be.revertedWith("Ownable: caller is not the owner");
        // Attempt to increase with invalid amount
        await expect(eyecons.increaseAvailableAmountToMint(10001))
            .to.be.revertedWithCustomError(eyecons, "InvalidAmountToIncrease");
        // Successful increasing
        await eyecons.increaseAvailableAmountToMint(1);
        expect(await eyecons.availableAmountToMint()).to.equal(1);
        // Attempt to increase with invalid amount
        await expect(eyecons.increaseAvailableAmountToMint(4))
            .to.be.revertedWithCustomError(eyecons, "InvalidAmountToIncrease");
    });

    it("Successful decreaseAvailableAmountToMint() execution", async () => {
        // Attemt to decrease from not the owner
        await expect(eyecons.connect(authorizer).decreaseAvailableAmountToMint(100))
            .to.be.revertedWith("Ownable: caller is not the owner");
        // Successful increasing
        await eyecons.increaseAvailableAmountToMint(1);
        expect(await eyecons.availableAmountToMint()).to.equal(1);
        // Successful decreasing
        await eyecons.decreaseAvailableAmountToMint(1);
        expect(await eyecons.availableAmountToMint()).to.equal(0);
    });

    it("Successful updatePrices() execution", async () => {
        // Attemt to update from not the owner
        await expect(eyecons.connect(authorizer).updatePrices(100, 500))
            .to.be.revertedWith("Ownable: caller is not the owner");
        // Successful updating
        await eyecons.updatePrices(100, 500);
        expect(await eyecons.tokenPrice()).to.equal(100);
        expect(await eyecons.subscriptionPrice()).to.equal(500);
    });

    it("Successful mint() execution", async () => {
        // Increase available amount to mint 
        await eyecons.increaseAvailableAmountToMint(3);
        // Presale period mint with signature
        const signature = await generateSignature(alice, 2);
        await tether.connect(alice).approve(eyecons.target, ethers.parseEther("80"));
        await eyecons.connect(alice).mint(tether.target, 2, signature);
        expect(await tether.balanceOf(treasury.address)).to.equal(ethers.parseEther("80"));
        expect(await eyecons.balanceOf(alice.address)).to.equal(2);
        expect(await eyecons.tokenOfOwnerByIndex(alice.address, 0)).to.equal(1);
        expect(await eyecons.tokenOfOwnerByIndex(alice.address, 1)).to.equal(2);
        // Attempt to mint with the same signature
        await expect(eyecons.connect(alice).mint(tether.target, 1, signature))
            .to.be.revertedWithCustomError(eyecons, "NotUniqueSignature");
        // Attempt to mint with invalid signature
        await expect(eyecons.connect(alice).mint(tether.target, 1, SIGNATURE_EXAMPLE))
            .to.be.revertedWithCustomError(eyecons, "InvalidSignature");
        // Enable public period
        await eyecons.enablePublicPeriod();
        // Attempt to mint with 0 amount
        await expect(eyecons.connect(alice).mint(tether.target, 0, signature))
        .to.be.revertedWithCustomError(eyecons, "InvalidAmountToMint");
        // Attempt to mint with invalid amount
        await expect(eyecons.connect(alice).mint(tether.target, 2, SIGNATURE_EXAMPLE))
            .to.be.revertedWithCustomError(eyecons, "InvalidAmountToMint");
    });

    it("Successful renewSubscription() execution", async () => {
        // Enable public period
        await eyecons.enablePublicPeriod();
        await eyecons.increaseAvailableAmountToMint(1);
        // Attempt to renew subscription for non-existent token
        await expect(eyecons.renewSubscription(tether.target, [1]))
            .to.be.revertedWithCustomError(eyecons, "NonExistentToken");
        // Mint 1 token
        await tether.approve(eyecons.target, ethers.parseEther("40"));
        await eyecons.mint(tether.target, 1, SIGNATURE_EXAMPLE);
        const tokenId = await eyecons.tokenOfOwnerByIndex(owner.address, 0);
        // Attempt to renew subscription too early
        await expect(eyecons.renewSubscription(tether.target, [tokenId]))
            .to.be.revertedWithCustomError(eyecons, "TooEarlyRenewal");
        // + 365 days
        await time.increase(await eyecons.ONE_YEAR());
        expect((await eyecons.subscriptionStatus(1)).isSubscriptionActive_).to.equal(false);
        expect((await eyecons.subscriptionStatus(1)).remainingSubscriptionTime_).to.equal(0);
        await expect(eyecons.subscriptionStatus(2)).to.be.revertedWithCustomError(eyecons, "NonExistentToken");
        // Successful subscription renewal
        await tether.approve(eyecons.target, ethers.parseEther("40"));
        await eyecons.renewSubscription(tether.target, [tokenId]);
        const latestTime = BigInt(await time.latest());
        expect(await eyecons.subscriptionExpirationTimeByTokenId(tokenId))
            .to.equal(latestTime + await eyecons.ONE_YEAR());
        expect((await eyecons.subscriptionStatus(tokenId)).isSubscriptionActive_)
            .to.equal(true);
        expect((await eyecons.subscriptionStatus(tokenId)).remainingSubscriptionTime_)
            .to.equal(await eyecons.ONE_YEAR());
    });

    it("Successful tokenURI() execution", async () => {
        // Enable public period
        await eyecons.enablePublicPeriod();
        await eyecons.increaseAvailableAmountToMint(1);
        // Mint 1 token
        await tether.approve(eyecons.target, ethers.parseEther("40"));
        await eyecons.mint(tether.target, 1, SIGNATURE_EXAMPLE);
        const tokenId = await eyecons.tokenOfOwnerByIndex(owner.address, 0);
        expect(await eyecons.tokenURI(tokenId)).to.equal(`ipfs://${tokenId}`);
    });

    it("Successful approve() execution", async () => {
        // Increase available amount to mint 
        await eyecons.increaseAvailableAmountToMint(1);
        // Enable trading
        await eyecons.enableTrading();
        // Presale period mint with signature
        const signature = await generateSignature(owner, 1);
        await tether.approve(eyecons.target, ethers.parseEther("40"));
        await eyecons.mint(tether.target, 1, signature);
        // Approve and transfer
        await eyecons.approve(alice.address, 1);
        await eyecons.transferFrom(owner.address, alice.address, 1);
        expect(await eyecons.balanceOf(alice.address)).to.equal(1);
    });

    it("Successful onlyAllowedOperatorApproval() execution", async () => {
        await expect(eyecons.approve(LOOKS_RARE_TRANSFER_MANAGER, 1)).to.be.reverted;
        await expect(eyecons.setApprovalForAll(LOOKS_RARE_TRANSFER_MANAGER, 1)).to.be.reverted;
    });

    it("Successful _processPayment() execution", async () => {
        // Enable public period
        await eyecons.enablePublicPeriod();
        await eyecons.increaseAvailableAmountToMint(4);
        const tokenPrice = ethers.parseEther("100");
        const subscriptionPrice = ethers.parseEther("40")
        // Update prices
        await eyecons.updatePrices(tokenPrice, subscriptionPrice);
        // Mint with tether
        await tether.approve(eyecons.target, tokenPrice + subscriptionPrice);
        await expect(eyecons.mint(tether.target, 1, SIGNATURE_EXAMPLE, { value: 1 }))
            .to.be.revertedWithCustomError(eyecons, "NonZeroMsgValue");
        await eyecons.mint(tether.target, 1, SIGNATURE_EXAMPLE);
        expect(await tether.balanceOf(treasury.address)).to.equal(tokenPrice + subscriptionPrice);
        expect(await eyecons.balanceOf(owner.address)).to.equal(1);
        // Mint with exact price
        let price = (tokenPrice + subscriptionPrice) * BigInt(1e18) / (PRICE_ORACLE_ANSWER * BigInt(1e10));
        await eyecons.mint(ethers.ZeroAddress, 1, SIGNATURE_EXAMPLE, { value: price });
        // Attempt to mint with insufficient value
        await expect(eyecons.mint(ethers.ZeroAddress, 1, SIGNATURE_EXAMPLE, { value: price / 2n }))
            .to.be.revertedWithCustomError(eyecons, "InsufficientPrice");
        // Mint with big value
        const balanceBefore = await ethers.provider.getBalance(owner.address);
        await eyecons.mint(ethers.ZeroAddress, 1, SIGNATURE_EXAMPLE, { value: ethers.parseEther("1") });
        expect(await ethers.provider.getBalance(owner.address))
            .to.be.closeTo(balanceBefore - price, ethers.parseEther("0.001"));
        // Attempt to mint with invalid currency
        await expect(eyecons.mint(treasury.address, 1, SIGNATURE_EXAMPLE))
            .to.be.revertedWithCustomError(eyecons, "InvalidPaymentCurrency");
    });

    it("Successful _beforeTokenTransfer() execution", async () => {
        // Increase available amount to mint 
        await eyecons.increaseAvailableAmountToMint(3);
        // Presale period mint with signature
        const signature = await generateSignature(alice, 3);
        // Approve
        await tether.connect(alice).approve(eyecons.target, ethers.parseEther("120"));
        // Mint 3 tokens
        await eyecons.connect(alice).mint(tether.target, 3, signature);
        // Attempt to transfer 
        await expect(eyecons.connect(alice).transferFrom(alice.address, owner.address, 1))
            .to.be.revertedWithCustomError(eyecons, "ForbiddenToTransferTokens");
        // Enable trading
        await eyecons.enableTrading();
        // Successful transfer
        await eyecons.connect(alice).transferFrom(alice.address, owner.address, 1);
    });
});