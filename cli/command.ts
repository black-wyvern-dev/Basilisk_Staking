#!/usr/bin/env ts-node
import * as dotenv from "dotenv";
import { program } from 'commander';
import { 
    PublicKey,
    LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  initProject,
  getGlobalInfo,
  setClusterConfig,
  getUserPoolInfo,
  getAllNFTs,
  stakeNFT,
  withdrawNft,
  claimReward,
} from "./scripts";

dotenv.config({ path: __dirname+'/../.env' });

program.version('0.0.1');

programCommand('status')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const {
      env,
    } = cmd.opts();
    console.log('Solana config: ', env);
    await setClusterConfig(env);
    console.log(await getGlobalInfo());
});
programCommand('user_status')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .option('-a, --address <string>', 'nft mint pubkey')
  .action(async (directory, cmd) => {
    const {
      env,
      address,
    } = cmd.opts();
    console.log('Solana config: ', env);
    await setClusterConfig(env);
    
    if (address === undefined) {
      console.log("Error Mint input");
      return;
    }
    console.log(await getUserPoolInfo(new PublicKey(address)));
});

programCommand('stake')
  .option('-a, --address <string>', 'nft mint pubkey')
  .option('-r, --rarity <number>', 'nft metadata rarity')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const {
      env,
      address,
      rarity,
    } = cmd.opts();

    console.log('Solana config: ', env);
    await setClusterConfig(env);

    if (address === undefined) {
      console.log("Error Mint input");
      return;
    }
    if (rarity === undefined || isNaN(parseInt(rarity))) {
      console.log("Error NFT Rarity");
      return;
    }
    
    await stakeNFT(new PublicKey(address), parseInt(rarity));
});

programCommand('withdraw')
  .option('-a, --address <string>', 'nft mint pubkey')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const {
      env,
      address,
    } = cmd.opts();

    console.log('Solana config: ', env);
    await setClusterConfig(env);

    if (address === undefined) {
      console.log("Error Mint input");
      return;
    }
    
    await withdrawNft(new PublicKey(address));
});

programCommand('claim_nft')
  .option('-a, --address <string>', 'nft mint pubkey')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const {
      env,
      address,
    } = cmd.opts();

    console.log('Solana config: ', env);
    await setClusterConfig(env);

    if (address === undefined) {
      console.log("Error Mint input");
      return;
    }
    
    await claimReward(new PublicKey(address));
});

programCommand('claim_all')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const {
      env,
    } = cmd.opts();

    console.log('Solana config: ', env);
    await setClusterConfig(env);
    
    await claimReward();
});

programCommand('get_all_stakers')
  .option('-r, --rpc <string>', 'custom rpc url')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const {
      env,
      rpc,
    } = cmd.opts();

    console.log('Solana config: ', env);
    await setClusterConfig(env);

    console.log(await getAllNFTs(rpc));
});

programCommand('init')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const {
      env,
    } = cmd.opts();
    console.log('Solana config: ', env);
    await setClusterConfig(env);

    await initProject();
});

function programCommand(name: string) {
  return program
    .command(name)
    .option(
      '-e, --env <string>',
      'Solana cluster env name',
      'devnet', //mainnet-beta, testnet, devnet
    )
}

program.parse(process.argv);
