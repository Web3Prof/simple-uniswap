const {ethers} = require("hardhat");
const WETH9 = require("../WETH9.json");

const factoryArtifact = require('@uniswap/v2-core/build/UniswapV2Factory.json')
const routerArtifact = require('@uniswap/v2-periphery/build/UniswapV2Router02.json')
const pairArtifact = require('@uniswap/v2-periphery/build/IUniswapV2Pair.json')

async function main(){
    const [owner] = await ethers.getSigners();

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
    const Router = await  RouterFactory.deploy(factoryAddress, WETHAddress);
    const RouterAddress = await Router.getAddress();
    console.log("Router Address: ", RouterAddress);

   
    const USDCFactory = await ethers.getContractFactory('UsdCoin', owner);
    const USDC = await USDCFactory.deploy();
    const USDCAddress = await USDC.getAddress();
    console.log("USDC Address: ", USDCAddress);


    const ACFactory = await ethers.getContractFactory('AC', owner);
    const AC = await ACFactory.deploy();
    const ACAddress = await AC.getAddress();
    console.log("AC Address: ", ACAddress);
    console.log();

    await USDC.connect(owner).mint(
        owner.address,
        ethers.parseUnits('100000', 6)
    );

    console.log("Owner's USDC Balance: ", await USDC.balanceOf(owner.address));

    await AC.connect(owner).mint(
        owner.address,
        ethers.parseEther('1000')
    );

    console.log("Owner's AC Balance: ", await USDC.balanceOf(owner.address));

    await WETH.deposit({value: ethers.parseUnits("100")});
    console.log("Owner's $WETH Balance: ", ethers.formatEther(await WETH.balanceOf(owner.address)));
    console.log();

    // create AC/USDC
    const createFirstPair = await factory.createPair(ACAddress, USDCAddress);
    await createFirstPair.wait();

    const firstPairAddress = await factory.getPair(ACAddress, USDCAddress);
    console.log("AC/USDC Pair Address: ", firstPairAddress);

    const firstPair = await ethers.getContractAt(pairArtifact.abi, firstPairAddress, owner);
    let firstPairReserves = await firstPair.getReserves();
    console.log("First Pair Reserves: ", firstPairReserves);

    const approvalAC = await AC.approve(RouterAddress, ethers.parseEther("1000"));
    approvalAC.wait();

    const approvalUSDC = await USDC.approve(RouterAddress, ethers.parseUnits("1000", 6));
    approvalUSDC.wait();

    const token0Amt = ethers.parseEther("500");
    const token1Amt = ethers.parseUnits("500", 6);

    const deadline = Math.floor(Date.now()/1000 + (60 * 5)); // unix timestamp of current + 5 min
    const addLiquidityTxn = await Router.connect(owner).addLiquidity(
        ACAddress,
        USDCAddress,
        token0Amt,
        token1Amt,
        1,
        1,
        owner.address,
        deadline,
        {gasLimit: '1000000'}
    );

    addLiquidityTxn.wait();
    const token0Address = await firstPair.token0();
    const isToken0AC = token0Address == ACAddress;
    console.log("Token 0 is " + (isToken0AC ? "AC and Token 1 is USDC" : "USDC and Token 1 is AC"));

    firstPairReserves = await firstPair.getReserves();
    console.log("Reserves after adding liquidity: ", firstPairReserves);
    console.log("AC/USDC: ", isToken0AC ? (ethers.formatUnits(firstPairReserves[1], 6)/ethers.formatEther(firstPairReserves[0])) : ethers.formatUnits(firstPairReserves[0], 6)/(ethers.formatEther(firstPairReserves[1])));

    const USDCAmtIn = '100';
    const estAmountOut = (await Router.getAmountsOut(ethers.parseUnits(USDCAmtIn, 6), [USDCAddress, ACAddress]))[1];
    console.log("Estimated AC received for " + USDCAmtIn + "USDC", ethers.formatEther(estAmountOut));

    await Router.connect(owner).swapExactTokensForTokens(ethers.parseUnits(USDCAmtIn, 6), estAmountOut, [USDCAddress, ACAddress], owner, deadline);
    firstPairReserves = await firstPair.getReserves();
    console.log("Reserves after swapping: ", firstPairReserves);
    console.log("AC/USDC: ", isToken0AC ? (ethers.formatUnits(firstPairReserves[1], 6)/ethers.formatEther(firstPairReserves[0])) : ethers.formatUnits(firstPairReserves[0], 6)/(ethers.formatEther(firstPairReserves[1])));
    

}

main();