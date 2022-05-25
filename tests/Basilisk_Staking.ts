import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { assert } from "chai";
import fs from "fs";
import {
  createClaimTx,
  createInitializeTx,
  createInitUserPoolTx,
  createStakeNftTx,
  createWithdrawNftTx,
  getGlobalState,
  getUserPoolState,
} from "../lib/scripts";
import { BSK_TOKEN_DECIMAL, BSK_TOKEN_MINT, EPOCH, GLOBAL_AUTHORITY_SEED, NORMAL_REWARD_AMOUNT, STAKING_PROGRAM_ID, UNIQUE_REWARD_AMOUNT } from "../lib/types";
import { airdropSOL, createTokenMint, getAssociatedTokenAccount, getATokenAccountsNeedCreate, getTokenAccountBalance, isExistAccount } from "../lib/utils";
import { BasiliskStaking } from "../target/types/basilisk_staking";

// Configure the client to use the local cluster.
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const payer = provider.wallet;
console.log('Payer: ', payer.publicKey.toBase58());

const program = anchor.workspace.BasiliskStaking as Program<BasiliskStaking>;

let superOwner = null;
let user = null;
let reward = null;
let nft = null;
let stakedTime = null;

describe("Basilisk_Staking Load Program Object & Prepare testers", () => {
  assert(program.programId.toBase58() == STAKING_PROGRAM_ID.toBase58(), "Program load Failure!");

  it('Load Testers', async () => {
    const rawdata = fs.readFileSync(process.env.ANCHOR_WALLET);
    const keyData = JSON.parse(rawdata.toString());
  
    superOwner = anchor.web3.Keypair.fromSecretKey(new Uint8Array(keyData));
    user = anchor.web3.Keypair.generate();

    console.log('Admin: ', superOwner.publicKey.toBase58());
    console.log('User: ', user.publicKey.toBase58());
  });
  it('Load Reward Token', async () => {
    const rawdata = fs.readFileSync('./tests/keys/reward_mint.json');
    const keyData = JSON.parse(rawdata.toString());
    reward = anchor.web3.Keypair.fromSecretKey(new Uint8Array(keyData));
    assert(reward.publicKey.toBase58() == BSK_TOKEN_MINT.toBase58(), 'Load BSK Token Keypair Failure!');

    await createTokenMint(
      provider.connection,
      superOwner,
      reward,
    );

    assert(await isExistAccount(reward.publicKey, provider.connection), 'Create BSK Token mint failure!');
  });
  it('Airdrop SOL for Testers', async () => {
    await airdropSOL(user.publicKey, 1 * 1e9, provider.connection);
    let res = await provider.connection.getBalance(user.publicKey);
    assert(res == 1 * 1e9, 'Airdrop 1 SOL for user Failed');
  });
});

describe('Contract Creation', async () => {
  it('Mint Enough BSK TOken in rewardVault for initializing', async () => {
    const rewardToken = new Token(
      provider.connection,
      BSK_TOKEN_MINT,
      TOKEN_PROGRAM_ID,
      superOwner,
    );
    const [globalAuthority, _] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        STAKING_PROGRAM_ID,
    );
    let {instructions, destinationAccounts} = await getATokenAccountsNeedCreate(
      provider.connection,
      superOwner.publicKey,
      globalAuthority,
      [BSK_TOKEN_MINT],
    );
    let rewardVault = destinationAccounts[0];
    console.log('rewardVault: ', rewardVault.toBase58());

    if (instructions.length > 0) {
      const tx = new anchor.web3.Transaction();
      tx.add(instructions[0]);
      const txId = await anchor.web3.sendAndConfirmTransaction(
        provider.connection,
        tx,
        [superOwner],
      );
      console.log("Tx Hash=", txId);
    }

    assert((await isExistAccount(rewardVault, provider.connection)), 'Create BSK ATA of GlobalAuthority PDA failure!');

    await rewardToken.mintTo(rewardVault, superOwner, [], 1 * BSK_TOKEN_DECIMAL);
    assert((await getTokenAccountBalance(rewardVault, provider.connection)) == 1, 'Testing BSK Token amount is not 1');
  });
  it('Initialize Contract', async () => {
    const tx = await createInitializeTx(
      superOwner.publicKey,
      program as unknown as anchor.Program,
    );
    const txId = await provider.connection.sendTransaction(tx, [superOwner]);
    await provider.connection.confirmTransaction(txId, 'confirmed');
    console.log("TxHash=", txId);

    let globalInfo = await getGlobalState(program as unknown as anchor.Program);
    assert(globalInfo.superAdmin.toBase58() == superOwner.publicKey.toBase58(), "GlobalInfo Admin Address mismatch with SuperOwner Pubkey");
  });
});

describe('Staking Testing', async () => {
  it('Initialize user pool', async () => {
    const tx = await createInitUserPoolTx(
      user.publicKey,
      program as unknown as anchor.Program,
      provider.connection,
    );
    const txId = await provider.connection.sendTransaction(tx, [user]);
    await provider.connection.confirmTransaction(txId, 'confirmed');
    console.log("TxHash=", txId);

    let userPoolInfo = await getUserPoolState(user.publicKey, program as unknown as anchor.Program);
    assert(userPoolInfo.owner.toBase58() == user.publicKey.toBase58(), "UserPoolInfo Owner Address mismatch with User Pubkey");
  });
  it('Create one NFT for testing', async () => {
    nft = await Token.createMint(
      provider.connection,
      superOwner,
      superOwner.publicKey,
      superOwner.publicKey,
      0,
      TOKEN_PROGRAM_ID,
    );
    console.log('NFT Address:', nft.publicKey.toBase58())
    assert(await isExistAccount(nft.publicKey, provider.connection), 'NFT Create Mint Failure');
  });
  it('Mint one NFT in my ATA for testing', async () => {
    const userNFTAccount = await nft.createAssociatedTokenAccount(
      user.publicKey,
    );
    console.log('User NFT Account:', userNFTAccount.toBase58())

    await nft.mintTo(
      userNFTAccount,
      superOwner,
      [],
      1,
    );

    assert((await getTokenAccountBalance(userNFTAccount, provider.connection)) == 1, 'Mint 1 NFT to User ATA failure');
  });
  it('User can stake NFT', async () => {
    const tx = await createStakeNftTx (
      nft.publicKey,
      user.publicKey,
      program as unknown as anchor.Program,
      provider.connection,
      3,
    );
    const txId = await provider.connection.sendTransaction(tx, [user]);
    await provider.connection.confirmTransaction(txId, 'confirmed');
    console.log("TxHash=", txId);

    let userPoolInfo = await getUserPoolState(user.publicKey, program as unknown as anchor.Program);
    console.log("Staked Time", userPoolInfo.staking[0].claimedTime.toNumber());
    stakedTime = userPoolInfo.staking[0].claimedTime.toNumber();
    assert(userPoolInfo.owner.toBase58() == user.publicKey.toBase58(), "UserPDA Owner mismatch with User Pubkey");
    assert(userPoolInfo.stakedCount.toNumber() == 1, "Staked Count is not 1");
    assert(userPoolInfo.staking[0].mint.toBase58() == nft.publicKey.toBase58(), "Staked Mint is not NFT Pubkey");
    assert(userPoolInfo.staking[0].rarity.toNumber() == 3, "Staked NFT Rarity is not 3");
  });
  it('User can claim Reward before locking time', async () => {
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(true);
      }, 4000);
    });
    const tx = await createClaimTx (
      user.publicKey,
      program as unknown as anchor.Program,
      provider.connection,
    );
    const txId = await provider.connection.sendTransaction(tx, [user]);
    await provider.connection.confirmTransaction(txId, 'confirmed');
    console.log("TxHash=", txId);

    let userPoolInfo = await getUserPoolState(user.publicKey, program as unknown as anchor.Program);
    assert(userPoolInfo.owner.toBase58() == user.publicKey.toBase58(), "UserPDA Owner mismatch with User Pubkey");
    assert(userPoolInfo.stakedCount.toNumber() == 1, "Staked Count is not 1");
    
    let userATA = await getAssociatedTokenAccount(user.publicKey, BSK_TOKEN_MINT);
    const reward = await getTokenAccountBalance(userATA, provider.connection);
    const expectedReward = Math.floor((Math.floor(Date.now() / 1000) - stakedTime) / EPOCH) * UNIQUE_REWARD_AMOUNT;
    console.log(expectedReward, reward * BSK_TOKEN_DECIMAL);
    assert(expectedReward - Math.round(reward * BSK_TOKEN_DECIMAL) <= UNIQUE_REWARD_AMOUNT, "Received reward is not expected amount");
  });
  it('User can claim Individual Reward before locking time', async () => {
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(true);
      }, 4000);
    });
    const tx = await createClaimTx (
      user.publicKey,
      program as unknown as anchor.Program,
      provider.connection,
      nft.publicKey,
    );
    const txId = await provider.connection.sendTransaction(tx, [user]);
    await provider.connection.confirmTransaction(txId, 'confirmed');
    console.log("TxHash=", txId);

    let userPoolInfo = await getUserPoolState(user.publicKey, program as unknown as anchor.Program);
    assert(userPoolInfo.owner.toBase58() == user.publicKey.toBase58(), "UserPDA Owner mismatch with User Pubkey");
    assert(userPoolInfo.stakedCount.toNumber() == 1, "Staked Count is not 1");
    
    let userATA = await getAssociatedTokenAccount(user.publicKey, BSK_TOKEN_MINT);
    const reward = await getTokenAccountBalance(userATA, provider.connection);
    const expectedReward = Math.floor((Math.floor(Date.now() / 1000) - stakedTime) / EPOCH) * UNIQUE_REWARD_AMOUNT;
    console.log(expectedReward, reward * BSK_TOKEN_DECIMAL);
    assert(expectedReward - Math.round(reward * BSK_TOKEN_DECIMAL) <= UNIQUE_REWARD_AMOUNT, "Received reward is not expected amount");
  });
  it('User withdraw NFT with reward after locking time', async () => {
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(true);
      }, 4000);
    });
    const tx = await createWithdrawNftTx (
      nft.publicKey,
      user.publicKey,
      program as unknown as anchor.Program,
      provider.connection,
    );
    const txId = await provider.connection.sendTransaction(tx, [user]);
    await provider.connection.confirmTransaction(txId, 'confirmed');
    console.log("TxHash=", txId);

    let userPoolInfo = await getUserPoolState(user.publicKey, program as unknown as anchor.Program);
    assert(userPoolInfo.owner.toBase58() == user.publicKey.toBase58(), "UserPDA Owner mismatch with User Pubkey");
    assert(userPoolInfo.stakedCount.toNumber() == 0, "Staked Count is not 0");
    
    let userATA = await getAssociatedTokenAccount(user.publicKey, BSK_TOKEN_MINT);
    const reward = await getTokenAccountBalance(userATA, provider.connection);
    const expectedReward = Math.floor((Math.floor(Date.now() / 1000) - stakedTime) / EPOCH) * UNIQUE_REWARD_AMOUNT;
    console.log(expectedReward, reward * BSK_TOKEN_DECIMAL);
    assert(expectedReward - Math.round(reward * BSK_TOKEN_DECIMAL) <= UNIQUE_REWARD_AMOUNT, "Received reward is not expected amount");
  });
});