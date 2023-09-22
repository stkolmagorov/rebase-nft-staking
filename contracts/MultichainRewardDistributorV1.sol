// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/MerkleProofUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";

import "./interfaces/IMultichainRewardDistributorV1.sol";

contract MultichainRewardDistributorV1 is 
    IMultichainRewardDistributorV1, 
    Initializable,
    UUPSUpgradeable,
    ERC721HolderUpgradeable, 
    ERC1155HolderUpgradeable, 
    PausableUpgradeable, 
    AccessControlUpgradeable
{
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    bytes32 public constant AUTHORITY_ROLE = keccak256("AUTHORITY_ROLE");

    // V1
    uint256 public lastMerkleRootIdForEyeToken;
    address public eye;
    CountersUpgradeable.Counter private _merkleRootId;

    mapping(address => mapping(uint256 => bytes32)) public merkleRootByTokenAndId;
    mapping(address => mapping(bytes32 => bool)) public isClaimedByAccountAndMerkleRoot;

    /// @inheritdoc IMultichainRewardDistributorV1
    function initialize(address eye_, address authority_) external initializer {
        __UUPSUpgradeable_init();
        __ERC721Holder_init();
        __ERC1155Holder_init();
        __Pausable_init();
        __AccessControl_init();
        eye = eye_;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(AUTHORITY_ROLE, authority_);
    }

    /// @inheritdoc IMultichainRewardDistributorV1
    function updateEye(address eye_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit EyeUpdated(eye, eye_);
        eye = eye_;
    }

    /// @inheritdoc IMultichainRewardDistributorV1
    function setMerkleRoot(
        address token_, 
        bytes32 merkleRoot_
    )
        external
        onlyRole(AUTHORITY_ROLE) 
        whenPaused 
    {
        uint256 m_merkleRootId = _merkleRootId.current();
        if (token_ == eye) {
            lastMerkleRootIdForEyeToken = m_merkleRootId;
        }
        merkleRootByTokenAndId[token_][m_merkleRootId] = merkleRoot_;
        _merkleRootId.increment();
        emit MerkleRootSet(merkleRoot_, token_, m_merkleRootId);
    }

    /// @inheritdoc IMultichainRewardDistributorV1
    function pause() external onlyRole(AUTHORITY_ROLE) {
        _pause();
    }

    /// @inheritdoc IMultichainRewardDistributorV1
    function unpause() external onlyRole(AUTHORITY_ROLE) {
        _unpause();
    }

    /// @inheritdoc IMultichainRewardDistributorV1
    function provideERC20Reward(IERC20Upgradeable token_, uint256 amount_) external {
        token_.safeTransferFrom(msg.sender, address(this), amount_);
        emit ERC20RewardProvided(address(token_), amount_);
    }

    /// @inheritdoc IMultichainRewardDistributorV1
    function provideERC721Reward(IERC721Upgradeable token_, uint256[] calldata tokenIds_) external {
        for (uint256 i = 0; i < tokenIds_.length; ) { 
            token_.safeTransferFrom(msg.sender, address(this), tokenIds_[i], "");
            unchecked {
                i++;
            }
        }
        emit ERC721RewardProvided(address(token_), tokenIds_);
    }

    /// @inheritdoc IMultichainRewardDistributorV1
    function provideERC1155Reward(
        IERC1155Upgradeable token_, 
        uint256[] calldata tokenIds_, 
        uint256[] calldata amounts_
    ) 
        external 
    {
        if (tokenIds_.length != amounts_.length) {
            revert InvalidArrayLength();
        }
        for (uint256 i = 0; i < tokenIds_.length; ) { 
            token_.safeTransferFrom(msg.sender, address(this), tokenIds_[i], amounts_[i], "");
            unchecked {
                i++;
            }
        }
        emit ERC1155RewardProvided(address(token_), tokenIds_, amounts_);
    }

    /// @inheritdoc IMultichainRewardDistributorV1
    function claim(
        TokenType tokenType_,
        address token_,
        uint256 merkleRootId_,
        uint256[] calldata tokenIds_,
        uint256[] calldata amounts_,
        bytes32[] calldata merkleProof_
    ) 
        external 
        whenNotPaused
    { 
        if (token_ == eye) {
            merkleRootId_ = lastMerkleRootIdForEyeToken;
        }
        bytes32 merkleRoot = merkleRootByTokenAndId[token_][merkleRootId_];
        if (isClaimedByAccountAndMerkleRoot[msg.sender][merkleRoot]) {
            revert AttemptToClaimAgain();
        }
        bytes32 leaf;
        if (tokenType_ == TokenType.ERC20) {
            if (tokenIds_.length > 0 || amounts_.length != 1) {
                revert InvalidArrayLength();
            }
            leaf = keccak256(
                abi.encodePacked(
                    msg.sender, 
                    token_,
                    amounts_[0],
                    merkleRootId_
                )
            );
        } else if (tokenType_ == TokenType.ERC721) {
            if (tokenIds_.length == 0 || amounts_.length > 0) {
                revert InvalidArrayLength();
            }
            leaf = keccak256(
                abi.encodePacked(
                    msg.sender, 
                    token_,
                    tokenIds_,
                    merkleRootId_
                )
            );
        } else {
            if (tokenIds_.length == 0 || amounts_.length == 0 || tokenIds_.length != amounts_.length) {
                revert InvalidArrayLength();
            }
            leaf = keccak256(
                abi.encodePacked(
                    msg.sender, 
                    token_,
                    tokenIds_,
                    amounts_,
                    merkleRootId_
                )
            );
        }
        if (!MerkleProofUpgradeable.verifyCalldata(merkleProof_, merkleRoot, leaf)) {
            revert InvalidProof();
        }
        isClaimedByAccountAndMerkleRoot[msg.sender][merkleRoot] = true;
        if (tokenType_ == TokenType.ERC20) {
            IERC20Upgradeable(token_).safeTransfer(msg.sender, amounts_[0]);
        } else if (tokenType_ == TokenType.ERC721) {
            for (uint256 i = 0; i < tokenIds_.length; ) {
                IERC721Upgradeable(token_).safeTransferFrom(address(this), msg.sender, tokenIds_[i], "");
                unchecked {
                    i++;
                }
            }
        } else {
            for (uint256 i = 0; i < tokenIds_.length; ) {
                IERC1155Upgradeable(token_).safeTransferFrom(address(this), msg.sender, tokenIds_[i], amounts_[i], "");
                unchecked {
                    i++;
                }
            }
        }
        emit Claimed(msg.sender, token_, tokenIds_, amounts_);
    }

    /// @inheritdoc IMultichainRewardDistributorV1
    function currentMerkleRootId() external view returns (uint256) {
        return _merkleRootId.current();
    }

    /// @inheritdoc IERC165Upgradeable
    function supportsInterface(
        bytes4 interfaceId_
    )
        public
        view
        override(ERC1155ReceiverUpgradeable, AccessControlUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId_);
    }

    /// @inheritdoc UUPSUpgradeable
    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}