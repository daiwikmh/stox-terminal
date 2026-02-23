/**
 * LeveragePool contract client — stellar-sdk v13 wrapper.
 *
 * Mirrors the pattern in vault_client.ts: interface + class declaration merging.
 * Types are copied from contracts/packages/leverage_sdk/src/index.ts (generated
 * from the deployed contract at CCI7POVWZ6F6ZGWKI5CQHJ2DPIAJC3RVLQCDUJKINGUQL4NBVEUEB2BM).
 *
 * We cannot import leverage_sdk directly because it depends on
 * @stellar/stellar-sdk@14 while fin/ uses stellar-sdk@13.
 */
import { Buffer } from 'buffer';
import {
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
  AssembledTransaction,
} from 'stellar-sdk/contract';
import type { i128, Option } from 'stellar-sdk/contract';

if (typeof window !== 'undefined') {
  // @ts-ignore
  window.Buffer = window.Buffer || Buffer;
}

// ── Contract address ──────────────────────────────────────────────────────────

export const LEVERAGE_CONTRACT_ID =
  'CCI7POVWZ6F6ZGWKI5CQHJ2DPIAJC3RVLQCDUJKINGUQL4NBVEUEB2BM';

// ── Error table ───────────────────────────────────────────────────────────────

export const Errors = {
  1: { message: 'NotInitialized' },
  2: { message: 'AlreadyInitialized' },
  3: { message: 'Unauthorized' },
  4: { message: 'InsufficientCollateral' },
  5: { message: 'PositionAlreadyOpen' },
  6: { message: 'NoOpenPosition' },
  7: { message: 'UnsupportedCollateral' },
  8: { message: 'InsufficientPool' },
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Position {
  asset_symbol:      string;
  collateral_locked: i128;
  debt_amount:       i128;
  user:              string;
}

// ── Interface (declaration-merged with class below) ───────────────────────────

export interface LeverageClient {
  initialize(
    args: { admin: string },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<Result<void>>>;

  lp_deposit(
    args: { user: string; token: string; amount: i128 },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<Result<void>>>;

  lp_withdraw(
    args: { user: string; token: string; amount: i128 },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<Result<void>>>;

  get_lp_share(
    args: { user: string; token: string },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<i128>>;

  get_position(
    args: { user: string },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<Option<Position>>>;

  close_position(
    args: { user: string; collateral_token: string; pnl: i128 },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<Result<Position>>>;

  get_pool_balance(
    args: { token: string },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<i128>>;

  deposit_collateral(
    args: { user: string; token: string; amount: i128 },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<Result<void>>>;

  withdraw_collateral(
    args: { user: string; token: string; amount: i128 },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<Result<void>>>;

  add_collateral_token(
    args: { token: string },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<Result<void>>>;

  get_collateral_balance(
    args: { user: string; token: string },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<i128>>;

  open_synthetic_position(
    args: {
      user: string;
      asset_symbol: string;
      debt_amount: i128;
      collateral_token: string;
      collateral_locked: i128;
    },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<Result<void>>>;
}

// ── Class (ContractSpec generates method implementations at runtime) ───────────

export class LeverageClient extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([
        'AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACAAAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAEAAAAAAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAAAgAAAAAAAAAMVW5hdXRob3JpemVkAAAAAwAAAAAAAAAWSW5zdWZmaWNpZW50Q29sbGF0ZXJhbAAAAAAABAAAAAAAAAATUG9zaXRpb25BbHJlYWR5T3BlbgAAAAAFAAAAAAAAAA5Ob09wZW5Qb3NpdGlvbgAAAAAABgAAAAAAAAAVVW5zdXBwb3J0ZWRDb2xsYXRlcmFsAAAAAAAABwAAAAAAAAAQSW5zdWZmaWNpZW50UG9vbAAAAAg=',
        'AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABgAAAAAAAAAAAAAABUFkbWluAAAAAAAAAQAAAAAAAAATU3VwcG9ydGVkQ29sbGF0ZXJhbAAAAAABAAAAEwAAAAEAAAAAAAAAClVzZXJNYXJnaW4AAAAAAAIAAAATAAAAEwAAAAEAAAAAAAAAC1Bvb2xCYWxhbmNlAAAAAAEAAAATAAAAAQAAAAAAAAAITFBTaGFyZXMAAAACAAAAEwAAABMAAAABAAAAAAAAAAhQb3NpdGlvbgAAAAEAAAAT',
        'AAAAAQAAAAAAAAAAAAAACFBvc2l0aW9uAAAABAAAAEpIdW1hbi1yZWFkYWJsZSBzeW1ib2wgb2YgdGhlIHN5bnRoZXRpYyBhc3NldCwgZS5nLiBgc3ltYm9sX3Nob3J0ISgiWExNIilgLgAAAAAADGFzc2V0X3N5bWJvbAAAABEAAAA4QW1vdW50IG9mIGNvbGxhdGVyYWwgbG9ja2VkIHdoaWxlIHRoaXMgcG9zaXRpb24gaXMgb3Blbi4AAAARY29sbGF0ZXJhbF9sb2NrZWQAAAAAAAALAAAAO05vdGlvbmFsIGRlYnQgdGhlIHVzZXIgaGFzIHRha2VuIG9uIChzY2FsZWQgdG8gNyBkZWNpbWFscykuAAAAAAtkZWJ0X2Ftb3VudAAAAAALAAAAIFRoZSB1c2VyIHdobyBvd25zIHRoaXMgcG9zaXRpb24uAAAABHVzZXIAAAAT',
        'AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAQAAA+kAAAACAAAAAw==',
        'AAAAAAAAAEFMUCBkZXBvc2l0cyB0byB0aGUgc2hhcmVkIHBvb2wuIEluY3JlbWVudHMgTFBTaGFyZXModXNlciwgdG9rZW4pLgAAAAAAAApscF9kZXBvc2l0AAAAAAADAAAAAAAAAAR1c2VyAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAD6QAAAAIAAAAD',
        'AAAAAAAAAFVMUCB3aXRoZHJhd3MgZnJvbSB0aGUgc2hhcmVkIHBvb2wuIEJsb2NrZWQgaWYgTFAgc2hhcmVzIG9yIHBvb2wgYmFsYW5jZSBpbnN1ZmZpY2llbnQuAAAAAAAAC2xwX3dpdGhkcmF3AAAAAAMAAAAAAAAABHVzZXIAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAPpAAAAAgAAAAM=',
        'AAAAAAAAAC5MUCBzaGFyZSBhbW91bnQgZm9yIGEgc3BlY2lmaWMgdXNlciBhbmQgdG9rZW4uAAAAAAAMZ2V0X2xwX3NoYXJlAAAAAgAAAAAAAAAEdXNlcgAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAL',
        'AAAAAAAAAAAAAAAMZ2V0X3Bvc2l0aW9uAAAAAQAAAAAAAAAEdXNlcgAAABMAAAABAAAD6AAAB9AAAAAIUG9zaXRpb24=',
        'AAAAAAAAAYFBZG1pbi1vbmx5LiBTZXR0bGVzIFBuTCBkaXJlY3RseSBhZ2FpbnN0IHRoZSBMUCBwb29sIGFuZCByZWxlYXNlcyBjb2xsYXRlcmFsLgoKLSBwbmwgPiAwOiBwb29sIHBheXMgdGhlIHdpbm5lciDigJQgUG9vbEJhbGFuY2UgLT0gcG5sLCBVc2VyTWFyZ2luICs9IGNvbGxhdGVyYWwgKyBwbmwKLSBwbmwgPCAwOiBwb29sIGdhaW5zIGZyb20gdGhlIGxvc2VyIOKAlCBQb29sQmFsYW5jZSArPSB8cG5sfCwgVXNlck1hcmdpbiArPSBjb2xsYXRlcmFsIC0gfHBubHwKLSBwbmwgPSAwOiBVc2VyTWFyZ2luICs9IGNvbGxhdGVyYWwgKG5vIHBvb2wgaW1wYWN0KQoKUmV0dXJucyBgSW5zdWZmaWNpZW50UG9vbGAgaWYgdGhlIHBvb2wgY2Fubm90IGNvdmVyIGEgd2lubmluZyBwYXlvdXQuAAAAAAAADmNsb3NlX3Bvc2l0aW9uAAAAAAADAAAAAAAAAAR1c2VyAAAAEwAAAAAAAAAQY29sbGF0ZXJhbF90b2tlbgAAABMAAAAAAAAAA3BubAAAAAALAAAAAQAAA+kAAAfQAAAACFBvc2l0aW9uAAAAAw==',
        'AAAAAAAAACJUb3RhbCBMUCBwb29sIGJhbGFuY2UgZm9yIGEgdG9rZW4uAAAAAAAQZ2V0X3Bvb2xfYmFsYW5jZQAAAAEAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAL',
        'AAAAAAAAAERVc2VyIGRlcG9zaXRzIG1hcmdpbiAoY29sbGF0ZXJhbCkgdG8gYmFjayB0aGVpciBsZXZlcmFnZWQgcG9zaXRpb25zLgAAABJkZXBvc2l0X2NvbGxhdGVyYWwAAAAAAAMAAAAAAAAABHVzZXIAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAPpAAAAAgAAAAM=',
        'AAAAAAAAAD1Vc2VyIHdpdGhkcmF3cyBmcmVlIG1hcmdpbi4gQmxvY2tlZCB3aGlsZSBhIHBvc2l0aW9uIGlzIG9wZW4uAAAAAAAAE3dpdGhkcmF3X2NvbGxhdGVyYWwAAAAAAwAAAAAAAAAEdXNlcgAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAQAAA+kAAAACAAAAAw==',
        'AAAAAAAAAD5BZG1pbi1vbmx5OiBhbGxvdyBhIHRva2VuIHRvIGJlIHVzZWQgYXMgY29sbGF0ZXJhbCAvIExQIHRva2VuLgAAAAAAFGFkZF9jb2xsYXRlcmFsX3Rva2VuAAAAAQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAA+kAAAACAAAAAw==',
        'AAAAAAAAADZGcmVlIG1hcmdpbiBiYWxhbmNlIGZvciBhIHVzZXIgKGFsaWFzIGZvciBVc2VyTWFyZ2luKS4AAAAAABZnZXRfY29sbGF0ZXJhbF9iYWxhbmNlAAAAAAACAAAAAAAAAAR1c2VyAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAs=',
        'AAAAAAAAAMNDYWxsZWQgYnkgdGhlIEdvIG1hdGNoaW5nIGVuZ2luZSBhZnRlciBvZmYtY2hhaW4gb3JkZXIgbWF0Y2hpbmcuCkxvY2tzIGBjb2xsYXRlcmFsX2xvY2tlZGAgZnJvbSB0aGUgdXNlcidzIGZyZWUgbWFyZ2luIGFuZCByZWNvcmRzIHRoZQpQb3NpdGlvbiBvbi1jaGFpbiBmb3IgdHJhbnNwYXJlbmN5IGFuZCBsaXF1aWRhdGlvbiB0cmFja2luZy4AAAAAF29wZW5fc3ludGhldGljX3Bvc2l0aW9uAAAAAAUAAAAAAAAABHVzZXIAAAATAAAAAAAAAAxhc3NldF9zeW1ib2wAAAARAAAAAAAAAAtkZWJ0X2Ftb3VudAAAAAALAAAAAAAAABBjb2xsYXRlcmFsX3Rva2VuAAAAEwAAAAAAAAARY29sbGF0ZXJhbF9sb2NrZWQAAAAAAAALAAAAAQAAA+kAAAACAAAAAw==',
      ]),
      options,
    );
  }
}
