// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";

contract AC is ERC20, Ownable {
    bool public isTradingOpen;

    bool public isTaxedOnBuy;
    bool public isTaxedOnSell;
    bool public isTaxedOnTransfer;

    address public wethAddress;
    address public treasuryAddress;
    address public constant burnAddress =
        address(0x000000000000000000000000000000000000dEaD);

    IUniswapV2Router02 public uniswapRouter;
    address public uniswapPair;

    uint256 public constant MAX_SUPPLY = 10000000000e18;
    uint256 private swapThreshold = 0.01 ether; // The contract will only handle tax, once the fee tokens reach the specified threshold

    // track tax allocation
    uint256 public liquidityTokens;
    uint256 public treasuryTokens;

    enum TxnType {
        BUY,
        SELL,
        TRANSFER
    }

    mapping(TxnType => uint256) totalTax;
    mapping(TxnType => uint256) liquidityFee;
    mapping(TxnType => uint256) treasuryFee;

    mapping(address => bool) private isExcludedFromFee;

    constructor(
        uint256 _buyLiquidityFee,
        uint256 _buyTreasuryFee,
        uint256 _sellLiquidityFee,
        uint256 _sellTreasuryFee,
        uint256 _transferLiquidityFee,
        uint256 _transferTreasuryFee,
        address _uniswapRouterAddress,
        address _treasuryAddress,
        address _WETHAddress
    ) ERC20("ACToken", "AC") {
        // initialize tax fee
        liquidityFee[TxnType.BUY] = _buyLiquidityFee;
        treasuryFee[TxnType.BUY] = _buyTreasuryFee;
        totalTax[TxnType.BUY] =
            liquidityFee[TxnType.BUY] +
            treasuryFee[TxnType.BUY];

        liquidityFee[TxnType.SELL] = _sellLiquidityFee;
        treasuryFee[TxnType.SELL] = _sellTreasuryFee;
        totalTax[TxnType.SELL] =
            liquidityFee[TxnType.SELL] +
            treasuryFee[TxnType.SELL];

        liquidityFee[TxnType.TRANSFER] = _transferLiquidityFee;
        treasuryFee[TxnType.TRANSFER] = _transferTreasuryFee;
        totalTax[TxnType.TRANSFER] =
            liquidityFee[TxnType.TRANSFER] +
            treasuryFee[TxnType.TRANSFER];

        _mint(owner(), MAX_SUPPLY); // mint all supply to owner, initialize totalSupply

        uniswapRouter = IUniswapV2Router02(
            _uniswapRouterAddress // use default value for testnet/mainnet
        );
        uniswapPair = IUniswapV2Factory(uniswapRouter.factory()).createPair(
            address(this),
            _WETHAddress
        ); // use Uniswap's WETH value for testnet/mainnet

        wethAddress = _WETHAddress;
        treasuryAddress = _treasuryAddress;

        // set addressed to be excluded
        isExcludedFromFee[owner()] = true;
        isExcludedFromFee[address(this)] = true;
        isExcludedFromFee[_uniswapRouterAddress] = true;
        isExcludedFromFee[treasuryAddress] = true;

        // initialize tax true
        isTaxedOnBuy = true;
        isTaxedOnSell = true;
        isTaxedOnTransfer = true;
    }

    function _transfer(
        address from,
        address to,
        uint256 value
    ) internal virtual override {
        require(from != address(0), "Cannot transfer from 0 wallet");
        if (!isTradingOpen) {
            require(isExcludedFromFee[from], "Trading not yet open");
        }
        console.log(
            "Check addresses",
            isExcludedFromFee[from] || isExcludedFromFee[to]
        );
        if (isExcludedFromFee[from] || isExcludedFromFee[to]) {
            super._transfer(from, to, value);
        } else {
            TxnType txnType; // check txn type
            if (from == uniswapPair) {
                txnType = TxnType.BUY;
            } else if (to == uniswapPair) {
                txnType = TxnType.SELL;
            } else {
                txnType = TxnType.TRANSFER;
            }

            // tax calculation
            uint256 basedAmount = value / 100;

            uint256 lpTax;
            uint256 treasuryTax;
            if (
                (txnType == TxnType.BUY && isTaxedOnBuy) ||
                (txnType == TxnType.SELL && isTaxedOnSell) ||
                (txnType == TxnType.TRANSFER && isTaxedOnTransfer)
            ) {
                lpTax = basedAmount * liquidityFee[txnType];
                treasuryTax = basedAmount * treasuryFee[txnType];
            }

            uint256 totalTaxTokens = lpTax + treasuryTax;
            console.log("Tax:", totalTaxTokens);

            // transfer tax to contract
            if (totalTaxTokens > 0) {
                super._transfer(from, address(this), totalTaxTokens);
                liquidityTokens += lpTax;
                treasuryTokens += treasuryTax;
                console.log("ERC20 Tax bal:", liquidityTokens + treasuryTokens);
                console.log("ERC20 bal:", balanceOf((address(this))));
            }

            // trigger distribute tax on sell transaction, check if treshold is met

            if (txnType == TxnType.SELL) {
                address[] memory sellPath = new address[](2);
                sellPath[0] = address(this);
                sellPath[1] = wethAddress;

                uint256 startETHBalance = address(this).balance;

                // get ETH amount for tax tokens
                uint256 ethValue = uniswapRouter.getAmountsOut(
                    liquidityTokens + treasuryTokens,
                    sellPath
                )[1];

                console.log("Eth Value of Bal:", ethValue);
                console.log("Dist?:", ethValue >= swapThreshold);

                if (ethValue >= swapThreshold) {
                    console.log("swap");
                    uint256 toSell = liquidityTokens / 2 + treasuryTokens;
                    console.log("toSell: ", toSell);
                    _approve(address(this), address(uniswapRouter), toSell); // approve allowance
                    console.log(
                        "allowance 1: ",
                        allowance(address(this), address(uniswapRouter))
                    );

                    uniswapRouter.swapExactTokensForETHSupportingFeeOnTransferTokens(
                        toSell,
                        0, // slippage is unavoidable
                        sellPath,
                        address(this),
                        block.timestamp
                    ); // swap tax tokens to eth

                    uint256 ethGained = address(this).balance - startETHBalance;
                    console.log("Eth Gained:", ethGained);
                    console.log("Eth Bal:", address(this).balance);

                    uint256 contractTokenBalance = liquidityTokens + treasuryTokens;
                    uint256 tokenForLP = liquidityTokens / 2;
                    /* calculate percentage of tax allocation
                     multiply by 10^18 to make sure numerator is greater than denominator
                     because uint division, normalize by dividing it again, alt: safemath */
                    uint256 liquidityETH = (ethGained *
                        (((liquidityTokens / 2) * 10 ** 18) / contractTokenBalance)) / 10 ** 18;
                    uint256 treasuryETH = (ethGained *
                        ((treasuryTokens * 10 ** 18) / contractTokenBalance)) / 10 ** 18;

                    // approve of transfer this balance
                    _approve(address(this), address(uniswapRouter), tokenForLP);

                    console.log(
                        "ERC20 bal before Add LP:",
                        balanceOf((address(this)))
                    );
                    console.log(
                        "allowance lp token to add: ",
                        allowance(address(this), address(uniswapRouter))
                    );
                    console.log("Liquidity ETH:", liquidityETH);
                    console.log("Liquidity AC:", tokenForLP);

                    // add LP
                    uniswapRouter.addLiquidityETH{ 
                        value: liquidityETH
                    }(
                        address(this),
                        tokenForLP,
                        0,
                        0,
                        burnAddress,
                        block.timestamp
                    );

                    console.log(
                        "ERC20 bal after dist:",
                        balanceOf((address(this)))
                    );

                    bool success;
                    console.log("treasury ETH:", treasuryETH);
                    // send treasury ETH
                    (success, ) = payable(treasuryAddress).call{
                        value: treasuryETH
                    }("");

                    console.log("success:", success);

                    // reset tracker
                    if (success) {
                        liquidityTokens = 0;
                        treasuryTokens = 0;
                    }
                }
            }

            uint256 taxedAmount = value - totalTaxTokens;
            console.log("Taxed amt:", taxedAmount);
            console.log("Taxed amt valid:", taxedAmount < value);
            super._transfer(from, to, taxedAmount);
        }
    }

    // owner function
    function openTrading() external onlyOwner {
        isTradingOpen = true;
    }

    function setTreasuryAddress(
        address _newTreasuryAddress
    ) external onlyOwner {
        treasuryAddress = _newTreasuryAddress;
    }

    function toggleIsTaxedOnBuy() external onlyOwner {
        isTaxedOnBuy = !isTaxedOnBuy;
    }

    function toggleIsTaxedOnSell() external onlyOwner {
        isTaxedOnSell = !isTaxedOnSell;
    }

    function toggleIsTaxedOnTransfer() external onlyOwner {
        isTaxedOnTransfer = !isTaxedOnTransfer;
    }

    function withdrawAll(address _to) external onlyOwner {
        transfer(_to, balanceOf(address(this)));

        (bool success, ) = payable(_to).call{value: (address(this).balance)}(
            ""
        );
        require(success, "Transfer ETH failed");
    }

    // contract must be able to receive eth
    receive() external payable {}
}
