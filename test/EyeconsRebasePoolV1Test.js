const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

describe("EyeconsRebasePoolV1", () => {
    const MONTH = 2592000n;
    const THOUSAND = ethers.parseEther("1000");

    before(async () => {
        [owner, authority, alice, bob, treasury] = await ethers.getSigners();
    });

    const fixture = async () => {
        const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
        const erc20MockInstance = await ERC20Mock.deploy();
        const Eyecons = await ethers.getContractFactory("Eyecons");
        const eyeconsInstance = await Eyecons.deploy(
            4,
            0,
            0,
            owner.address,
            owner.address,
            "ipfs://",
            erc20MockInstance.target,
            owner.address
        );
        const ERC721Mock = await ethers.getContractFactory("ERC721Mock");
        const erc721MockInstance = await ERC721Mock.deploy();
        const ERC1155Mock = await ethers.getContractFactory("ERC1155Mock");
        const erc1155MockInstance = await ERC1155Mock.deploy(); 
        const EyeconsRebasePool = await ethers.getContractFactory("EyeconsRebasePoolV1");
        const eyeconsRebasePoolInstance = await upgrades.deployProxy(
            EyeconsRebasePool,
            [
                ethers.parseEther("40"), 
                erc20MockInstance.target,
                treasury.address, 
                erc20MockInstance.target, 
                eyeconsInstance.target, 
                authority.address
            ],
            { initializer: "initialize", kind: "uups"}
        );
        await eyeconsInstance.enablePublicPeriod();
        await eyeconsInstance.enableTrading();
        await eyeconsInstance.increaseAvailableAmountToMint(4);
        await eyeconsInstance.mint(erc20MockInstance.target, 4, ethers.ZeroHash);
        await eyeconsInstance.setApprovalForAll(eyeconsRebasePoolInstance.target, true);
        await eyeconsInstance.connect(alice).setApprovalForAll(eyeconsRebasePoolInstance.target, true);
        await eyeconsInstance.connect(bob).setApprovalForAll(eyeconsRebasePoolInstance.target, true);
        return { erc20MockInstance, eyeconsInstance, erc721MockInstance, erc1155MockInstance, eyeconsRebasePoolInstance };
    }

    beforeEach(async () => {
        const { 
            erc20MockInstance, 
            eyeconsInstance, 
            erc721MockInstance,
            erc1155MockInstance, 
            eyeconsRebasePoolInstance 
        } = await loadFixture(fixture);
        erc20Mock = erc20MockInstance;
        eyecons = eyeconsInstance;
        erc721Mock = erc721MockInstance;
        erc1155Mock = erc1155MockInstance;
        eyeconsRebasePool = eyeconsRebasePoolInstance;
    });

    it("Successful initialize() execution", async () => {
        // Checks
        expect(await eyeconsRebasePool.hasRole(await eyeconsRebasePool.DEFAULT_ADMIN_ROLE(), owner.address)).to.equal(true);
        expect(await eyeconsRebasePool.hasRole(await eyeconsRebasePool.AUTHORITY_ROLE(), authority.address)).to.equal(true);
        expect(await eyeconsRebasePool.upgradingPrice()).to.equal(ethers.parseEther("40"));
        expect(await eyeconsRebasePool.treasury()).to.equal(treasury.address);
        expect(await eyeconsRebasePool.tether()).to.equal(erc20Mock.target);
        expect(await eyeconsRebasePool.eye()).to.equal(erc20Mock.target);
        expect(await eyeconsRebasePool.eyecons()).to.equal(eyecons.target);
        expect(await eyeconsRebasePool.paused()).to.equal(true);
        expect(await eyeconsRebasePool.isLaunched()).to.equal(false);
        expect(await eyeconsRebasePool.basePowerIncreaseFactorByYear(0)).to.equal(10000);
        expect(await eyeconsRebasePool.basePowerIncreaseFactorByYear(1)).to.equal(15000);
        expect(await eyeconsRebasePool.basePowerIncreaseFactorByYear(2)).to.equal(20000);
        expect(await eyeconsRebasePool.basePowerFactorByYear(0)).to.equal(0);
        expect(await eyeconsRebasePool.basePowerFactorByYear(1)).to.equal(15000);
        expect(await eyeconsRebasePool.basePowerFactorByYear(2)).to.equal(20000);
        expect(await eyeconsRebasePool.supportsInterface(ethers.toBeHex(0x4e2312e0))).to.equal(true);
        // Attempt to initialize again
        await expect(eyeconsRebasePool.initialize(
            ethers.parseEther("40"), 
            erc20Mock.target,
            treasury.address,
            erc20Mock.target,
            erc1155Mock.target,
            alice.address
        )).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("Successful launch() execution", async () => {
        // Attempt to pause from non-granted to AUTHORITY_ROLE
        await expect(eyeconsRebasePool.connect(alice).launch())
            .to.be.revertedWith(
                `AccessControl: account ${(alice.address).toLowerCase()} is missing role ${await eyeconsRebasePool.DEFAULT_ADMIN_ROLE()}`
            );
        // Successful launch
        await eyeconsRebasePool.launch();
        expect(await eyeconsRebasePool.currentCycleStartTime()).to.equal(await time.latest());
        expect(await eyeconsRebasePool.isLaunched()).to.equal(true);
        expect(await eyeconsRebasePool.paused()).to.equal(false);
        // Attempt to launch again
        await expect(eyeconsRebasePool.launch())
            .to.be.revertedWithCustomError(eyeconsRebasePool, "AttemptToLaunchAgain");
    });

    it("Successful updateBasePowerFactor() execution", async () => {
        // Attempt to set from non-granted to DEFAULT_ADMIN_ROLE
        await expect(eyeconsRebasePool.connect(alice).updateBasePowerFactor(0, 5000))
            .to.be.revertedWith(
                `AccessControl: account ${(alice.address).toLowerCase()} is missing role ${await eyeconsRebasePool.DEFAULT_ADMIN_ROLE()}`
            );
        // Successful setting
        await eyeconsRebasePool.updateBasePowerFactor(0, 5000);
        expect(await eyeconsRebasePool.basePowerFactorByYear(0)).to.equal(5000);
    });

    it("Successful updateBasePowerIncreaseFactor() execution", async () => {
        // Attempt to set from non-granted to DEFAULT_ADMIN_ROLE
        await expect(eyeconsRebasePool.connect(alice).updateBasePowerIncreaseFactor(0, 5000))
            .to.be.revertedWith(
                `AccessControl: account ${(alice.address).toLowerCase()} is missing role ${await eyeconsRebasePool.DEFAULT_ADMIN_ROLE()}`
            );
        // Successful setting
        await eyeconsRebasePool.updateBasePowerIncreaseFactor(0, 5000);
        expect(await eyeconsRebasePool.basePowerIncreaseFactorByYear(0)).to.equal(5000);
    });

    it("Successful updateUpgradingPrice() execution", async () => {
        // Attemt to update from not the owner
        await expect(eyeconsRebasePool.connect(alice).updateUpgradingPrice(ethers.parseEther("20")))
            .to.be.revertedWith(
                `AccessControl: account ${(alice.address).toLowerCase()} is missing role ${await eyeconsRebasePool.DEFAULT_ADMIN_ROLE()}`
            );
        // Successful updating
        await eyeconsRebasePool.updateUpgradingPrice(ethers.parseEther("100"));
        expect(await eyeconsRebasePool.upgradingPrice()).to.equal(ethers.parseEther("100"));
    });

    it("Successful updateTreasury() execution", async () => {
        // Attemt to update from not the owner
        await expect(eyeconsRebasePool.connect(alice).updateTreasury(alice.address))
            .to.be.revertedWith(
                `AccessControl: account ${(alice.address).toLowerCase()} is missing role ${await eyeconsRebasePool.DEFAULT_ADMIN_ROLE()}`
            );
        // Successful updating
        await eyeconsRebasePool.updateTreasury(alice.address);
        expect(await eyeconsRebasePool.treasury()).to.equal(alice.address);
    });

    it("Successful pause() execution", async () => {
        // Successful launch
        await eyeconsRebasePool.launch();
        // Attempt to pause from non-granted to AUTHORITY_ROLE
        await expect(eyeconsRebasePool.connect(alice).pause())
            .to.be.revertedWith(
                `AccessControl: account ${(alice.address).toLowerCase()} is missing role ${await eyeconsRebasePool.AUTHORITY_ROLE()}`
            );
        // Successful pause
        await eyeconsRebasePool.connect(authority).pause();
        expect(await eyeconsRebasePool.paused()).to.equal(true);
    });

    it("Successful unpause() execution", async () => {
        // Attempt to unpause from non-granted to AUTHORITY_ROLE
        await expect(eyeconsRebasePool.connect(alice).unpause())
            .to.be.revertedWith(
                `AccessControl: account ${(alice.address).toLowerCase()} is missing role ${await eyeconsRebasePool.AUTHORITY_ROLE()}`
            );
        // Attempt to unpause without launch
        await expect(eyeconsRebasePool.connect(authority).unpause())
            .to.be.revertedWithCustomError(eyeconsRebasePool, "ForbiddenToUnpause");
        // Successful launch
        await eyeconsRebasePool.launch();
        await eyeconsRebasePool.connect(authority).pause();
        expect(await eyeconsRebasePool.paused()).to.equal(true);
        await eyeconsRebasePool.connect(authority).unpause();
        expect(await eyeconsRebasePool.paused()).to.equal(false);
    });

    it("Successful setMerkleRoot() execution", async () => {
        // Successful launch
        await eyeconsRebasePool.launch();
        // Attempt to set root from non-granted to AUTHORITY_ROLE
        await expect(eyeconsRebasePool.connect(alice).setMerkleRoot(erc20Mock.target, ethers.ZeroHash))
            .to.be.revertedWith(
                `AccessControl: account ${(alice.address).toLowerCase()} is missing role ${await eyeconsRebasePool.AUTHORITY_ROLE()}`
            );
        // Attempt to set root when contract is not paused
        await expect(eyeconsRebasePool.connect(authority).setMerkleRoot(erc20Mock.target, ethers.ZeroHash))
            .to.be.revertedWith("Pausable: not paused");
        // Pause
        await eyeconsRebasePool.connect(authority).pause();
        // + 90 days
        await time.increase(MONTH * 3n);
        // Successful Merkle root setting
        await eyeconsRebasePool.connect(authority).setMerkleRoot(erc20Mock.target, ethers.ZeroHash);
        expect(await eyeconsRebasePool.currentMerkleRootId()).to.equal(1);
        expect(await eyeconsRebasePool.currentCycleId()).to.equal(1);
    });

    it("Successful provideERC20Reward() execution", async () => {
        // Provide reward
        await erc20Mock.approve(eyeconsRebasePool.target, ethers.parseEther("100"));
        await expect(eyeconsRebasePool.provideERC20Reward(erc20Mock.target, ethers.parseEther("100")))
            .to.emit(eyeconsRebasePool, "ERC20RewardProvided").withArgs(erc20Mock.target, ethers.parseEther("100"));
    });

    it("Successful provideERC721Reward() execution", async () => {
        // Provide reward
        await erc721Mock.setApprovalForAll(eyeconsRebasePool.target, true);
        await expect(eyeconsRebasePool.provideERC721Reward(erc721Mock.target, [1, 2, 3]))
            .to.emit(eyeconsRebasePool, "ERC721RewardProvided");
    });

    it("Successful provideERC1155Reward() execution", async () => {
        // Attempt to provide reward with invalid array lengths
        await expect(eyeconsRebasePool.provideERC1155Reward(erc1155Mock.target, [1, 2], [1, 1, 1]))
            .to.be.revertedWithCustomError(eyeconsRebasePool, "InvalidArrayLength");
        // Provide reward
        await erc1155Mock.setApprovalForAll(eyeconsRebasePool.target, true);
        await expect(eyeconsRebasePool.provideERC1155Reward(erc1155Mock.target, [1, 2], [100, 200]))
            .to.emit(eyeconsRebasePool, "ERC1155RewardProvided");
    });

    it("Successful deposit() execution", async () => {
        // Successful launch
        await eyeconsRebasePool.launch();
        // Attempt to deposit with empty array
        await expect(eyeconsRebasePool.deposit([]))
            .to.be.revertedWithCustomError(eyeconsRebasePool, "InvalidArrayLength");
        // Successful deposit
        await eyeconsRebasePool.deposit([1, 2]);
        expect(await eyeconsRebasePool.numberOfDepositedTokensByAccount(owner.address)).to.equal(2);
        expect(await eyeconsRebasePool.getDepositedTokenIdByAccountAt(owner.address, 0)).to.equal(1);
        expect(await eyeconsRebasePool.getDepositedTokenIdByAccountAt(owner.address, 1)).to.equal(2);
        expect(await eyeconsRebasePool.numberOfDepositors()).to.equal(1);
        expect(await eyeconsRebasePool.getDepositorAt(0)).to.equal(owner.address);
        expect(await eyeconsRebasePool.lastDepositTimeByTokenId(1)).to.equal(await time.latest());
        expect(await eyeconsRebasePool.lastDepositTimeByTokenId(2)).to.equal(await time.latest());
        // Another successful deposit
        await eyeconsRebasePool.deposit([3]);
        expect(await eyeconsRebasePool.numberOfDepositedTokensByAccount(owner.address)).to.equal(3);
        expect(await eyeconsRebasePool.getDepositedTokenIdByAccountAt(owner.address, 2)).to.equal(3);
        expect(await eyeconsRebasePool.numberOfDepositors()).to.equal(1);
        expect(await eyeconsRebasePool.getDepositorAt(0)).to.equal(owner.address);
        expect(await eyeconsRebasePool.lastDepositTimeByTokenId(3)).to.equal(await time.latest());
        // Attempt to deposit when contract is paused
        await eyeconsRebasePool.connect(authority).pause();
        await expect(eyeconsRebasePool.deposit([4])).to.be.revertedWith("Pausable: paused");
    });

    it("Successful withdraw() execution", async () => {
        // Successful launch
        await eyeconsRebasePool.launch();
        // Successful deposit
        await eyeconsRebasePool.deposit([1, 2]);
        // Attempt to withdraw with empty array
        await expect(eyeconsRebasePool.withdraw([]))
            .to.be.revertedWithCustomError(eyeconsRebasePool, "InvalidArrayLength");
        // Attempt to withdraw invalid token
        await expect(eyeconsRebasePool.withdraw([3]))
            .to.be.revertedWithCustomError(eyeconsRebasePool, "InvalidTokenIdToWithdraw");
        // + 30 days
        await time.increase(MONTH);
        // Successful withdrawal
        await eyeconsRebasePool.withdraw([1]);
        // 2592003
        const depositDuration = BigInt(await time.latest()) - (await eyeconsRebasePool.lastDepositTimeByTokenId(1));
        // 2592000 * 50000 + 3 * 90909
        const basePower = await eyeconsRebasePool.BASE_POWER();
        const basePowerIncrease = await eyeconsRebasePool.BASE_POWER_INCREASE();
        const expectedCumulativePower = MONTH * basePower + 3n * (basePower + basePowerIncrease);
        expect(await eyeconsRebasePool.storedAccumulatedPowerByTokenId(1)).to.equal(expectedCumulativePower);
        // 2591997
        const remainingDuration = MONTH - depositDuration % MONTH;
        expect(await eyeconsRebasePool.storedRemainingDurationByTokenId(1)).to.equal(remainingDuration);
        expect(await eyeconsRebasePool.storedPowerByTokenId(1)).to.equal(basePower + basePowerIncrease);
        expect(await eyeconsRebasePool.storedLevelByTokenId(1)).to.equal(2);
        // Deposit again
        await eyeconsRebasePool.deposit([1]);
        // Withdraw with the same level
        await eyeconsRebasePool.withdraw([1]);
        expect(await eyeconsRebasePool.storedPowerByTokenId(1)).to.equal(basePower + basePowerIncrease);
        expect(await eyeconsRebasePool.storedLevelByTokenId(1)).to.equal(2);
        expect(await eyeconsRebasePool.numberOfDepositedTokensByAccount(owner.address)).to.equal(1);
        // Attempt to withdraw when contract is paused
        await eyeconsRebasePool.connect(authority).pause();
        await expect(eyeconsRebasePool.withdraw([2])).to.be.revertedWith("Pausable: paused");
        // + 60 days
        await time.increase(MONTH * 2n);
        // Set root
        await eyeconsRebasePool.connect(authority).setMerkleRoot(erc20Mock.target, ethers.ZeroHash);
        // Unpause
        await eyeconsRebasePool.connect(authority).unpause();
        // Withdraw 
        await eyeconsRebasePool.withdraw([2]);
        expect(await eyeconsRebasePool.storedDepositDurationByCycleIdAndTokenId(await eyeconsRebasePool.currentCycleId(), 2))
            .to.equal(2);
    });

    it("Successful claim() execution (ERC20)", async () => {
        // Successful launch
        await eyeconsRebasePool.launch();
        // Merkle root setting
        await time.increase(MONTH * 3n);
        await eyeconsRebasePool.connect(authority).pause();
        await erc20Mock.transfer(eyeconsRebasePool.target, THOUSAND);
        const wallets = [alice.address, bob.address];
        const amounts = [THOUSAND / 2n, THOUSAND / 2n];
        const currentMerkleRootId = await eyeconsRebasePool.currentMerkleRootId();
        const elements = wallets.map((wallet, i) => 
            wallet
            + (erc20Mock.target).substring(2)
            + ethers.zeroPadValue(ethers.toBeHex(amounts[i]), 32).substring(2)
            + ethers.zeroPadValue(ethers.toBeHex(currentMerkleRootId), 32).substring(2)
        );
        const hashedElements = elements.map(keccak256).map(x => MerkleTree.bufferToHex(x));
        const tree = new MerkleTree(elements, keccak256, { hashLeaves: true, sort: true });
        const root = tree.getHexRoot();
        await eyeconsRebasePool.connect(authority).setMerkleRoot(erc20Mock.target, root);
        await eyeconsRebasePool.connect(authority).unpause();
        // Claim
        const leaves = tree.getHexLeaves();
        const proofs = leaves.map(tree.getHexProof, tree);
        await eyeconsRebasePool.connect(alice).claim(
            0,
            erc20Mock.target,
            currentMerkleRootId,
            [],
            [THOUSAND / 2n],
            proofs[leaves.indexOf(hashedElements[0])]
        );
        expect(await erc20Mock.balanceOf(alice.address)).to.equal(THOUSAND / 2n);
        // Attempt to claim again
        await expect(eyeconsRebasePool.connect(alice).claim(
            0,
            erc20Mock.target,
            currentMerkleRootId,
            [],
            [THOUSAND / 2n],
            proofs[leaves.indexOf(hashedElements[0])]
        )).to.be.revertedWithCustomError(eyeconsRebasePool, "AttemptToClaimAgain");
        // Attempt to claim with invalid proof
        await expect(eyeconsRebasePool.connect(bob).claim(
            0,
            erc20Mock.target,
            currentMerkleRootId,
            [],
            [THOUSAND / 2n],
            proofs[leaves.indexOf(hashedElements[0])]
        )).to.be.revertedWithCustomError(eyeconsRebasePool, "InvalidProof");
        // Attempt to claim with invalid array lengths
        await expect(eyeconsRebasePool.connect(bob).claim(
            0,
            erc20Mock.target,
            currentMerkleRootId,
            [0],
            [THOUSAND / 2n],
            proofs[leaves.indexOf(hashedElements[1])]
        )).to.be.revertedWithCustomError(eyeconsRebasePool, "InvalidArrayLength");
        await expect(eyeconsRebasePool.connect(bob).claim(
            0,
            erc20Mock.target,
            currentMerkleRootId,
            [],
            [THOUSAND / 2n, THOUSAND / 2n],
            proofs[leaves.indexOf(hashedElements[1])]
        )).to.be.revertedWithCustomError(eyeconsRebasePool, "InvalidArrayLength");
        // Attempt to claim when contract is paused
        await eyeconsRebasePool.connect(authority).pause();
        await expect(eyeconsRebasePool.claim(
            0,
            erc20Mock.target,
            currentMerkleRootId,
            [],
            [THOUSAND / 2n, THOUSAND / 2n],
            proofs[leaves.indexOf(hashedElements[1])]
        )).to.be.revertedWith("Pausable: paused");
    });

    it("Successful claim() execution (ERC721)", async () => {
        // Successful launch
        await eyeconsRebasePool.launch();
        // Merkle root setting
        await eyeconsRebasePool.connect(authority).pause();
        await eyecons.transferFrom(owner.address, eyeconsRebasePool.target, 1);
        await eyecons.transferFrom(owner.address, eyeconsRebasePool.target, 2);
        const wallets = [alice.address, bob.address];
        const tokenIds = [1, 2];
        const currentMerkleRootId = await eyeconsRebasePool.currentMerkleRootId();
        const elements = wallets.map((wallet, i) => 
            wallet
            + (eyecons.target).substring(2)
            + ethers.zeroPadValue(ethers.toBeHex(tokenIds[i]), 32).substring(2)
            + ethers.zeroPadValue(ethers.toBeHex(currentMerkleRootId), 32).substring(2)
        );
        const hashedElements = elements.map(keccak256).map(x => MerkleTree.bufferToHex(x));
        const tree = new MerkleTree(elements, keccak256, { hashLeaves: true, sort: true });
        const root = tree.getHexRoot();
        await eyeconsRebasePool.connect(authority).setMerkleRoot(eyecons.target, root);
        await eyeconsRebasePool.connect(authority).unpause();
        // Claim
        const leaves = tree.getHexLeaves();
        const proofs = leaves.map(tree.getHexProof, tree);
        await eyeconsRebasePool.connect(alice).claim(
            1,
            eyecons.target,
            currentMerkleRootId,
            [1],
            [],
            proofs[leaves.indexOf(hashedElements[0])]
        );
        expect(await eyecons.balanceOf(alice.address)).to.equal(1);
        // Attempt to claim again
        await expect(eyeconsRebasePool.connect(alice).claim(
            1,
            eyecons.target,
            currentMerkleRootId,
            [1],
            [],
            proofs[leaves.indexOf(hashedElements[0])]
        )).to.be.revertedWithCustomError(eyeconsRebasePool, "AttemptToClaimAgain");
        // Attempt to claim with invalid proof
        await expect(eyeconsRebasePool.connect(bob).claim(
            1,
            eyecons.target,
            currentMerkleRootId,
            [2],
            [],
            proofs[leaves.indexOf(hashedElements[0])]
        )).to.be.revertedWithCustomError(eyeconsRebasePool, "InvalidProof");
        // Attempt to claim with invalid array lengths
        await expect(eyeconsRebasePool.connect(bob).claim(
            1,
            eyecons.target,
            currentMerkleRootId,
            [2],
            [THOUSAND],
            proofs[leaves.indexOf(hashedElements[1])]
        )).to.be.revertedWithCustomError(eyeconsRebasePool, "InvalidArrayLength");
        await expect(eyeconsRebasePool.connect(bob).claim(
            1,
            eyecons.target,
            currentMerkleRootId,
            [],
            [],
            proofs[leaves.indexOf(hashedElements[1])]
        )).to.be.revertedWithCustomError(eyeconsRebasePool, "InvalidArrayLength");
        // Attempt to claim when contract is paused
        await eyeconsRebasePool.connect(authority).pause();
        await expect(eyeconsRebasePool.connect(bob).claim(
            1,
            eyecons.target,
            currentMerkleRootId,
            [2],
            [],
            proofs[leaves.indexOf(hashedElements[1])]
        )).to.be.revertedWith("Pausable: paused");
    });

    it("Successful claim() execution (ERC1155)", async () => {
        // Successful launch
        await eyeconsRebasePool.launch();
        // Merkle root setting
        await eyeconsRebasePool.connect(authority).pause();
        await erc1155Mock.safeTransferFrom(owner.address, eyeconsRebasePool.target, 0, THOUSAND, ethers.ZeroHash);
        const wallets = [alice.address, bob.address];
        const tokenIds = [0, 0];
        const amounts = [THOUSAND / 2n, THOUSAND / 2n];
        const currentMerkleRootId = await eyeconsRebasePool.currentMerkleRootId();
        const elements = wallets.map((wallet, i) => 
            wallet
            + (erc1155Mock.target).substring(2)
            + ethers.zeroPadValue(ethers.toBeHex(tokenIds[i]), 32).substring(2)
            + ethers.zeroPadValue(ethers.toBeHex(amounts[i]), 32).substring(2)
            + ethers.zeroPadValue(ethers.toBeHex(currentMerkleRootId), 32).substring(2)
        );
        const hashedElements = elements.map(keccak256).map(x => MerkleTree.bufferToHex(x));
        const tree = new MerkleTree(elements, keccak256, { hashLeaves: true, sort: true });
        const root = tree.getHexRoot();
        await eyeconsRebasePool.connect(authority).setMerkleRoot(erc1155Mock.target, root);
        await eyeconsRebasePool.connect(authority).unpause();
        // Claim
        const leaves = tree.getHexLeaves();
        const proofs = leaves.map(tree.getHexProof, tree);
        await eyeconsRebasePool.connect(alice).claim(
            2,
            erc1155Mock.target,
            currentMerkleRootId,
            [0],
            [THOUSAND / 2n],
            proofs[leaves.indexOf(hashedElements[0])]
        );
        expect(await erc1155Mock.balanceOf(alice.address, 0)).to.equal(THOUSAND / 2n);
        // Attempt to claim again
        await expect(eyeconsRebasePool.connect(alice).claim(
            2,
            erc1155Mock.target,
            currentMerkleRootId,
            [0],
            [THOUSAND / 2n],
            proofs[leaves.indexOf(hashedElements[0])]
        )).to.be.revertedWithCustomError(eyeconsRebasePool, "AttemptToClaimAgain");
        // Attempt to claim with invalid proof
        await expect(eyeconsRebasePool.connect(bob).claim(
            2,
            erc1155Mock.target,
            currentMerkleRootId,
            [0],
            [THOUSAND / 2n],
            proofs[leaves.indexOf(hashedElements[0])]
        )).to.be.revertedWithCustomError(eyeconsRebasePool, "InvalidProof");
        // Attempt to claim with invalid array lengths
        await expect(eyeconsRebasePool.connect(bob).claim(
            2,
            erc1155Mock.target,
            currentMerkleRootId,
            [],
            [THOUSAND / 2n],
            proofs[leaves.indexOf(hashedElements[1])]
        )).to.be.revertedWithCustomError(eyeconsRebasePool, "InvalidArrayLength");
        await expect(eyeconsRebasePool.connect(bob).claim(
            2,
            erc1155Mock.target,
            currentMerkleRootId,
            [0],
            [],
            proofs[leaves.indexOf(hashedElements[1])]
        )).to.be.revertedWithCustomError(eyeconsRebasePool, "InvalidArrayLength");
        await expect(eyeconsRebasePool.connect(bob).claim(
            2,
            erc1155Mock.target,
            currentMerkleRootId,
            [0],
            [THOUSAND / 2n, THOUSAND / 2n],
            proofs[leaves.indexOf(hashedElements[1])]
        )).to.be.revertedWithCustomError(eyeconsRebasePool, "InvalidArrayLength");
        // Attempt to claim when contract is paused
        await eyeconsRebasePool.connect(authority).pause();
        await expect(eyeconsRebasePool.connect(bob).claim(
            2,
            erc1155Mock.target,
            currentMerkleRootId,
            [0],
            [THOUSAND / 2n],
            proofs[leaves.indexOf(hashedElements[1])]
        )).to.be.revertedWith("Pausable: paused");
    });

    it("Successful tokenInfo() execution", async () => {
        // Successful launch
        await eyeconsRebasePool.launch();
        // Deposit
        await eyeconsRebasePool.deposit([1]);
        // + 30 days
        await time.increase(MONTH);
        const basePower = await eyeconsRebasePool.BASE_POWER();
        const basePowerIncrease = await eyeconsRebasePool.BASE_POWER_INCREASE();
        const basePoints = await eyeconsRebasePool.BASE_POINTS();
        // Check
        let tokenInfo = await eyeconsRebasePool.tokenInfo(1);
        expect(tokenInfo.accumulatedPower_).to.equal(MONTH * basePower);
        expect(tokenInfo.currentPower_).to.equal(basePower + basePowerIncrease);
        expect(tokenInfo.depositor_).to.equal(owner.address);
        // + 10 days
        await time.increase(MONTH / 3n);
        // Withdrawal
        await eyeconsRebasePool.withdraw([1]);
        // Check
        tokenInfo = await eyeconsRebasePool.tokenInfo(1);
        expect(tokenInfo.accumulatedPower_).to.equal(0);
        expect(tokenInfo.currentPower_).to.equal(basePower + basePowerIncrease);
        // Deposit
        await eyeconsRebasePool.deposit([1]);
        // + 660 days
        await time.increase(MONTH * 22n);
        // Check
        tokenInfo = await eyeconsRebasePool.tokenInfo(1);
        expect(tokenInfo.currentPower_)
            .to.be.closeTo(basePower * await eyeconsRebasePool.basePowerIncreaseFactorByYear(1) / basePoints * 10n, 7);
        // Withdrawal (cycle at 11 months and 10 days: 700 - 360 = 340, remaining duration = 20 days)
        await eyeconsRebasePool.withdraw([1]);
        // Deposit
        await eyeconsRebasePool.deposit([1]);
        // + 30 days
        await time.increase(MONTH);
        tokenInfo = await eyeconsRebasePool.tokenInfo(1);
        expect(tokenInfo.currentPower_).to.equal(basePower * await eyeconsRebasePool.basePowerIncreaseFactorByYear(2) / basePoints);
    });

    it("Successful isEligibleForRewardInThisCycle() execution", async () => {
        // Successful launch
        await eyeconsRebasePool.launch();
        // Non-deposited token check
        expect(await eyeconsRebasePool.isEligibleForRewardInThisCycle(1)).to.equal(false);
        // Deposit
        await eyeconsRebasePool.deposit([1]);
        expect(await eyeconsRebasePool.isEligibleForRewardInThisCycle(1)).to.equal(false);
        // + 60 days
        await time.increase(MONTH * 2n);
        // Check
        expect(await eyeconsRebasePool.isEligibleForRewardInThisCycle(1)).to.equal(true);
        // + 30 days
        await time.increase(MONTH);
        // Set root
        await eyeconsRebasePool.connect(authority).pause();
        await eyeconsRebasePool.connect(authority).setMerkleRoot(erc20Mock.target, ethers.ZeroHash);
        // Check
        expect(await eyeconsRebasePool.isEligibleForRewardInThisCycle(1)).to.equal(false);
        // + 60 days
        await time.increase(MONTH * 2n);
        // Check
        expect(await eyeconsRebasePool.isEligibleForRewardInThisCycle(1)).to.equal(true);
    });

    it("Successful back-end scenario execution", async () => {
        const FIRST_CYCLE_REWARD = 1000000n;
        await eyeconsRebasePool.launch();
        // Deposit from owner (0)
        await eyeconsRebasePool.deposit([1]);
        // + 30 days
        await time.increase(MONTH);
        // Deposit from alice (1)
        await eyecons.transferFrom(owner.address, alice.address, 2);
        await eyeconsRebasePool.connect(alice).deposit([2]);
        // + 60 days (CYCLE 1)
        await time.increase(MONTH * 3n);
        // Pause
        await eyeconsRebasePool.connect(authority).pause();
        // Calculations
        let cumulativePowerByTokenId = new Map();
        let accumulatedPowerByDepositorInThePreviousCycle = new Map();
        let totalAccumulatedPowerInThePreviousCycle = 0n;
        let numberOfDepositors = await eyeconsRebasePool.numberOfDepositors();
        for (let i = 0; i < numberOfDepositors; i++) {
            const depositor = await eyeconsRebasePool.getDepositorAt(i);
            // If the depositor is new add his address to database
            const numberOfDepositedTokens = await eyeconsRebasePool.numberOfDepositedTokensByAccount(depositor);
            let accumulatedPower = 0n;
            for (let j = 0; j < numberOfDepositedTokens; j++) {
                const tokenId = await eyeconsRebasePool.getDepositedTokenIdByAccountAt(depositor, j);
                if (await eyeconsRebasePool.isEligibleForRewardInThisCycle(tokenId)) {
                    let currentCumulativePower = await eyeconsRebasePool.cumulativePowerByTokenId(tokenId);
                    cumulativePowerByTokenId.set(tokenId, currentCumulativePower - BigInt(/*cumulativePowerByTokenId.get(tokenId) = 0*/0));
                    // Then store in database (tokenId: currentCumulativePower)
                    accumulatedPower += cumulativePowerByTokenId.get(tokenId);
                }
            }
            accumulatedPowerByDepositorInThePreviousCycle.set(depositor, accumulatedPower);
            totalAccumulatedPowerInThePreviousCycle += accumulatedPowerByDepositorInThePreviousCycle.get(depositor);
        }
        // Rewards for the previous cycle calculations
        let rewardByDepositorForThePreviousCycle = new Map();
        for (let i = 0; i < numberOfDepositors; i++) {
            const depositor = await eyeconsRebasePool.getDepositorAt(i);
            rewardByDepositorForThePreviousCycle.set(
                depositor, 
                FIRST_CYCLE_REWARD * accumulatedPowerByDepositorInThePreviousCycle.get(depositor) / totalAccumulatedPowerInThePreviousCycle
            );
        }
        // Merkle root setting
        await erc20Mock.transfer(eyeconsRebasePool.target, FIRST_CYCLE_REWARD);
        let wallets = [owner.address, alice.address]; // from all database (line 599)
        let totalRewardByDepositor = new Map();
        let lastMerkleRootIdForEyeToken = await eyeconsRebasePool.lastMerkleRootIdForEyeToken();
        let previousCycleMerkleRoot = await eyeconsRebasePool.merkleRootByTokenAndId(erc20Mock.target, lastMerkleRootIdForEyeToken);
        for (let i = 0; i < wallets.length; i++) {
            if (await eyeconsRebasePool.isClaimedByAccountAndMerkleRoot(wallets[i], previousCycleMerkleRoot)) {
                totalRewardByDepositor.set(wallets[i], rewardByDepositorForThePreviousCycle.get(wallets[i]));
            } else {
                // Here we add up the earned reward from the previous cycle and the database record of the stored reward
                totalRewardByDepositor.set(
                    wallets[i], 
                    rewardByDepositorForThePreviousCycle.get(wallets[i]) + BigInt(/*totalRewardByDepositor.get(wallets[i]) = 0*/0)
                );
            }
            // Then save to database total reward by depositor (depositor: totalReward)
        }
        let currentMerkleRootId = await eyeconsRebasePool.currentMerkleRootId();
        // Then save merkle root id to database
        let elements = wallets.map((wallet) => 
            wallet
            + (erc20Mock.target).substring(2)
            + ethers.zeroPadValue(ethers.toBeHex(totalRewardByDepositor.get(wallet)), 32).substring(2)
            + ethers.zeroPadValue(ethers.toBeHex(currentMerkleRootId), 32).substring(2)
        );
        let hashedElements = elements.map(keccak256).map(x => MerkleTree.bufferToHex(x));
        let tree = new MerkleTree(elements, keccak256, { hashLeaves: true, sort: true });
        let root = tree.getHexRoot();
        await eyeconsRebasePool.connect(authority).setMerkleRoot(erc20Mock.target, root);
        await eyeconsRebasePool.connect(authority).unpause();
        // Claim only from alice
        let leaves = tree.getHexLeaves();
        let proofs = leaves.map(tree.getHexProof, tree);
        await eyeconsRebasePool.connect(alice).claim(
            0,
            erc20Mock.target,
            currentMerkleRootId,
            [],
            [totalRewardByDepositor.get(alice.address)],
            proofs[leaves.indexOf(hashedElements[1])]
        );
        // + 90 days (CYCLE 2)
        const SECOND_CYCLE_REWARD = 1500000n;
        await time.increase(MONTH * 3n);
        // Pause
        await eyeconsRebasePool.connect(authority).pause();
        // Calculations
        totalAccumulatedPowerInThePreviousCycle = 0n;
        numberOfDepositors = await eyeconsRebasePool.numberOfDepositors();
        for (let i = 0; i < numberOfDepositors; i++) {
            const depositor = await eyeconsRebasePool.getDepositorAt(i);
            // If the depositor is new add his address to database
            const numberOfDepositedTokens = await eyeconsRebasePool.numberOfDepositedTokensByAccount(depositor);
            let accumulatedPower = 0n;
            for (let j = 0; j < numberOfDepositedTokens; j++) {
                const tokenId = await eyeconsRebasePool.getDepositedTokenIdByAccountAt(depositor, j);
                if (await eyeconsRebasePool.isEligibleForRewardInThisCycle(tokenId)) {
                    let currentCumulativePower = await eyeconsRebasePool.cumulativePowerByTokenId(tokenId);
                    cumulativePowerByTokenId.set(tokenId, currentCumulativePower - cumulativePowerByTokenId.get(tokenId));
                    // Then store in database (tokenId: currentCumulativePower)
                    accumulatedPower += cumulativePowerByTokenId.get(tokenId);
                }
            }
            accumulatedPowerByDepositorInThePreviousCycle.set(depositor, accumulatedPower);
            totalAccumulatedPowerInThePreviousCycle += accumulatedPowerByDepositorInThePreviousCycle.get(depositor);
        }
        // Rewards for the previous cycle calculations
        for (let i = 0; i < numberOfDepositors; i++) {
            const depositor = await eyeconsRebasePool.getDepositorAt(i);
            rewardByDepositorForThePreviousCycle.set(
                depositor, 
                SECOND_CYCLE_REWARD * accumulatedPowerByDepositorInThePreviousCycle.get(depositor) / totalAccumulatedPowerInThePreviousCycle
            );
        }
        // Merkle root setting
        await erc20Mock.transfer(eyeconsRebasePool.target, SECOND_CYCLE_REWARD);
        wallets = [owner.address, alice.address]; // from all database (line 599 and 675)
        lastMerkleRootIdForEyeToken = await eyeconsRebasePool.lastMerkleRootIdForEyeToken();
        previousCycleMerkleRoot = await eyeconsRebasePool.merkleRootByTokenAndId(erc20Mock.target, lastMerkleRootIdForEyeToken);
        for (let i = 0; i < wallets.length; i++) {
            if (await eyeconsRebasePool.isClaimedByAccountAndMerkleRoot(wallets[i], previousCycleMerkleRoot)) {
                totalRewardByDepositor.set(wallets[i], rewardByDepositorForThePreviousCycle.get(wallets[i]));
            } else {
                // Here we add up the earned reward from the previous cycle and the database record of the stored unclaimed reward
                totalRewardByDepositor.set(
                    wallets[i], 
                    rewardByDepositorForThePreviousCycle.get(wallets[i]) + totalRewardByDepositor.get(wallets[i])
                );
            }
            // Then save to database total reward by depositor (depositor: totalReward)
        }
        currentMerkleRootId = await eyeconsRebasePool.currentMerkleRootId();
        // Then save merkle root id to database
        elements = wallets.map((wallet) => 
            wallet
            + (erc20Mock.target).substring(2)
            + ethers.zeroPadValue(ethers.toBeHex(totalRewardByDepositor.get(wallet)), 32).substring(2)
            + ethers.zeroPadValue(ethers.toBeHex(currentMerkleRootId), 32).substring(2)
        );
        hashedElements = elements.map(keccak256).map(x => MerkleTree.bufferToHex(x));
        tree = new MerkleTree(elements, keccak256, { hashLeaves: true, sort: true });
        root = tree.getHexRoot();
        await eyeconsRebasePool.connect(authority).setMerkleRoot(erc20Mock.target, root);
        await eyeconsRebasePool.connect(authority).unpause();
        leaves = tree.getHexLeaves();
        proofs = leaves.map(tree.getHexProof, tree);
        // Claim from owner
        await eyeconsRebasePool.claim(
            0,
            erc20Mock.target,
            currentMerkleRootId,
            [],
            [totalRewardByDepositor.get(owner.address)],
            proofs[leaves.indexOf(hashedElements[0])]
        );
        // Claim from alice
        await eyeconsRebasePool.connect(alice).claim(
            0,
            erc20Mock.target,
            currentMerkleRootId,
            [],
            [totalRewardByDepositor.get(alice.address)],
            proofs[leaves.indexOf(hashedElements[1])]
        );
        expect(await erc20Mock.balanceOf(eyeconsRebasePool.target)).to.be.closeTo(0, 2);
    });

    it("Successful _authorizeUpgrade() execution", async () => {
        // Attempt to upgrade from non-granted to DEFAULT_ADMIN_ROLE
        await expect(eyeconsRebasePool.connect(alice).upgradeTo(erc20Mock.target))
            .to.be.revertedWith(
                `AccessControl: account ${(alice.address).toLowerCase()} is missing role ${await eyeconsRebasePool.DEFAULT_ADMIN_ROLE()}`
            );
        const implementation = await ethers.getContractAt(
            "EyeconsRebasePoolV1", 
            await upgrades.erc1967.getImplementationAddress(eyeconsRebasePool.target)
        );
        // Successful upgrading
        await expect(eyeconsRebasePool.upgradeTo(implementation.target)).to.emit(eyeconsRebasePool, "Upgraded");
    });
});