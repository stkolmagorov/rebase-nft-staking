// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";

interface IMultichainRewardDistributorV1 {
    enum TokenType { ERC20, ERC721, ERC1155 }

    error InvalidArrayLength();
    error AttemptToClaimAgain();
    error InvalidProof();

    event EyeUpdated(address indexed oldEye, address indexed newEye);
    event MerkleRootSet(bytes32 indexed merkleRoot, address indexed token, uint256 indexed merkleRootId);
    event ERC20RewardProvided(address indexed token, uint256 indexed amount);
    event ERC721RewardProvided(address indexed token, uint256[] indexed tokenIds);
    event ERC1155RewardProvided(address indexed token, uint256[] indexed tokenIds, uint256[] indexed amounts);
    event Claimed(address account, address indexed token, uint256[] indexed ids, uint256[] indexed amounts);

    /// @notice Initializes the contract.
    /// @param eye_ eYe token contract address.
    /// @param authority_ Authorised address.
    function initialize(address eye_, address authority_) external;

    /// @notice Updated eYe token contract address.
    /// @param eye_ New eYe token contract address.
    function updateEye(address eye_) external;

    /// @notice Sets the root of the Merkle tree.
    /// @dev The contract should be paused for safe settlements.
    /// @param token_ Token contract address.
    /// @param merkleRoot_ Merkle tree root.
    function setMerkleRoot(address token_, bytes32 merkleRoot_) external;

    /// @notice Pauses the contract.
    function pause() external;

    /// @notice Unauses the contract.
    function unpause() external;

    /// @notice Provides reward in ERC20 tokens.
    /// @param token_ Token contract address.
    /// @param amount_ Reward amount to transfer.
    function provideERC20Reward(IERC20Upgradeable token_, uint256 amount_) external;

    /// @notice Provides reward in ERC721 tokens.
    /// @param token_ Token contract address.
    /// @param tokenIds_ Token ids to transfer.
    function provideERC721Reward(IERC721Upgradeable token_, uint256[] calldata tokenIds_) external;

    /// @notice Provides reward in ERC1155 tokens.
    /// @param token_ Token contract address.
    /// @param tokenIds_ Token ids to transfer.
    /// @param amounts_ Amounts of tokens to transfer.
    function provideERC1155Reward(
        IERC1155Upgradeable token_, 
        uint256[] calldata tokenIds_, 
        uint256[] calldata amounts_
    ) 
        external;

    /// @notice Transfers rewards.
    /// @dev The contract should be unpaused.
    /// @param tokenType_ Token type enum (ERC20, ERC721 or ERC1155).
    /// @param token_ Token contract address.
    /// @param merkleRootId_ Merkle root id.
    /// @param tokenIds_ Token ids that belong to callee.
    /// @param amounts_ Amount of tokens that belongs to callee.
    /// @param merkleProof_ Merkle proof.
    function claim(
        TokenType tokenType_,
        address token_, 
        uint256 merkleRootId_,
        uint256[] calldata tokenIds_,
        uint256[] calldata amounts_,
        bytes32[] calldata merkleProof_
    ) 
        external;

    /// @notice Retrieves the current _merkleRootId value.
    /// @return Current _merkleRootId value.
    function currentMerkleRootId() external view returns (uint256);
}