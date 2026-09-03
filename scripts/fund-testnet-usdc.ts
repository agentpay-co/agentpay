/**
 * Funds the orchestrator wallet with testnet USDC by swapping XLM via the
 * Stellar testnet DEX (path payment).  No browser required.
 *
 * The orchestrator receives 9999 XLM from Stellar friendbot during
 * setup-wallets.ts; this script converts ~15 XLM into 15 USDC which is
 * enough to distribute to all agent wallets via distribute-usdc.ts.
 */
import {
  Keypair,
  Asset,
  TransactionBuilder,
  Operation,
  Networks,
  BASE_FEE,
  Horizon,
} from '@stellar/stellar-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const USDC = new Asset('USDC', USDC_ISSUER);
const server = new Horizon.Server(HORIZON_URL);

const TARGET_USDC = 15; // enough for distribute-usdc.ts (10 USDC) plus buffer

async function getUSDCBalance(publicKey: string): Promise<number> {
  const account = await server.loadAccount(publicKey);
  const bal = account.balances.find(
    (b: any) => b.asset_code === 'USDC' && b.asset_issuer === USDC_ISSUER,
  ) as any;
  return parseFloat(bal?.balance ?? '0');
}

async function main() {
  const walletsPath = path.join(__dirname, '..', 'wallets.json');
  if (!fs.existsSync(walletsPath)) {
    console.error('wallets.json not found. Run: npx tsx scripts/setup-wallets.ts first.');
    process.exit(1);
  }

  const wallets = JSON.parse(fs.readFileSync(walletsPath, 'utf-8'));
  const keypair = Keypair.fromSecret(wallets.orchestrator.secretKey);
  const publicKey = keypair.publicKey();

  const currentBalance = await getUSDCBalance(publicKey);
  console.log(`Orchestrator: ${publicKey}`);
  console.log(`Current USDC balance: ${currentBalance.toFixed(7)}`);

  if (currentBalance >= TARGET_USDC) {
    console.log(`✓ Already has ${currentBalance} USDC (target: ${TARGET_USDC}). Nothing to do.`);
    return;
  }

  const needed = TARGET_USDC - currentBalance;
  console.log(`Swapping XLM → ${needed} USDC via testnet DEX path payment…`);

  // Send at most 3× the needed USDC worth of XLM (generous slippage for testnet liquidity)
  const sendMaxXlm = String(Math.ceil(needed * 3));

  const account = await server.loadAccount(publicKey);
  const tx = new TransactionBuilder(account, {
    fee: String(BASE_FEE * 2),
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.pathPaymentStrictReceive({
        sendAsset: Asset.native(),
        sendMax: sendMaxXlm,
        destination: publicKey,
        destAsset: USDC,
        destAmount: String(needed),
        path: [],
      }),
    )
    .setTimeout(30)
    .build();

  tx.sign(keypair);

  try {
    const result = await server.submitTransaction(tx);
    const after = await getUSDCBalance(publicKey);
    console.log(`✓ Swap succeeded — tx: ${result.hash}`);
    console.log(`  New USDC balance: ${after.toFixed(7)}`);
    console.log('\nRun next: npx tsx scripts/distribute-usdc.ts');
  } catch (err: any) {
    const codes = err?.response?.data?.extras?.result_codes;
    if (codes) {
      console.error('✗ Transaction failed:', JSON.stringify(codes));
      console.error(
        'This usually means there is no XLM/USDC liquidity on the testnet DEX right now.',
      );
      console.error(
        'Fallback: go to https://faucet.circle.com → Stellar Testnet → paste your orchestrator address:',
      );
      console.error(`  ${publicKey}`);
    } else {
      console.error('✗ Error:', err.message ?? err);
    }
    process.exit(1);
  }
}

main().catch(console.error);
