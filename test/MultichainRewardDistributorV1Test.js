const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

describe("MultichainRewardDistributorV1", () => {
    const MONTH = 2592000n;
    const THOUSAND = ethers.parseEther("1000");

    before(async () => {
        [owner, authority, alice, bob] = await ethers.getSigners();
    });

    const fixture = async () => {
        const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
        const erc20MockInstance = await ERC20Mock.deploy();
        const ERC721Mock = await ethers.getContractFactory("ERC721Mock");
        const erc721MockInstance = await ERC721Mock.deploy();
        const ERC1155Mock = await ethers.getContractFactory("ERC1155Mock");
        const erc1155MockInstance = await ERC1155Mock.deploy(); 
        const MultichainRewardDistributor = await ethers.getContractFactory("MultichainRewardDistributorV1");
        const multichainRewardDistributorInstance = await upgrades.deployProxy(
            MultichainRewardDistributor,
            [erc20MockInstance.target, authority.address],
            { initializer: "initialize", kind: "uups"}
        );
        return { erc20MockInstance, erc721MockInstance, erc1155MockInstance, multichainRewardDistributorInstance };
    }

    beforeEach(async () => {
        const { 
            erc20MockInstance, 
            erc721MockInstance,
            erc1155MockInstance, 
            multichainRewardDistributorInstance 
        } = await loadFixture(fixture);
        erc20Mock = erc20MockInstance;
        erc721Mock = erc721MockInstance;
        erc1155Mock = erc1155MockInstance;
        multichainRewardDistributor = multichainRewardDistributorInstance;
    });

    it("Successful initialize() execution", async () => {
        // Checks
        expect(await multichainRewardDistributor.hasRole(await multichainRewardDistributor.DEFAULT_ADMIN_ROLE(), owner.address)).to.equal(true);
        expect(await multichainRewardDistributor.hasRole(await multichainRewardDistributor.AUTHORITY_ROLE(), authority.address)).to.equal(true);
        expect(await multichainRewardDistributor.eye()).to.equal(erc20Mock.target);
        expect(await multichainRewardDistributor.supportsInterface(ethers.toBeHex(0x4e2312e0))).to.equal(true);
        // Attempt to initialize again
        await expect(multichainRewardDistributor.initialize(
            erc20Mock.target,
            alice.address
        )).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("Successful updateEye() execution", async () => {
        // Attempt to set from non-granted to DEFAULT_ADMIN_ROLE
        await expect(multichainRewardDistributor.connect(alice).updateEye(alice.address))
            .to.be.revertedWith(
                `AccessControl: account ${(alice.address).toLowerCase()} is missing role ${await multichainRewardDistributor.DEFAULT_ADMIN_ROLE()}`
            );
        // Successful setting
        await multichainRewardDistributor.updateEye(alice.address);
        expect(await multichainRewardDistributor.eye()).to.equal(alice.address);
    });

    it("Successful pause() execution", async () => {
        // Attempt to pause from non-granted to AUTHORITY_ROLE
        await expect(multichainRewardDistributor.connect(alice).pause())
            .to.be.revertedWith(
                `AccessControl: account ${(alice.address).toLowerCase()} is missing role ${await multichainRewardDistributor.AUTHORITY_ROLE()}`
            );
        // Successful pause
        await multichainRewardDistributor.connect(authority).pause();
        expect(await multichainRewardDistributor.paused()).to.equal(true);
    });

    it("Successful unpause() execution", async () => {
        // Attempt to unpause from non-granted to AUTHORITY_ROLE
        await expect(multichainRewardDistributor.connect(alice).unpause())
            .to.be.revertedWith(
                `AccessControl: account ${(alice.address).toLowerCase()} is missing role ${await multichainRewardDistributor.AUTHORITY_ROLE()}`
            );
        await multichainRewardDistributor.connect(authority).pause();
        expect(await multichainRewardDistributor.paused()).to.equal(true);
        await multichainRewardDistributor.connect(authority).unpause();
        expect(await multichainRewardDistributor.paused()).to.equal(false);
    });

    it("Successful provideERC20Reward() execution", async () => {
        // Provide reward
        await erc20Mock.approve(multichainRewardDistributor.target, ethers.parseEther("100"));
        await expect(multichainRewardDistributor.provideERC20Reward(erc20Mock.target, ethers.parseEther("100")))
            .to.emit(multichainRewardDistributor, "ERC20RewardProvided").withArgs(erc20Mock.target, ethers.parseEther("100"));
    });

    it("Successful provideERC721Reward() execution", async () => {
        // Provide reward
        await erc721Mock.setApprovalForAll(multichainRewardDistributor.target, true);
        await expect(multichainRewardDistributor.provideERC721Reward(erc721Mock.target, [1, 2, 3]))
            .to.emit(multichainRewardDistributor, "ERC721RewardProvided");
    });

    it("Successful provideERC1155Reward() execution", async () => {
        // Attempt to provide reward with invalid array lengths
        await expect(multichainRewardDistributor.provideERC1155Reward(erc1155Mock.target, [1, 2], [1, 1, 1]))
            .to.be.revertedWithCustomError(multichainRewardDistributor, "InvalidArrayLength");
        // Provide reward
        await erc1155Mock.setApprovalForAll(multichainRewardDistributor.target, true);
        await expect(multichainRewardDistributor.provideERC1155Reward(erc1155Mock.target, [1, 2], [100, 200]))
            .to.emit(multichainRewardDistributor, "ERC1155RewardProvided");
    });

    it("Successful setMerkleRoot() execution", async () => {
        // Attempt to set root from non-granted to AUTHORITY_ROLE
        await expect(multichainRewardDistributor.connect(alice).setMerkleRoot(erc20Mock.target, ethers.ZeroHash))
            .to.be.revertedWith(
                `AccessControl: account ${(alice.address).toLowerCase()} is missing role ${await multichainRewardDistributor.AUTHORITY_ROLE()}`
            );
        // Attempt to set root when contract is not paused
        await expect(multichainRewardDistributor.connect(authority).setMerkleRoot(erc20Mock.target, ethers.ZeroHash))
            .to.be.revertedWith("Pausable: not paused");
        // Pause
        await multichainRewardDistributor.connect(authority).pause();
        // Successful Merkle root setting
        await multichainRewardDistributor.connect(authority).setMerkleRoot(erc20Mock.target, ethers.ZeroHash);
        expect(await multichainRewardDistributor.currentMerkleRootId()).to.equal(1);
    });

    it("Successful claim() execution (ERC20)", async () => {
        // Merkle root setting
        await time.increase(MONTH * 3n);
        await multichainRewardDistributor.connect(authority).pause();
        await erc20Mock.transfer(multichainRewardDistributor.target, THOUSAND);
        const wallets = [alice.address, bob.address];
        const amounts = [THOUSAND / 2n, THOUSAND / 2n];
        const currentMerkleRootId = await multichainRewardDistributor.currentMerkleRootId();
        const elements = wallets.map((wallet, i) => 
            wallet
            + (erc20Mock.target).substring(2)
            + ethers.zeroPadValue(ethers.toBeHex(amounts[i]), 32).substring(2)
            + ethers.zeroPadValue(ethers.toBeHex(currentMerkleRootId), 32).substring(2)
        );
        const hashedElements = elements.map(keccak256).map(x => MerkleTree.bufferToHex(x));
        const tree = new MerkleTree(elements, keccak256, { hashLeaves: true, sort: true });
        const root = tree.getHexRoot();
        await multichainRewardDistributor.connect(authority).setMerkleRoot(erc20Mock.target, root);
        await multichainRewardDistributor.connect(authority).unpause();
        // Claim
        const leaves = tree.getHexLeaves();
        const proofs = leaves.map(tree.getHexProof, tree);
        await multichainRewardDistributor.connect(alice).claim(
            0,
            erc20Mock.target,
            currentMerkleRootId,
            [],
            [THOUSAND / 2n],
            proofs[leaves.indexOf(hashedElements[0])]
        );
        expect(await erc20Mock.balanceOf(alice.address)).to.equal(THOUSAND / 2n);
        // Attempt to claim again
        await expect(multichainRewardDistributor.connect(alice).claim(
            0,
            erc20Mock.target,
            currentMerkleRootId,
            [],
            [THOUSAND / 2n],
            proofs[leaves.indexOf(hashedElements[0])]
        )).to.be.revertedWithCustomError(multichainRewardDistributor, "AttemptToClaimAgain");
        // Attempt to claim with invalid proof
        await expect(multichainRewardDistributor.connect(bob).claim(
            0,
            erc20Mock.target,
            currentMerkleRootId,
            [],
            [THOUSAND / 2n],
            proofs[leaves.indexOf(hashedElements[0])]
        )).to.be.revertedWithCustomError(multichainRewardDistributor, "InvalidProof");
        // Attempt to claim with invalid array lengths
        await expect(multichainRewardDistributor.connect(bob).claim(
            0,
            erc20Mock.target,
            currentMerkleRootId,
            [0],
            [THOUSAND / 2n],
            proofs[leaves.indexOf(hashedElements[1])]
        )).to.be.revertedWithCustomError(multichainRewardDistributor, "InvalidArrayLength");
        await expect(multichainRewardDistributor.connect(bob).claim(
            0,
            erc20Mock.target,
            currentMerkleRootId,
            [],
            [THOUSAND / 2n, THOUSAND / 2n],
            proofs[leaves.indexOf(hashedElements[1])]
        )).to.be.revertedWithCustomError(multichainRewardDistributor, "InvalidArrayLength");
        // Attempt to claim when contract is paused
        await multichainRewardDistributor.connect(authority).pause();
        await expect(multichainRewardDistributor.claim(
            0,
            erc20Mock.target,
            currentMerkleRootId,
            [],
            [THOUSAND / 2n, THOUSAND / 2n],
            proofs[leaves.indexOf(hashedElements[1])]
        )).to.be.revertedWith("Pausable: paused");
    });

    it("Successful claim() execution (ERC721)", async () => {
        // Merkle root setting
        await multichainRewardDistributor.connect(authority).pause();
        await erc721Mock.safeTransferFrom(owner.address, multichainRewardDistributor.target, 1);
        await erc721Mock.safeTransferFrom(owner.address, multichainRewardDistributor.target, 2);
        const wallets = [alice.address, bob.address];
        const tokenIds = [1, 2];
        const currentMerkleRootId = await multichainRewardDistributor.currentMerkleRootId();
        const elements = wallets.map((wallet, i) => 
            wallet
            + (erc721Mock.target).substring(2)
            + ethers.zeroPadValue(ethers.toBeHex(tokenIds[i]), 32).substring(2)
            + ethers.zeroPadValue(ethers.toBeHex(currentMerkleRootId), 32).substring(2)
        );
        const hashedElements = elements.map(keccak256).map(x => MerkleTree.bufferToHex(x));
        const tree = new MerkleTree(elements, keccak256, { hashLeaves: true, sort: true });
        const root = tree.getHexRoot();
        await multichainRewardDistributor.connect(authority).setMerkleRoot(erc721Mock.target, root);
        await multichainRewardDistributor.connect(authority).unpause();
        // Claim
        const leaves = tree.getHexLeaves();
        const proofs = leaves.map(tree.getHexProof, tree);
        await multichainRewardDistributor.connect(alice).claim(
            1,
            erc721Mock.target,
            currentMerkleRootId,
            [1],
            [],
            proofs[leaves.indexOf(hashedElements[0])]
        );
        expect(await erc721Mock.balanceOf(alice.address)).to.equal(1);
        // Attempt to claim again
        await expect(multichainRewardDistributor.connect(alice).claim(
            1,
            erc721Mock.target,
            currentMerkleRootId,
            [1],
            [],
            proofs[leaves.indexOf(hashedElements[0])]
        )).to.be.revertedWithCustomError(multichainRewardDistributor, "AttemptToClaimAgain");
        // Attempt to claim with invalid proof
        await expect(multichainRewardDistributor.connect(bob).claim(
            1,
            erc721Mock.target,
            currentMerkleRootId,
            [2],
            [],
            proofs[leaves.indexOf(hashedElements[0])]
        )).to.be.revertedWithCustomError(multichainRewardDistributor, "InvalidProof");
        // Attempt to claim with invalid array lengths
        await expect(multichainRewardDistributor.connect(bob).claim(
            1,
            erc721Mock.target,
            currentMerkleRootId,
            [2],
            [THOUSAND],
            proofs[leaves.indexOf(hashedElements[1])]
        )).to.be.revertedWithCustomError(multichainRewardDistributor, "InvalidArrayLength");
        await expect(multichainRewardDistributor.connect(bob).claim(
            1,
            erc721Mock.target,
            currentMerkleRootId,
            [],
            [],
            proofs[leaves.indexOf(hashedElements[1])]
        )).to.be.revertedWithCustomError(multichainRewardDistributor, "InvalidArrayLength");
        // Attempt to claim when contract is paused
        await multichainRewardDistributor.connect(authority).pause();
        await expect(multichainRewardDistributor.connect(bob).claim(
            1,
            erc721Mock.target,
            currentMerkleRootId,
            [2],
            [],
            proofs[leaves.indexOf(hashedElements[1])]
        )).to.be.revertedWith("Pausable: paused");
    });

    it("Successful claim() execution (ERC1155)", async () => {
        // Merkle root setting
        await multichainRewardDistributor.connect(authority).pause();
        await erc1155Mock.safeTransferFrom(owner.address, multichainRewardDistributor.target, 0, THOUSAND, ethers.ZeroHash);
        const wallets = [alice.address, bob.address];
        const tokenIds = [0, 0];
        const amounts = [THOUSAND / 2n, THOUSAND / 2n];
        const currentMerkleRootId = await multichainRewardDistributor.currentMerkleRootId();
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
        await multichainRewardDistributor.connect(authority).setMerkleRoot(erc1155Mock.target, root);
        await multichainRewardDistributor.connect(authority).unpause();
        // Claim
        const leaves = tree.getHexLeaves();
        const proofs = leaves.map(tree.getHexProof, tree);
        await multichainRewardDistributor.connect(alice).claim(
            2,
            erc1155Mock.target,
            currentMerkleRootId,
            [0],
            [THOUSAND / 2n],
            proofs[leaves.indexOf(hashedElements[0])]
        );
        expect(await erc1155Mock.balanceOf(alice.address, 0)).to.equal(THOUSAND / 2n);
        // Attempt to claim again
        await expect(multichainRewardDistributor.connect(alice).claim(
            2,
            erc1155Mock.target,
            currentMerkleRootId,
            [0],
            [THOUSAND / 2n],
            proofs[leaves.indexOf(hashedElements[0])]
        )).to.be.revertedWithCustomError(multichainRewardDistributor, "AttemptToClaimAgain");
        // Attempt to claim with invalid proof
        await expect(multichainRewardDistributor.connect(bob).claim(
            2,
            erc1155Mock.target,
            currentMerkleRootId,
            [0],
            [THOUSAND / 2n],
            proofs[leaves.indexOf(hashedElements[0])]
        )).to.be.revertedWithCustomError(multichainRewardDistributor, "InvalidProof");
        // Attempt to claim with invalid array lengths
        await expect(multichainRewardDistributor.connect(bob).claim(
            2,
            erc1155Mock.target,
            currentMerkleRootId,
            [],
            [THOUSAND / 2n],
            proofs[leaves.indexOf(hashedElements[1])]
        )).to.be.revertedWithCustomError(multichainRewardDistributor, "InvalidArrayLength");
        await expect(multichainRewardDistributor.connect(bob).claim(
            2,
            erc1155Mock.target,
            currentMerkleRootId,
            [0],
            [],
            proofs[leaves.indexOf(hashedElements[1])]
        )).to.be.revertedWithCustomError(multichainRewardDistributor, "InvalidArrayLength");
        await expect(multichainRewardDistributor.connect(bob).claim(
            2,
            erc1155Mock.target,
            currentMerkleRootId,
            [0],
            [THOUSAND / 2n, THOUSAND / 2n],
            proofs[leaves.indexOf(hashedElements[1])]
        )).to.be.revertedWithCustomError(multichainRewardDistributor, "InvalidArrayLength");
        // Attempt to claim when contract is paused
        await multichainRewardDistributor.connect(authority).pause();
        await expect(multichainRewardDistributor.connect(bob).claim(
            2,
            erc1155Mock.target,
            currentMerkleRootId,
            [0],
            [THOUSAND / 2n],
            proofs[leaves.indexOf(hashedElements[1])]
        )).to.be.revertedWith("Pausable: paused");
    });

    it("Successful _authorizeUpgrade() execution", async () => {
        // Attempt to upgrade from non-granted to DEFAULT_ADMIN_ROLE
        await expect(multichainRewardDistributor.connect(alice).upgradeTo(erc20Mock.target))
            .to.be.revertedWith(
                `AccessControl: account ${(alice.address).toLowerCase()} is missing role ${await multichainRewardDistributor.DEFAULT_ADMIN_ROLE()}`
            );
        const implementation = await ethers.getContractAt(
            "MultichainRewardDistributorV1", 
            await upgrades.erc1967.getImplementationAddress(multichainRewardDistributor.target)
        );
        // Successful upgrading
        await expect(multichainRewardDistributor.upgradeTo(implementation.target)).to.emit(multichainRewardDistributor, "Upgraded");
    });
});