// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract ERC721Mock is ERC721 {
    constructor() ERC721("Mock", "MOCK") {
        for (uint256 i = 1; i < 10; i++) {
            _safeMint(msg.sender, i);
        }
    }
}