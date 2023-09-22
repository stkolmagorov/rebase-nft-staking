require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-ethers");
require("@openzeppelin/hardhat-upgrades");
require("dotenv").config();
const { REPORT_GAS, TESTNET_PRIVATE_KEY, MAINNET_PRIVATE_KEY, API_KEY } = process.env;

module.exports = {
    solidity: {
        version: "0.8.20",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200
            },
            evmVersion: "paris"
        }
    },
    networks: {
        hardhat: {
            forking: {
                url: "https://rpc.ankr.com/eth",
                blockNumber: 18018067
            }
        },
        sepolia: {
            url: "https://rpc.ankr.com/eth_sepolia",
            accounts: [TESTNET_PRIVATE_KEY]
        },
        binance_testnet: {
            url: "https://rpc.ankr.com/bsc_testnet_chapel",
            accounts: [TESTNET_PRIVATE_KEY]
        },
        ethereum: {
            url: "https://rpc.ankr.com/eth",
            accounts: [MAINNET_PRIVATE_KEY]
        },
        binance: {
            url: "https://rpc.ankr.com/bsc",
            accounts: [MAINNET_PRIVATE_KEY]
        },
        era: {
            url: "https://rpc.ankr.com/zksync_era",
            accounts: [MAINNET_PRIVATE_KEY]
        },
        base: {
            url: "https://rpc.ankr.com/base",
            accounts: [MAINNET_PRIVATE_KEY]
        },
        arbitrum: {
            url: "https://rpc.ankr.com/arbitrum",
            accounts: [MAINNET_PRIVATE_KEY]
        },
        polygon: {
            url: "https://polygon-rpc.com",
            accounts: [MAINNET_PRIVATE_KEY]
        },
        optimism: {
            url: "https://rpc.ankr.com/optimism",
            accounts: [MAINNET_PRIVATE_KEY]
        }
    },
    gasReporter: {
        enabled: REPORT_GAS === "true" ? true : false,
        currency: "USD"
    },
    etherscan: {
        apiKey: API_KEY
    }
};
