/**
 * LeveragePool contract client.
 * Adapted from contracts/packages/leverage_sdk/src/index.ts.
 * Only change: @stellar/stellar-sdk → stellar-sdk.
 */
import { Buffer } from 'buffer';
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from 'stellar-sdk/contract';
import type { i128, Option } from 'stellar-sdk/contract';

if (typeof window !== 'undefined') {
  // @ts-ignore
  window.Buffer = window.Buffer || Buffer;
}

export const LEVERAGE_CONTRACT_ID = 'CCNF3JMO7MO5PSR7AS4GT3DKZU7MLDN5WS2ML7RWOGMGPLXTT7HXRY7L';

export const Errors = {
  1: { message: 'NotInitialized' },
  2: { message: 'AlreadyInitialized' },
  3: { message: 'Unauthorized' },
  4: { message: 'InsufficientCollateral' },
  5: { message: 'PositionAlreadyOpen' },
  6: { message: 'NoOpenPosition' },
  7: { message: 'UnsupportedCollateral' },
};

export interface Position {
  asset_symbol: string;
  collateral_locked: i128;
  debt_amount: i128;
  user: string;
}

export interface LeverageClient {
  deposit_collateral(
    args: { user: string; token: string; amount: i128 },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<Result<void>>>;

  withdraw_collateral(
    args: { user: string; token: string; amount: i128 },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<Result<void>>>;

  get_collateral_balance(
    args: { user: string; token: string },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<i128>>;

  get_position(
    args: { user: string },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<Option<Position>>>;
}

export class LeverageClient extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([
        'AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABwAAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAEAAAAAAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAAAgAAAAAAAAAMVW5hdXRob3JpemVkAAAAAwAAAAAAAAAWSW5zdWZmaWNpZW50Q29sbGF0ZXJhbAAAAAAABAAAAAAAAAATUG9zaXRpb25BbHJlYWR5T3BlbgAAAAAFAAAAAAAAAA5Ob09wZW5Qb3NpdGlvbgAAAAAABgAAAAAAAAAVVW5zdXBwb3J0ZWRDb2xsYXRlcmFsAAAAAAAABw==',
        'AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABAAAAAAAAAAAAAAABUFkbWluAAAAAAAAAQAAAAAAAAATU3VwcG9ydGVkQ29sbGF0ZXJhbAAAAAABAAAAEwAAAAEAAAAAAAAAEUNvbGxhdGVyYWxCYWxhbmNlAAAAAAAAAgAAABMAAAATAAAAAQAAAAAAAAAIUG9zaXRpb24AAAABAAAAEw==',
        'AAAAAQAAAAAAAAAAAAAACFBvc2l0aW9uAAAABAAAAEpIdW1hbi1yZWFkYWJsZSBzeW1ib2wgb2YgdGhlIHN5bnRoZXRpYyBhc3NldCwgZS5nLiBgc3ltYm9sX3Nob3J0ISgiWExNIilgLgAAAAAADGFzc2V0X3N5bWJvbAAAABEAAAA+QW1vdW50IG9mIGNvbGxhdGVyYWwgdG9rZW4gbG9ja2VkIHdoaWxlIHRoaXMgcG9zaXRpb24gaXMgb3Blbi4AAAAAABFjb2xsYXRlcmFsX2xvY2tlZAAAAAAAAAsAAACGTm90aW9uYWwgZGVidCB0aGUgdXNlciBoYXMgdGFrZW4gb24gKHNjYWxlZCB0byA3IGRlY2ltYWxzKS4KRm9yIGEgMTDDlyBsZXZlcmFnZWQgcG9zaXRpb24gd2l0aCAxMDAgVVNEQyBjb2xsYXRlcmFsIHRoaXMgd291bGQgYmUgMTAwMC4AAAAAAAtkZWJ0X2Ftb3VudAAAAAALAAAAIFRoZSB1c2VyIHdobyBvd25zIHRoaXMgcG9zaXRpb24uAAAABHVzZXIAAAAT',
        'AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAQAAA+kAAAACAAAAAw==',
        'AAAAAAAAAAAAAAAMZ2V0X3Bvc2l0aW9uAAAAAQAAAAAAAAAEdXNlcgAAABMAAAABAAAD6AAAB9AAAAAIUG9zaXRpb24=',
        'AAAAAAAAAJJBZG1pbi1vbmx5LiBSZWxlYXNlcyBsb2NrZWQgY29sbGF0ZXJhbCBiYWNrIHRvIGZyZWUgcG9vbCBhbmQgcmVtb3ZlcyB0aGUKcG9zaXRpb24gcmVjb3JkLiBDYWxsIHRoaXMgQUZURVIgQWdlbnRWYXVsdC5zZXR0bGVfcG5sIGhhcyBoYW5kbGVkIG1vbmV5LgAAAAAADmNsb3NlX3Bvc2l0aW9uAAAAAAACAAAAAAAAAAR1c2VyAAAAEwAAAAAAAAAQY29sbGF0ZXJhbF90b2tlbgAAABMAAAABAAAD6QAAB9AAAAAIUG9zaXRpb24AAAAD',
        'AAAAAAAAAAAAAAASZGVwb3NpdF9jb2xsYXRlcmFsAAAAAAADAAAAAAAAAAR1c2VyAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAD6QAAAAIAAAAD',
        'AAAAAAAAAAAAAAATd2l0aGRyYXdfY29sbGF0ZXJhbAAAAAADAAAAAAAAAAR1c2VyAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAD6QAAAAIAAAAD',
        'AAAAAAAAADNBZG1pbi1vbmx5OiBhbGxvdyBhIHRva2VuIHRvIGJlIHVzZWQgYXMgY29sbGF0ZXJhbC4AAAAAFGFkZF9jb2xsYXRlcmFsX3Rva2VuAAAAAQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAA+kAAAACAAAAAw==',
        'AAAAAAAAAAAAAAAWZ2V0X2NvbGxhdGVyYWxfYmFsYW5jZQAAAAAAAgAAAAAAAAAEdXNlcgAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAL',
        'AAAAAAAAAM9DYWxsZWQgYnkgdGhlIEdvIG1hdGNoaW5nIGVuZ2luZSBhZnRlciBvZmYtY2hhaW4gb3JkZXIgbWF0Y2hpbmcuCkxvY2tzIGBjb2xsYXRlcmFsX2xvY2tlZGAgZnJvbSB0aGUgdXNlcidzIGZyZWUgY29sbGF0ZXJhbCBiYWxhbmNlIGFuZApyZWNvcmRzIHRoZSBQb3NpdGlvbiBvbi1jaGFpbiBmb3IgdHJhbnNwYXJlbmN5IGFuZCBsaXF1aWRhdGlvbiB0cmFja2luZy4AAAAAF29wZW5fc3ludGhldGljX3Bvc2l0aW9uAAAAAAUAAAAAAAAABHVzZXIAAAATAAAAAAAAAAxhc3NldF9zeW1ib2wAAAARAAAAAAAAAAtkZWJ0X2Ftb3VudAAAAAALAAAAAAAAABBjb2xsYXRlcmFsX3Rva2VuAAAAEwAAAAAAAAARY29sbGF0ZXJhbF9sb2NrZWQAAAAAAAALAAAAAQAAA+kAAAACAAAAAw==',
      ]),
      options,
    );
  }
}
