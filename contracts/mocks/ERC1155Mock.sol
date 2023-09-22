// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract ERC1155Mock is ERC1155 {
    constructor() ERC1155("Mock") {
        for (uint256 i = 0; i < 10; i++) {
            _mint(msg.sender, i, 1_000_000_000 ether, "");
        }
    }
}