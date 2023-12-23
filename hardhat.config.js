require("@nomicfoundation/hardhat-toolbox");
require('hardhat-ethernal');
require('dotenv').config();

const ETHERNAL_API_TOKEN = process.env.ETHERNAL_API_TOKEN ?? "";

module.exports = {
  solidity: "0.8.20",
  networks: {
    localnet: {
      url: "http://127.0.0.1:8545/"
    }
  },
  ethernal: {
    apiToken: ETHERNAL_API_TOKEN,
    workspace: "DEV",
    resetOnStart: "DEV",
    disabled: true
  }
};
