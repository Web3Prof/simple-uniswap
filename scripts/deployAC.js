const { ethers } = require("hardhat");
const WETH9 = require("../WETH9.json");
const ethernal = require('hardhat-ethernal');

const factoryArtifact = require('@uniswap/v2-core/build/UniswapV2Factory.json')
const routerArtifact = require('@uniswap/v2-periphery/build/UniswapV2Router02.json')
const pairArtifact = require('@uniswap/v2-periphery/build/IUniswapV2Pair.json')

async function main() {
    // reset local network state
    await network.provider.request({
        method: "hardhat_reset",
        params: []
    });

    const [owner, treasury, trader1, trader2] = await ethers.getSigners();

    // deploy token and factory
    const WETHFactory = await ethers.getContractFactory(WETH9.abi, WETH9.bytecode, owner);
    const WETH = await WETHFactory.deploy();
    const WETHAddress = await WETH.getAddress();
    console.log("WETH Address: ", WETHAddress);


    const Factory = await ethers.getContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, owner);
    const factory = await Factory.deploy(owner.address);
    const factoryAddress = await factory.getAddress();
    console.log("Factory Address: ", factoryAddress);


    const RouterFactory = await ethers.getContractFactory(routerArtifact.abi, routerArtifact.bytecode, owner);
    const Router = await RouterFactory.deploy(factoryAddress, WETHAddress);
    const RouterAddress = await Router.getAddress();
    console.log("Router Address: ", RouterAddress);
    console.log();


    console.log("ERC20 Deployment");
    const ACFactory = await ethers.getContractFactory('AC', owner);
    const AC = await ACFactory.deploy(2,1,3,2,2,1,RouterAddress, treasury.address, WETHAddress);
    const ACAddress = await AC.getAddress();
    const ACDecimal = await AC.decimals();
    console.log("AC Address: ", ACAddress);
    console.log("AC Owner: ", await AC.owner());
    console.log("AC Decimals:", ACDecimal)

    // ethernal push contract

    await hre.ethernal.push({
        name: 'WETH',
        address: WETHAddress,
    });

    await hre.ethernal.push({
        name: 'UniswapV2Factory',
        address: factoryAddress,
    });

    await hre.ethernal.push({
        name: 'UniswapV2Router',
        address: RouterAddress,
    });

    await hre.ethernal.push({
        name: 'AC',
        address: ACAddress,
    });


    console.log();

    console.log("Owner's AC Balance: ", await AC.balanceOf(owner.address));
    console.log();

    console.log("AC/WETH Pair");
    const pairAddress = await factory.getPair(ACAddress, WETHAddress);
    console.log("AC/WETH Pair Address: ", pairAddress);


    await hre.ethernal.push({
        name: 'UniswapV2Pair',
        address: pairAddress,
    });


    const pair = await ethers.getContractAt(pairArtifact.abi, pairAddress, owner);
    let reserves = await pair.getReserves();
    console.log("AC/WETH Pair Reserves: ", reserves);
    let ACPrice = 0;

    const isToken0AC = reserves[0].address == ACAddress;
    console.log("Token 0 is " + (isToken0AC ? "AC and Token 1 is WETH" : "WETH and Token 1 is AC"));
    console.log();

    const deadAddress = "0x000000000000000000000000000000000000dEaD";
    console.log("LP Token balance: ", await pair.balanceOf(deadAddress));
    console.log();

    console.log("Add LP ETH");

    const totalSupply = await AC.totalSupply();
    const initialACLP = totalSupply * BigInt(50) / BigInt(100); // set x% for LP, use bigint for precise calc
    // add initial liquidity, approve router allowance
    await AC.approve(RouterAddress, initialACLP.toString());

    const initialETHLP = "2000";
    const approvalWETH = await WETH.approve(RouterAddress, ethers.parseEther(initialETHLP));
    approvalWETH.wait();

    let token0Amt = initialACLP.toString();
    let token1Amt = ethers.parseEther(initialETHLP);

    let deadline = Math.floor(Date.now() / 1000 + (60 * 1)); // unix timestamp of current + 2 min
    const addLiquidityTxn = await Router.connect(owner).addLiquidityETH(
        ACAddress,
        token0Amt,
        BigInt(Math.floor(Number(token0Amt) * 99 / 100)), // safety slippage 1%
        BigInt(Math.floor(Number(token1Amt) * 99 / 100)),
        deadAddress, // burn LP
        deadline,
        { gasLimit: '1000000', value: token1Amt }
    );

    addLiquidityTxn.wait();

    reserves = await pair.getReserves();
    console.log("Reserves after adding liquidity: ", reserves);
    console.log("LP Token balance after adding liquidity: ", await (pair.balanceOf(deadAddress))); // check LP token balance
    console.log();

    console.log(isToken0AC ? (ethers.formatEther(reserves[1]) + " / " + ethers.formatUnits(reserves[0], ACDecimal)) : (ethers.formatEther(reserves[0]) + " / " + ethers.formatUnits(reserves[1], ACDecimal)));
    ACPrice = isToken0AC ? (ethers.formatEther(reserves[1]) / ethers.formatUnits(reserves[0], ACDecimal)) : (ethers.formatEther(reserves[0]) / ethers.formatUnits(reserves[1], ACDecimal));
    console.log("AC/WETH:", ACPrice);
    console.log();

    console.log("Check Balance");
    console.log("=============");

    console.log("Dead Address ETH Balance:", ethers.formatUnits(await ethers.provider.getBalance(deadAddress)));
    console.log("Dead Address AC Balance:", ethers.formatUnits((await AC.balanceOf(deadAddress)), ACDecimal));
    
    console.log("AC Contract AC Balance:", ethers.formatUnits((await AC.balanceOf(ACAddress)), ACDecimal));
    console.log();

    console.log("Trader1 AC Balance:", ethers.formatUnits((await AC.balanceOf(trader1.address)).toString(), ACDecimal));
    console.log("Trader1 ETH Balance:", ethers.formatUnits(await ethers.provider.getBalance(trader1.address)));
    console.log();

    console.log("Owner/Dev AC Balance:", ethers.formatUnits((await AC.balanceOf(owner.address)), ACDecimal));
    console.log("Owner/Dev ETH Balance:", ethers.formatEther(await ethers.provider.getBalance(owner.address)));
    console.log();

    console.log("Treasury ETH Balance:", ethers.formatEther(await ethers.provider.getBalance(treasury.address)));
    
    console.log();

    console.log("Open Trading");
    await AC.openTrading();
    console.log("Pair Address:", await AC.uniswapPair());
    console.log();

    console.log("Buy Txn 1");
    console.log();
    console.log("Balance before buy trade");
    console.log("========================");
    console.log("AC Contract AC Balance:", ethers.formatUnits((await AC.balanceOf(ACAddress)), ACDecimal));
    console.log();

    console.log("Trader1 AC Balance:", ethers.formatUnits((await AC.balanceOf(trader1.address)).toString(), ACDecimal));
    console.log("Trader1 ETH Balance:", ethers.formatUnits(await ethers.provider.getBalance(trader1.address)));
    console.log();

    console.log("Owner/Dev AC Balance:", ethers.formatUnits((await AC.balanceOf(owner.address)), ACDecimal));
    console.log("Owner/Dev ETH Balance:", ethers.formatEther(await ethers.provider.getBalance(owner.address)));
    console.log();

    console.log("Treasury ETH Balance:", ethers.formatEther(await ethers.provider.getBalance(treasury.address)));
    
    console.log();

   
    // Buy 1
    try {
        const deadline = Math.floor(Date.now() / 1000 + (60 * 2)); // unix timestamp of current + 1 min
        const ETHAmountIn = "0.5";
        const estAmountOut = (await Router.getAmountsOut(ethers.parseEther(ETHAmountIn), [WETHAddress, ACAddress]))[1];
        console.log("Estimated AC received for " + ETHAmountIn + "ETH", ethers.formatUnits(estAmountOut, ACDecimal));

        const buyTx = await Router.connect(trader1).swapExactETHForTokens(estAmountOut * BigInt(95) / BigInt(100), [WETHAddress, ACAddress], trader1, deadline, { value: ethers.parseEther(ETHAmountIn) });
        buyTx.wait();

        reserves = await pair.getReserves();
        console.log("Reserves after swapping: ", reserves);
        ACPrice = isToken0AC ? (ethers.formatEther(reserves[1]) / ethers.formatUnits(reserves[0], ACDecimal)) : (ethers.formatEther(reserves[0]) / ethers.formatUnits(reserves[1], ACDecimal));
        console.log("AC/WETH:", ACPrice);
        console.log();

        console.log("Balance after buy trade");
        console.log("========================");

        console.log("AC Contract AC Balance:", ethers.formatUnits((await AC.balanceOf(ACAddress)), ACDecimal));
        console.log();

        console.log("Trader1 AC Balance:", ethers.formatUnits((await AC.balanceOf(trader1.address)).toString(), ACDecimal));
        console.log("Trader1 ETH Balance:", ethers.formatUnits(await ethers.provider.getBalance(trader1.address)));
        console.log();

        console.log("Owner/Dev AC Balance:", ethers.formatUnits((await AC.balanceOf(owner.address)), ACDecimal));
        console.log("Owner/Dev ETH Balance:", ethers.formatEther(await ethers.provider.getBalance(owner.address)));
        console.log();

        console.log("Treasury ETH Balance:", ethers.formatEther(await ethers.provider.getBalance(treasury.address)));
        
        console.log();

    }
    catch (e) {
        console.log(e);
    }

    let contractACBalanceWorth = (await Router.getAmountsOut(await AC.balanceOf(ACAddress), [ACAddress, WETHAddress]))[1];
    console.log("Check worth of AC contract token balance: ", ethers.formatEther(contractACBalanceWorth));
    console.log("Treasury tokens:", ethers.formatUnits(await AC.treasuryTokens(), ACDecimal));
    console.log("Liquidity tokens:", ethers.formatUnits(await AC.liquidityTokens(), ACDecimal));

    console.log();
    
    // Add LP 2
    try {
        console.log("Add LP ETH second");
        console.log("==================");

        // insufficient amount is usually caused by slippage after price impact
        const secondETHLP = "0.02"; // LP
        const secondApprovalWETH = await WETH.connect(trader1).approve(RouterAddress, ethers.parseEther(secondETHLP));
        secondApprovalWETH.wait();

        // check $AC for xETH
        // const secondACLP = (await Router.getAmountsOut(ethers.parseEther(secondETHLP), [WETHAddress, ACAddress]))[1];
        const secondACLP = Number((secondETHLP)) / ACPrice;

        console.log("Input $AC:", ethers.parseUnits(secondACLP.toString(), ACDecimal)); // input 1:1 amount

        token0Amt = ethers.parseUnits(secondACLP.toString(), ACDecimal);

        // add second liquidity, approve router allowance
        await AC.connect(trader1).approve(RouterAddress, token0Amt);

        token1Amt = ethers.parseEther(secondETHLP);

        deadline = Math.floor(Date.now() / 1000 + (60 * 1)); // unix timestamp of current + 1 min
        const addSecondLiquidityTxn = await Router.connect(trader1).addLiquidityETH(
            ACAddress,
            token0Amt,
            BigInt(Math.floor(Number(token0Amt) * 90 / 100)), // safety slippage 
            BigInt(Math.floor(Number(token1Amt) * 90 / 100)),
            deadAddress, // burn LP
            deadline,
            { gasLimit: '1000000', value: token1Amt }
        );

        addSecondLiquidityTxn.wait();

        reserves = await pair.getReserves();
        console.log("Reserves after adding second liquidity: ", reserves);
        console.log("LP Token balance after adding second liquidity: ", await (pair.balanceOf(deadAddress))); // check LP token balance
        console.log();

        console.log(isToken0AC ? (ethers.formatEther(reserves[1]) + " / " + ethers.formatUnits(reserves[0], ACDecimal)) : (ethers.formatEther(reserves[0]) + " / " + ethers.formatUnits(reserves[1], ACDecimal)));
        ACPrice = isToken0AC ? (ethers.formatEther(reserves[1]) / ethers.formatUnits(reserves[0], ACDecimal)) : (ethers.formatEther(reserves[0]) / ethers.formatUnits(reserves[1], ACDecimal));
        console.log("AC/WETH:", ACPrice);
        console.log();

        console.log("Balance after add second LP");
        console.log("===========================");

        console.log("AC Contract AC Balance:", ethers.formatUnits((await AC.balanceOf(ACAddress)), ACDecimal));
        console.log();

        console.log("Trader1 AC Balance:", ethers.formatUnits((await AC.balanceOf(trader1.address)).toString(), ACDecimal));
        console.log("Trader1 ETH Balance:", ethers.formatUnits(await ethers.provider.getBalance(trader1.address)));
        console.log();

        console.log("Owner/Dev AC Balance:", ethers.formatUnits((await AC.balanceOf(owner.address)), ACDecimal));
        console.log("Owner/Dev ETH Balance:", ethers.formatEther(await ethers.provider.getBalance(owner.address)));
        console.log();

        console.log("Treasury ETH Balance:", ethers.formatEther(await ethers.provider.getBalance(treasury.address)));
        
        console.log("Router AC Allowance of token contract:", await AC.allowance(ACAddress, RouterAddress));
        
        console.log();


    }
    catch (e) {
        console.log(e);
    }

    
    console.log("Sell Txn 1");
    console.log();
    console.log("Balance before sell trade");
    console.log("=========================");
    console.log("AC Contract AC Balance:", ethers.formatUnits((await AC.balanceOf(ACAddress)), ACDecimal));
    console.log();

    console.log("Trader1 AC Balance:", ethers.formatUnits((await AC.balanceOf(trader1.address)).toString(), ACDecimal));
    console.log("Trader1 ETH Balance:", ethers.formatUnits(await ethers.provider.getBalance(trader1.address)));
    console.log();

    console.log("Owner/Dev AC Balance:", ethers.formatUnits((await AC.balanceOf(owner.address)), ACDecimal));
    console.log("Owner/Dev ETH Balance:", ethers.formatEther(await ethers.provider.getBalance(owner.address)));
    console.log();

    console.log("Treasury ETH Balance:", ethers.formatEther(await ethers.provider.getBalance(treasury.address)));
    
    console.log();

    // Sell 1
    try {
        const deadline = Math.floor(Date.now() / 1000 + (60 * 2)); // unix timestamp of current + 1 min
        const ACAmountIn = "50000";

        // approve allowance
        await AC.connect(trader1).approve(RouterAddress, ethers.parseUnits(ACAmountIn, ACDecimal));

        const estAmountOut = (await Router.getAmountsOut(ethers.parseUnits(ACAmountIn, ACDecimal), [ACAddress, WETHAddress]))[1];
        console.log("Estimated ETH received for " + ACAmountIn + "AC", ethers.formatEther(estAmountOut));

        const sellTx = await Router.connect(trader1).swapExactTokensForETHSupportingFeeOnTransferTokens(ethers.parseUnits(ACAmountIn, ACDecimal), estAmountOut * BigInt(90) / BigInt(100), [ACAddress, WETHAddress], trader1, deadline); // slippage 5% for tax
        sellTx.wait();

        reserves = await pair.getReserves();
        console.log("Reserves after swapping: ", reserves);
        ACPrice = isToken0AC ? (ethers.formatEther(reserves[1]) / ethers.formatUnits(reserves[0], ACDecimal)) : (ethers.formatEther(reserves[0]) / ethers.formatUnits(reserves[1], ACDecimal));
        console.log("AC/WETH:", ACPrice);
        console.log();

        console.log("Balance after sell trade");
        console.log("=========================");

        console.log("AC Contract AC Balance:", ethers.formatUnits((await AC.balanceOf(ACAddress)), ACDecimal));
        console.log();

        console.log("Trader1 AC Balance:", ethers.formatUnits((await AC.balanceOf(trader1.address)).toString(), ACDecimal));
        console.log("Trader1 ETH Balance:", ethers.formatUnits(await ethers.provider.getBalance(trader1.address)));
        console.log();

        console.log("Owner/Dev AC Balance:", ethers.formatUnits((await AC.balanceOf(owner.address)), ACDecimal));
        console.log("Owner/Dev ETH Balance:", ethers.formatEther(await ethers.provider.getBalance(owner.address)));
        console.log();

        console.log("Treasury ETH Balance:", ethers.formatEther(await ethers.provider.getBalance(treasury.address)));
        
        console.log();

    }
    catch (e) {
        console.log(e);
    }
    

}

main();