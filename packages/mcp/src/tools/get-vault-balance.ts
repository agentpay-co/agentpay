/**
 * get_vault_balance MCP tool
 *
 * Reads vault account state via Soroban RPC (view-only).
 * Returns balance information for a given address.
 */

import {
  Contract,
  rpc as SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  Address,
  scValToNative,
} from '@stellar/stellar-sdk';
import { McpToolError, withRpcTimeout, isNetworkError, toErrorContent } from '../tool-error.js';

export const getVaultBalanceSchema = {
  name: 'get_vault_balance',
  description: 'Get vault balance and state for a Stellar address',
  inputSchema: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'Stellar address to check vault balance for',
      },
    },
    required: ['address'],
  },
};

interface VaultBalance {
  address: string;
  balance_usdc: number;
  locked_usdc: number;
  available_usdc: number;
  vault_exists: boolean;
}

export async function getVaultBalanceHandler(
  args: Record<string, unknown>,
  config: {
    soroban_rpc_url: string;
    network_passphrase: string;
    vault_contract_id: string;
    usdc_sac: string;
  },
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const { address } = args;

    if (typeof address !== 'string' || address.trim() === '') {
      throw new McpToolError('INVALID_PARAMS', 'address must be a non-empty string');
    }

    if (!config.vault_contract_id || config.vault_contract_id.trim() === '') {
      throw new McpToolError('NOT_CONFIGURED', 'Vault contract ID not configured');
    }

    if (!config.usdc_sac || config.usdc_sac.trim() === '') {
      throw new McpToolError('NOT_CONFIGURED', 'USDC SAC address not configured');
    }

    const stellarAddress = address.trim();

    // Validate Stellar address format
    try {
      new Address(stellarAddress);
    } catch {
      throw new McpToolError('INVALID_PARAMS', 'Invalid Stellar address format');
    }

    const server = new SorobanRpc.Server(config.soroban_rpc_url, { allowHttp: false });
    const contract = new Contract(config.vault_contract_id);

    const usdcAsset = new Address(config.usdc_sac).toScVal();
    const STROOPS_PER_USDC = 10_000_000;

    try {
      // get_balance(user, asset) returns the total (available + locked) in stroops.
      const account = await withRpcTimeout(server.getAccount(stellarAddress), 'getAccount');
      const balanceTx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: config.network_passphrase,
      })
        .addOperation(
          contract.call('get_balance', new Address(stellarAddress).toScVal(), usdcAsset),
        )
        .setTimeout(300)
        .build();

      const simulation = await withRpcTimeout(
        server.simulateTransaction(balanceTx),
        'simulateTransaction',
      );

      if (SorobanRpc.Api.isSimulationError(simulation)) {
        // Simulation failed - could be various reasons, propagate the error
        throw new Error(`Contract simulation failed: ${simulation.error || 'Unknown error'}`);
      }

      const balanceStroops = scValToNative(simulation.result!.retval);
      const balanceUsdc = Number(balanceStroops) / STROOPS_PER_USDC;

      // get_available(user, asset) returns the unlocked balance; locked is the remainder.
      let availableUsdc = balanceUsdc;
      const availableTx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: config.network_passphrase,
      })
        .addOperation(
          contract.call('get_available', new Address(stellarAddress).toScVal(), usdcAsset),
        )
        .setTimeout(300)
        .build();

      const availableSimulation = await withRpcTimeout(
        server.simulateTransaction(availableTx),
        'simulateTransaction',
      );
      if (!SorobanRpc.Api.isSimulationError(availableSimulation)) {
        const availableStroops = scValToNative(availableSimulation.result!.retval);
        availableUsdc = Number(availableStroops) / STROOPS_PER_USDC;
      }

      const result: VaultBalance = {
        address: stellarAddress,
        balance_usdc: balanceUsdc,
        locked_usdc: Math.max(0, balanceUsdc - availableUsdc),
        available_usdc: availableUsdc,
        vault_exists: true,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (contractError) {
      // Handle contract-specific errors or RPC failures
      if (contractError instanceof Error && contractError.message.includes('simulation failed')) {
        // This could indicate the vault doesn't exist for this address
        const result: VaultBalance = {
          address: stellarAddress,
          balance_usdc: 0,
          locked_usdc: 0,
          available_usdc: 0,
          vault_exists: false,
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

      // For other errors, propagate them
      throw contractError;
    }
  } catch (error) {
    if (isNetworkError(error)) {
      return toErrorContent(
        'get_vault_balance',
        new McpToolError(
          'RPC_UNREACHABLE',
          `Soroban RPC at ${config.soroban_rpc_url} is unreachable`,
          true,
        ),
        { address: args.address },
      );
    }
    return toErrorContent('get_vault_balance', error, { address: args.address });
  }
}
