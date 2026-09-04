/**
 * build_deposit MCP tool
 *
 * Builds unsigned XDR for a vault deposit transaction.
 * Returns XDR that must be signed by the client's wallet.
 */

import {
  Contract,
  rpc as SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  Address,
  nativeToScVal,
} from '@stellar/stellar-sdk';
import { McpToolError, withRpcTimeout, isNetworkError, type McpErrorCode } from '../tool-error.js';

export const buildDepositSchema = {
  name: 'build_deposit',
  description: 'Build unsigned XDR for a vault deposit transaction',
  inputSchema: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'Stellar address of the depositor',
      },
      amount: {
        type: 'number',
        description: 'Amount to deposit in USDC (decimal)',
        minimum: 0.000001,
      },
      asset: {
        type: 'string',
        description: 'Asset to deposit (currently only "USDC" supported)',
        enum: ['USDC'],
        default: 'USDC',
      },
    },
    required: ['address', 'amount'],
  },
};

interface DepositXdrResult {
  success: boolean;
  xdr?: string;
  transaction_details?: {
    source_account: string;
    amount_usdc: number;
    asset: string;
    contract_id: string;
  };
  error?: string;
  code?: McpErrorCode;
  retryable?: boolean;
}

export async function buildDepositHandler(
  args: Record<string, unknown>,
  config: {
    soroban_rpc_url: string;
    network_passphrase: string;
    vault_contract_id: string;
    usdc_sac: string;
  },
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const { address, amount, asset = 'USDC' } = args;

    // Validate inputs
    if (typeof address !== 'string' || address.trim() === '') {
      throw new McpToolError('INVALID_PARAMS', 'address must be a non-empty string');
    }

    if (typeof amount !== 'number' || amount <= 0) {
      throw new McpToolError('INVALID_PARAMS', 'amount must be a positive number');
    }

    if (asset !== 'USDC') {
      throw new McpToolError('INVALID_PARAMS', 'Only USDC deposits are currently supported');
    }

    if (!config.vault_contract_id || config.vault_contract_id.trim() === '') {
      throw new McpToolError('NOT_CONFIGURED', 'Vault contract ID not configured');
    }

    if (!config.usdc_sac || config.usdc_sac.trim() === '') {
      throw new McpToolError('NOT_CONFIGURED', 'USDC SAC address not configured');
    }

    const stellarAddress = address.trim();
    const amountUsdc = amount as number;

    // Validate Stellar address format
    try {
      new Address(stellarAddress);
    } catch {
      throw new McpToolError('INVALID_PARAMS', 'Invalid Stellar address format');
    }

    // Build unsigned XDR
    const server = new SorobanRpc.Server(config.soroban_rpc_url, { allowHttp: false });
    const account = await withRpcTimeout(server.getAccount(stellarAddress), 'getAccount');
    const contract = new Contract(config.vault_contract_id);

    // Convert USDC to stroops (7 decimal places)
    const STROOPS_PER_USDC = 10_000_000;
    const amountStroops = BigInt(Math.round(amountUsdc * STROOPS_PER_USDC));

    // Build transaction
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: config.network_passphrase,
    })
      .addOperation(
        contract.call(
          'deposit',
          new Address(stellarAddress).toScVal(),
          new Address(config.usdc_sac).toScVal(),
          nativeToScVal(amountStroops, { type: 'i128' }),
        ),
      )
      .setTimeout(300)
      .build();

    // Simulate transaction
    const simulated = await withRpcTimeout(server.simulateTransaction(tx), 'simulateTransaction');
    if (SorobanRpc.Api.isSimulationError(simulated)) {
      throw new McpToolError('CONTRACT_ERROR', `Simulation failed: ${simulated.error}`);
    }

    // Assemble and return unsigned XDR
    const assembledTx = SorobanRpc.assembleTransaction(tx, simulated).build();
    const unsignedXdr = assembledTx.toXDR();

    const result: DepositXdrResult = {
      success: true,
      xdr: unsignedXdr,
      transaction_details: {
        source_account: stellarAddress,
        amount_usdc: amountUsdc,
        asset: 'USDC',
        contract_id: config.vault_contract_id,
      },
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const failure =
      error instanceof McpToolError
        ? error
        : isNetworkError(error)
          ? new McpToolError(
              'RPC_UNREACHABLE',
              `Soroban RPC at ${config.soroban_rpc_url} is unreachable`,
              true,
            )
          : new McpToolError(
              'CONTRACT_ERROR',
              error instanceof Error ? error.message : String(error),
            );
    const result: DepositXdrResult = {
      success: false,
      error: failure.message,
      code: failure.code,
      retryable: failure.retryable,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
}
