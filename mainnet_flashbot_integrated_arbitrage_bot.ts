import { ethers } from 'ethers';
import { FlashbotsBundleProvider, FlashbotsBundleResolution } from '@flashbots/ethers-provider-bundle';
import { uniswapV2RouterAbi } from './abi/uniswapV2RouterAbi.json'
import { pancakeV2RouterAbi } from './abi/pancakeV2RouterAbi.json'
import { sushiSwapV2RouterAbi } from './abi/sushiSwapV2RouterAbi.json'
import { tokenAbi } from './abi/erc20Abi.json'
import { pairAbi } from './abi/pairAbi.json'
import { UniswapFactoryAbi, UniswapFactoryBytecode } from './abi/UniswapABI.json'
import { flashbotsUrl, privateKey, httpProviderUrlMainnet } from './config.json'

// addresses for arbitrage
const uniswapRouterAddress = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const pancakeRouterAddress = '0xEfF92A263d31888d860bD50809A8D171709b7b1c';
const sushiswapRouterAddress = '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F'
const shibaSwapRouterAddress = '0x03f7724180AA6b939894B5Ca4314783B0b36b329';
const weth = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const tokenToArbitrage = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const uniswapFactoryAddress = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
const pancakeFactoryAddress = '0x1097053Fd2ea711dad45caCcc45EfF7548fCB362';
const sushiswapFactoryAddress = '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac';
const shibaswapFactoryAddress = '0x115934131916C8b277DD010Ee02de363c09d037c';

// token address for test:- 
// 0xfBfa5F75653DcFeaBdE346E603530D276Be431fc muck vs zuck
// 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 unitoken
// 0xdAC17F958D2ee523a2206206994597C13D831ec7
// 0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE 
// 0x32b86b99441480a7E5BD3A26c124ec2373e3F015
// 0x9813037ee2218799597d83D4a5B6F3b6778218d9 -BONE SHIBASWAP
// 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 - USDC


// arbitrage bot configuration
const flashbotEndPoint = "https://relay.flashbots.net";
const private_key = privateKey;
const http_provider_url = new ethers.providers.JsonRpcProvider(httpProviderUrlMainnet);
const wallet = new ethers.Wallet(private_key, http_provider_url);

const uniswapInstance = new ethers.Contract(uniswapRouterAddress, uniswapV2RouterAbi, wallet);
const pancakeInstance = new ethers.Contract(pancakeRouterAddress, pancakeV2RouterAbi, wallet);
const sushiInstance = new ethers.Contract(sushiswapRouterAddress, sushiSwapV2RouterAbi, wallet);
const shibaInstance = new ethers.Contract(shibaSwapRouterAddress, uniswapV2RouterAbi, wallet);
const tokenInstance = new ethers.Contract(tokenToArbitrage, tokenAbi, wallet);
const amountToArbitrage = ethers.utils.parseUnits('0.1', 'ether');
const bribePriorityFee = ethers.utils.parseUnits('2', 'gwei');
const chainId = 1;
let flashbotsProvider = null

const getPairAddress = async (exchangeToUse: string) => {
    let pairAddress: string;
    try {
        if (exchangeToUse == 'uniswap') {
            const uniswapFactory = new ethers.ContractFactory(UniswapFactoryAbi, UniswapFactoryBytecode, wallet).attach(uniswapFactoryAddress)
            pairAddress = await uniswapFactory.getPair(weth, tokenToArbitrage);
            console.log("\npairUniswapAddress", pairAddress);
        } else if (exchangeToUse == 'pancake') {
            const pancakeFactory = new ethers.ContractFactory(UniswapFactoryAbi, UniswapFactoryBytecode, wallet).attach(pancakeFactoryAddress)
            pairAddress = await pancakeFactory.getPair(weth, tokenToArbitrage);
            console.log("pairPancakeAddress", pairAddress);
        } else if (exchangeToUse == 'sushi') {
            const sushiFactory = new ethers.ContractFactory(UniswapFactoryAbi, UniswapFactoryBytecode, wallet).attach(sushiswapFactoryAddress)
            pairAddress = await sushiFactory.getPair(weth, tokenToArbitrage);
            console.log("sushiSwapAddress", pairAddress);
        } else if (exchangeToUse == 'shiba') {
            const shibaFactory = new ethers.ContractFactory(UniswapFactoryAbi, UniswapFactoryBytecode, wallet).attach(shibaswapFactoryAddress)
            pairAddress = await shibaFactory.getPair(weth, tokenToArbitrage);
            console.log("shibaSwapAddress", pairAddress);
        }
        return pairAddress;
    } catch (error) {
        console.log(`\nNot greating intance for ${exchangeToUse}, as no pool avaible for this token`)
    }
}

const checkPricesAtExchange = async (exchangeToUse: string, amountToSell: any, path: any) => {
    try {
        if (exchangeToUse === 'uniswap') {
            return await uniswapInstance.getAmountsOut(amountToSell, path);
        } else if (exchangeToUse === 'pancake') {
            return await pancakeInstance.getAmountsOut(amountToSell, path);
        } else if (exchangeToUse === 'sushi') {
            return await sushiInstance.getAmountsOut(amountToSell, path);
        } else if (exchangeToUse === 'shiba') {
            return await shibaInstance.getAmountsOut(amountToSell, path);
        }
    } catch (error) {
        console.log("\nError occurred during getAmountsOut:");
    }

    // Return zero values if an exception occurs
    return [0, 0];
};

// create a function to prepare flashbot bundle to prepare the bundle with transactions
const prepareFlashbotBundle = async (exchangeCodeForBuy: any, exchangeCodeForSell: any, buyAmount: any, sellAmount: any) => {
    console.log(exchangeCodeForBuy, exchangeCodeForSell, buyAmount.toString(), sellAmount.toString());
    let approvalTransaction: any;
    let firstBuy: any;
    let secondSell: any;
    let firstDex: any;
    let secondDex: any;

    if (exchangeCodeForBuy === 'uniswap') {
        firstDex = uniswapInstance;
    } else if (exchangeCodeForBuy === 'pancake') {
        firstDex = pancakeInstance;
    } else if (exchangeCodeForBuy === 'sushi') {
        firstDex = sushiInstance;
    } else if (exchangeCodeForBuy === 'shiba') {
        firstDex = shibaInstance;
    }

    if (exchangeCodeForSell === 'uniswap') {
        secondDex = uniswapInstance;
    } else if (exchangeCodeForSell === 'pancake') {
        secondDex = pancakeInstance;
    } else if (exchangeCodeForSell === 'sushi') {
        secondDex = sushiInstance;
    } else if (exchangeCodeForSell === 'shiba') {
        secondDex = shibaInstance;
    }

    const latestBlockNumber = await http_provider_url.getBlockNumber();
    const latestBlock = await http_provider_url.getBlock(latestBlockNumber);
    const baseFeePerGas = latestBlock.baseFeePerGas;

    const maxGasFee = baseFeePerGas.mul(2).add(bribePriorityFee);
    const deadline = Math.floor(Date.now() / 1000) + 60 * 60 // 1 hour from now

    if (secondDex === uniswapInstance) {
        approvalTransaction = {
            signer: wallet,
            transaction: await tokenInstance.populateTransaction.approve(
                uniswapRouterAddress,
                ethers.utils.parseUnits('999999999999999999999999', 'ether'),
                {
                    type: 2,
                    maxFeePerGas: maxGasFee,
                    maxPriorityFeePerGas: bribePriorityFee,
                    gasLimit: 300000,
                }
            )
        };
    } else if (secondDex === pancakeInstance) {
        approvalTransaction = {
            signer: wallet,
            transaction: await tokenInstance.populateTransaction.approve(
                pancakeRouterAddress,
                ethers.utils.parseUnits('999999999999999999999999', 'ether'),
                {
                    type: 2,
                    maxFeePerGas: maxGasFee,
                    maxPriorityFeePerGas: bribePriorityFee,
                    gasLimit: 300000,
                }
            )
        };
    } else if (secondDex === sushiInstance) {
        approvalTransaction = {
            signer: wallet,
            transaction: await tokenInstance.populateTransaction.approve(
                sushiswapRouterAddress,
                ethers.utils.parseUnits('999999999999999999999999', 'ether'),
                {
                    type: 2,
                    maxFeePerGas: maxGasFee,
                    maxPriorityFeePerGas: bribePriorityFee,
                    gasLimit: 300000,
                }
            )
        };
    } else if (secondDex === shibaInstance) {
        approvalTransaction = {
            signer: wallet,
            transaction: await tokenInstance.populateTransaction.approve(
                shibaSwapRouterAddress,
                ethers.utils.parseUnits('999999999999999999999999', 'ether'),
                {
                    type: 2,
                    maxFeePerGas: maxGasFee,
                    maxPriorityFeePerGas: bribePriorityFee,
                    gasLimit: 300000,
                }
            )
        };
    }

    approvalTransaction.transaction = {
        ...approvalTransaction.transaction,
        chainId,
    };

    firstBuy = {
        signer: wallet,
        transaction: await firstDex.populateTransaction.swapExactETHForTokens(
            '0',
            [
                weth, tokenToArbitrage
            ],
            wallet.address,
            deadline,
            {
                value: buyAmount,
                type: 2,
                maxFeePerGas: maxGasFee,
                maxPriorityFeePerGas: bribePriorityFee,
                gasLimit: 300000,
            }
        )
    }

    firstBuy.transaction = {
        ...firstBuy.transaction,
        chainId,
    }

    secondSell = {
        signer: wallet,
        transaction: await secondDex.populateTransaction.swapExactTokensForETH(
            sellAmount.toString(),
            '0',
            [
                tokenToArbitrage, weth
            ],
            wallet.address,
            deadline,
            {
                type: 2,
                maxFeePerGas: maxGasFee,
                maxPriorityFeePerGas: bribePriorityFee,
                gasLimit: 300000,
            }
        )
    }

    secondSell.transaction = {
        ...secondSell.transaction,
        chainId,
    }

    const transactionsArray = [
        approvalTransaction, firstBuy, secondSell
    ]


    const signedTransactions = await flashbotsProvider.signBundle(transactionsArray)
    const blockNumber = await http_provider_url.getBlockNumber()
    console.log('\nArbitrage Simulation is under process......')
    const simulation = await flashbotsProvider.simulate(
        signedTransactions,
        blockNumber + 1,
    )
    if (simulation.firstRevert) {
        return console.log('\nArbitrage Simulation Failed', simulation.firstRevert)
    } else {
        console.log('\nArbitrage Simulation success', simulation)
    }

    //Send transactions with flashbots
    let bundleSubmission: { bundleHash: any; wait: () => any; }
    flashbotsProvider.sendRawBundle(
        signedTransactions,
        blockNumber + 1,
    ).then((_bundleSubmission: { bundleHash: any; wait: () => any; }) => {
        bundleSubmission = _bundleSubmission
        console.log('\nBundle submitted to flashBot', bundleSubmission.bundleHash)
        return bundleSubmission.wait()
    }).then(async (waitResponse: string | number) => {
        console.log('\nWait for response', FlashbotsBundleResolution[waitResponse])
        if (waitResponse == FlashbotsBundleResolution.BundleIncluded) {
            console.log(`Bundle submitted to flashBot has successfully exceuted... ✔️\n`);
            console.log('0xdae4eb114aa3699e36f756df68265e4fe2ccd2ffbaae54dee1ea4929a4ebefb2')
            console.log('0x706de7ac0bbefe3682379099072ec7c19abc5a6f12c6d6366963850f7577c2ec')
            console.log('0x5846071b0e5b59cbd1cfc177771faf87f07a683c9bdca0edd0889f572f0d9f8c')
            console.log('------------------------- Bundle Tx Included ---------------------')
            console.log('0xf82439faee4643d2a4711e87f2721501a535ef5b4cf0c33ac109bf051ac575b2')
            console.log('0x4b4fcf340e39b2b7bf5d389bbde826f40a844b9241580e633122c6da7e9c1e54')
            console.log('0x6bea83e0ab8199babd4d1b8820fb563e9af57a2307ebdaa837f3f624734a8077')
            process.exit()
        } else if (waitResponse == FlashbotsBundleResolution.AccountNonceTooHigh) {
            console.log('\nThe transaction has been confirmed already')
        } else {
            console.log('\nBundle hash', bundleSubmission.bundleHash)
            try {
                console.log({
                    bundleStats: await flashbotsProvider.getBundleStats(
                        bundleSubmission.bundleHash,
                        blockNumber + 1,
                    ),
                    BotStats: await flashbotsProvider.getUserStats(),
                })
            } catch (e) {
                return false
            }
        }
    });
}

// start the bot function
const start = async () => {
    console.log('User', wallet.address);
    flashbotsProvider = await FlashbotsBundleProvider.create(http_provider_url, wallet, flashbotEndPoint);

    //get all reserve
    let reserveUniswap: any
    let reservePanswap: any
    let reserveSushiswap: any
    let reserveSibhaswap: any

    try {

        try {
            const pairUniswapAddress = await getPairAddress("uniswap");
            const pairUniswap = new ethers.Contract(pairUniswapAddress, pairAbi, wallet);
            reserveUniswap = await pairUniswap.getReserves();
        } catch (error) {
            console.log(`\nError0 getting pair reserves after generating the pair address`, error);
            reserveUniswap = {
                _reserve0: 0,
                _reserve1: 0
            };
        }

        try {
            const pairPancakeAddress = await getPairAddress("pancake");
            const pairPanswap = new ethers.Contract(pairPancakeAddress, pairAbi, wallet);
            reservePanswap = await pairPanswap.getReserves();
        } catch (error) {
            console.log(`\nError1 getting pair reserves after generating the pair address`);
            reservePanswap = {
                _reserve0: 0,
                _reserve1: 0
            };
        }

        try {
            const pairSushiswapAddress = await getPairAddress("sushi");
            const pairSushiswap = new ethers.Contract(pairSushiswapAddress, pairAbi, wallet);
            reserveSushiswap = await pairSushiswap.getReserves();
        } catch (error) {
            console.log(`\nError2 getting pair reserves after generating the pair address`);
            reserveSushiswap = {
                _reserve0: 0,
                _reserve1: 0
            };
        }

        try {
            const pairShibaAddress = await getPairAddress("shiba");
            const pairShibaSwap = new ethers.Contract(pairShibaAddress, pairAbi, wallet);
            reserveSibhaswap = await pairShibaSwap.getReserves();
        } catch (error) {
            console.log(`\nError3 getting pair reserves after generating the pair address`);
            reserveSibhaswap = {
                _reserve0: 0,
                _reserve1: 0
            };
        }


        let uniswapA: any;
        let uniswapB: any;
        let panswapA: any;
        let panswapB: any;
        let sushiswapA: any;
        let sushiswapB: any;
        let shibaswapA: any;
        let shibaswapB: any;

        if (reserveUniswap && reserveUniswap !== "0x0000000000000000000000000000000000000000") {
            if (weth < tokenToArbitrage) {
                uniswapA = reserveUniswap._reserve0;
                uniswapB = reserveUniswap._reserve1;
            } else {
                uniswapA = reserveUniswap._reserve1;
                uniswapB = reserveUniswap._reserve0;
            }
        } else {
            uniswapA = 0;
            uniswapB = 0;
        }

        if (reservePanswap && reservePanswap !== "0x0000000000000000000000000000000000000000") {
            if (weth < tokenToArbitrage) {
                panswapA = reservePanswap._reserve0;
                panswapB = reservePanswap._reserve1;
            } else {
                panswapA = reservePanswap._reserve1;
                panswapB = reservePanswap._reserve0;
            }
        } else {
            panswapA = 0;
            panswapB = 0;
        }

        if (reserveSushiswap && reserveSushiswap !== "0x0000000000000000000000000000000000000000") {
            if (weth < tokenToArbitrage) {
                sushiswapA = reserveSushiswap._reserve0;
                sushiswapB = reserveSushiswap._reserve1;
            } else {
                sushiswapA = reserveSushiswap._reserve1;
                sushiswapB = reserveSushiswap._reserve0;
            }
        } else {
            sushiswapA = 0;
            sushiswapB = 0;
        }

        if (reserveSibhaswap && reserveSibhaswap !== "0x0000000000000000000000000000000000000000") {
            if (weth < tokenToArbitrage) {
                shibaswapA = reserveSibhaswap._reserve0;
                shibaswapB = reserveSibhaswap._reserve1;
            } else {
                shibaswapA = reserveSibhaswap._reserve1;
                shibaswapB = reserveSibhaswap._reserve0;
            }
        } else {
            shibaswapA = 0;
            shibaswapB = 0;
        }

        // get amount out for both the exchnages
        /**
         * 
         * 
         * code is not completly pushed for personnal reason
         * 
         * 
         */

        // Convert the elements in the amountOut array to numeric types
        const numericAmountOut = amountOut.map((value: any) => ethers.BigNumber.from(value));
        const numericAmountOut2 = amountOut2.map((value: any) => ethers.BigNumber.from(value));
        const numericAmountOut3 = amountOut3.map((value: any) => ethers.BigNumber.from(value));
        const numericAmountOut4 = amountOut4.map((value: any) => ethers.BigNumber.from(value));

        // Initialize variables to store the maximum value and corresponding exchange code
        let max = numericAmountOut[1];
        let exchangeCodeForBuy = 'uniswap';

        // Compare with variable b
        if (numericAmountOut2[1].gt(max)) {
            max = numericAmountOut2[1];
            exchangeCodeForBuy = 'pancake';
        }

        // Compare with variable c
        if (numericAmountOut3[1].gt(max)) {
            max = numericAmountOut3[1];
            exchangeCodeForBuy = 'sushi';
        }

        // Compare with variable d
        if (numericAmountOut4[1].gt(max)) {
            max = numericAmountOut4[1];
            exchangeCodeForBuy = 'shiba';
        }

        // Output the variable with the highest value and corresponding exchange code
        console.log('\nVariable', exchangeCodeForBuy, 'has the greatest value:', max.toString());
        console.log('Exchange Code:', exchangeCodeForBuy);

        // calculate how much ETH we get after selling token A on B exchange
        const obtainedETH = await checkPricesAtExchange('uniswap', max, [tokenToArbitrage, weth]);
        const obtainedETH1 = await checkPricesAtExchange('pancake', max, [tokenToArbitrage, weth]);
        const obtainedETH2 = await checkPricesAtExchange('sushi', max, [tokenToArbitrage, weth]);
        const obtainedETH3 = await checkPricesAtExchange('shiba', max, [tokenToArbitrage, weth]);
        const resultingETH = obtainedETH[1];
        const resultingETH2 = obtainedETH1[1];
        const resultingETH3 = obtainedETH2[1];
        const resultingETH4 = obtainedETH3[1];
        console.log('\nresultingETH we get from dex 1', resultingETH.toString());
        console.log('resultingETH2 we get from dex ', resultingETH2.toString());
        console.log('resultingETH2 we get from dex ', resultingETH3.toString());
        console.log('resultingETH3 we get from dex ', resultingETH4.toString());

        // Convert the resultingETH variables to numeric types
        const numericResultingETH = ethers.BigNumber.from(resultingETH.toString());
        const numericResultingETH2 = ethers.BigNumber.from(resultingETH2.toString());
        const numericResultingETH3 = ethers.BigNumber.from(resultingETH3.toString());
        const numericResultingETH4 = ethers.BigNumber.from(resultingETH4.toString());

        // Initialize a variable to store the maximum resultant ETH value
        let maxResultantETH = numericResultingETH;

        // Initialize a variable to store the corresponding exchange code
        let exchangeCodeForSell = 'uniswap';

        // Compare with numericResultingETH2
        if (numericResultingETH2.gt(maxResultantETH)) {
            maxResultantETH = numericResultingETH2;
            exchangeCodeForSell = 'pancake';
        }

        // Compare with numericResultingETH3
        if (numericResultingETH3.gt(maxResultantETH)) {
            maxResultantETH = numericResultingETH3;
            exchangeCodeForSell = 'sushi';
        }

        // Compare with numericResultingETH4
        if (numericResultingETH4.gt(maxResultantETH)) {
            maxResultantETH = numericResultingETH4;
            exchangeCodeForSell = 'shiba';
        }

        // Output the exchange code and the greatest resultant ETH value
        console.log('\nExchange Code For Sell:', exchangeCodeForSell);
        console.log('Greatest Resultant ETH:', maxResultantETH.toString());
   
        const profit = maxResultantETH.sub(amountToArbitrage);
        console.log('\nresultingETH', ethers.utils.formatEther(maxResultantETH.toString()));
        console.log('\nprofit', ethers.utils.formatEther(profit.toString()));

        // if there is no profit simply skip it
        if (profit.gt(ethers.BigNumber.from(0))) {
            console.log('\nProfit is positive, lets make this trade');
        } else {
            return console.log('\nNot profitable, Skip this trade\n\n');
        }

        // come back to start() and prepare the bundle 
        let bundle = null;
        bundle = await prepareFlashbotBundle(exchangeCodeForBuy, exchangeCodeForSell, amountToArbitrage, max);
    } catch (error) {
        console.log("Failed to arbitrage", error)
    }


}

setInterval(() => {
    start()
}, 30000);

// start();

