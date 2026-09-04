import { describe, it, expect } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { buildDepositHandler } from './build-deposit.js';
import { buildReleaseHandler } from './build-release.js';
import { getVaultBalanceHandler } from './get-vault-balance.js';

const rpcConfig = {
  soroban_rpc_url: 'https://soroban-testnet.stellar.org',
  network_passphrase: 'Test SDF Network ; September 2015',
  vault_contract_id: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4',
  usdc_sac: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
};

const unconfigured = { ...rpcConfig, vault_contract_id: '', usdc_sac: '' };
const address = Keypair.random().publicKey();

function parseResult(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

describe('RPC tool validation (offline)', () => {
  it('build_deposit reports INVALID_PARAMS without retry', async () => {
    const missing = parseResult(await buildDepositHandler({ address }, rpcConfig));
    expect(missing).toMatchObject({ success: false, code: 'INVALID_PARAMS', retryable: false });

    const badAddress = parseResult(
      await buildDepositHandler({ address: 'NOTAKEY', amount: 1 }, rpcConfig),
    );
    expect(badAddress).toMatchObject({ success: false, code: 'INVALID_PARAMS' });
  });

  it('build_deposit reports NOT_CONFIGURED when contracts are unset', async () => {
    const result = parseResult(await buildDepositHandler({ address, amount: 1 }, unconfigured));
    expect(result).toMatchObject({ success: false, code: 'NOT_CONFIGURED', retryable: false });
  });

  it('build_release reports INVALID_PARAMS without retry', async () => {
    const result = parseResult(
      await buildReleaseHandler(
        { orchestrator_address: address, task_id: '1', step_id: '1' },
        rpcConfig,
      ),
    );
    expect(result).toMatchObject({ success: false, code: 'INVALID_PARAMS', retryable: false });
  });

  it('get_vault_balance reports INVALID_PARAMS and NOT_CONFIGURED', async () => {
    const bad = JSON.parse(
      (await getVaultBalanceHandler({ address: 'NOTAKEY' }, rpcConfig)).content[0].text,
    ) as { error: Record<string, unknown> };
    expect(bad.error).toMatchObject({ code: 'INVALID_PARAMS', retryable: false });

    const unset = JSON.parse(
      (await getVaultBalanceHandler({ address }, unconfigured)).content[0].text,
    ) as { error: Record<string, unknown> };
    expect(unset.error).toMatchObject({ code: 'NOT_CONFIGURED', retryable: false });
  });
});
