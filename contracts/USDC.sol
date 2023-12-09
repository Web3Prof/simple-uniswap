// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import "@openzeppelin/contracts/access/Ownable.sol";

contract UsdCoin is ERC20, Ownable {
  constructor() ERC20('UsdCoin', 'USDC') {}

  function mint(address to, uint256 amount) public onlyOwner {
    _mint(to, amount);
  }

  function decimals() public pure override returns (uint8) {
    return 6;
	}
}