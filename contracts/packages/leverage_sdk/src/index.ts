import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CABMAGG3RY463HQFYYUYAD5BQS7EG6G3K7D4Q6EZUZXSGH5BOJDZ3ZUM",
  }
} as const

export const Errors = {
  1: {message:"NotInitialized"},
  2: {message:"AlreadyInitialized"},
  3: {message:"Unauthorized"},
  4: {message:"InsufficientCollateral"},
  5: {message:"PositionAlreadyOpen"},
  6: {message:"NoOpenPosition"},
  7: {message:"UnsupportedCollateral"},
  8: {message:"InsufficientPool"}
}

export type DataKey = {tag: "Admin", values: void} | {tag: "SupportedCollateral", values: readonly [string]} | {tag: "UserMargin", values: readonly [string, string]} | {tag: "PoolBalance", values: readonly [string]} | {tag: "LPShares", values: readonly [string, string]} | {tag: "Position", values: readonly [string]};


export interface Position {
  /**
 * Human-readable symbol of the synthetic asset, e.g. `symbol_short!("XLM")`.
 */
asset_symbol: string;
  /**
 * Amount of collateral locked while this position is open.
 */
collateral_locked: i128;
  /**
 * Notional debt the user has taken on (scaled to 7 decimals).
 */
debt_amount: i128;
  /**
 * The user who owns this position.
 */
user: string;
}

export interface Client {
  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin}: {admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a lp_deposit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * LP deposits to the shared pool. Increments LPShares(user, token).
   */
  lp_deposit: ({user, token, amount}: {user: string, token: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a lp_withdraw transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * LP withdraws from the shared pool. Blocked if LP shares or pool balance insufficient.
   */
  lp_withdraw: ({user, token, amount}: {user: string, token: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_lp_share transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * LP share amount for a specific user and token.
   */
  get_lp_share: ({user, token}: {user: string, token: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_position transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_position: ({user}: {user: string}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Position>>>

  /**
   * Construct and simulate a close_position transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * User-callable. Settles PnL directly against the LP pool and releases collateral.
   * The caller provides the signed PnL (computed off-chain from the oracle close price).
   * 
   * - pnl > 0: pool pays the winner — PoolBalance -= pnl, UserMargin += collateral + pnl
   * - pnl < 0: pool gains from the loser — PoolBalance += |pnl|, UserMargin += collateral - |pnl|
   * - pnl = 0: UserMargin += collateral (no pool impact)
   * 
   * Returns `InsufficientPool` if the pool cannot cover a winning payout.
   */
  close_position: ({user, collateral_token, pnl}: {user: string, collateral_token: string, pnl: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Position>>>

  /**
   * Construct and simulate a get_pool_balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Total LP pool balance for a token.
   */
  get_pool_balance: ({token}: {token: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a deposit_collateral transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * User deposits margin (collateral) to back their leveraged positions.
   */
  deposit_collateral: ({user, token, amount}: {user: string, token: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a withdraw_collateral transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * User withdraws free margin. Blocked while a position is open.
   */
  withdraw_collateral: ({user, token, amount}: {user: string, token: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a add_collateral_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Admin-only: allow a token to be used as collateral / LP token.
   */
  add_collateral_token: ({token}: {token: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_collateral_balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Free margin balance for a user (alias for UserMargin).
   */
  get_collateral_balance: ({user, token}: {user: string, token: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a open_synthetic_position transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Called by the user from the frontend after computing economics off-chain.
   * Locks `collateral_locked` from the user's free margin and records the
   * Position on-chain for transparency and liquidation tracking.
   */
  open_synthetic_position: ({user, asset_symbol, debt_amount, collateral_token, collateral_locked}: {user: string, asset_symbol: string, debt_amount: i128, collateral_token: string, collateral_locked: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACAAAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAEAAAAAAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAAAgAAAAAAAAAMVW5hdXRob3JpemVkAAAAAwAAAAAAAAAWSW5zdWZmaWNpZW50Q29sbGF0ZXJhbAAAAAAABAAAAAAAAAATUG9zaXRpb25BbHJlYWR5T3BlbgAAAAAFAAAAAAAAAA5Ob09wZW5Qb3NpdGlvbgAAAAAABgAAAAAAAAAVVW5zdXBwb3J0ZWRDb2xsYXRlcmFsAAAAAAAABwAAAAAAAAAQSW5zdWZmaWNpZW50UG9vbAAAAAg=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABgAAAAAAAAAAAAAABUFkbWluAAAAAAAAAQAAAAAAAAATU3VwcG9ydGVkQ29sbGF0ZXJhbAAAAAABAAAAEwAAAAEAAAAAAAAAClVzZXJNYXJnaW4AAAAAAAIAAAATAAAAEwAAAAEAAAAAAAAAC1Bvb2xCYWxhbmNlAAAAAAEAAAATAAAAAQAAAAAAAAAITFBTaGFyZXMAAAACAAAAEwAAABMAAAABAAAAAAAAAAhQb3NpdGlvbgAAAAEAAAAT",
        "AAAAAQAAAAAAAAAAAAAACFBvc2l0aW9uAAAABAAAAEpIdW1hbi1yZWFkYWJsZSBzeW1ib2wgb2YgdGhlIHN5bnRoZXRpYyBhc3NldCwgZS5nLiBgc3ltYm9sX3Nob3J0ISgiWExNIilgLgAAAAAADGFzc2V0X3N5bWJvbAAAABEAAAA4QW1vdW50IG9mIGNvbGxhdGVyYWwgbG9ja2VkIHdoaWxlIHRoaXMgcG9zaXRpb24gaXMgb3Blbi4AAAARY29sbGF0ZXJhbF9sb2NrZWQAAAAAAAALAAAAO05vdGlvbmFsIGRlYnQgdGhlIHVzZXIgaGFzIHRha2VuIG9uIChzY2FsZWQgdG8gNyBkZWNpbWFscykuAAAAAAtkZWJ0X2Ftb3VudAAAAAALAAAAIFRoZSB1c2VyIHdobyBvd25zIHRoaXMgcG9zaXRpb24uAAAABHVzZXIAAAAT",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAEFMUCBkZXBvc2l0cyB0byB0aGUgc2hhcmVkIHBvb2wuIEluY3JlbWVudHMgTFBTaGFyZXModXNlciwgdG9rZW4pLgAAAAAAAApscF9kZXBvc2l0AAAAAAADAAAAAAAAAAR1c2VyAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAFVMUCB3aXRoZHJhd3MgZnJvbSB0aGUgc2hhcmVkIHBvb2wuIEJsb2NrZWQgaWYgTFAgc2hhcmVzIG9yIHBvb2wgYmFsYW5jZSBpbnN1ZmZpY2llbnQuAAAAAAAAC2xwX3dpdGhkcmF3AAAAAAMAAAAAAAAABHVzZXIAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAC5MUCBzaGFyZSBhbW91bnQgZm9yIGEgc3BlY2lmaWMgdXNlciBhbmQgdG9rZW4uAAAAAAAMZ2V0X2xwX3NoYXJlAAAAAgAAAAAAAAAEdXNlcgAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAL",
        "AAAAAAAAAAAAAAAMZ2V0X3Bvc2l0aW9uAAAAAQAAAAAAAAAEdXNlcgAAABMAAAABAAAD6AAAB9AAAAAIUG9zaXRpb24=",
        "AAAAAAAAAdlVc2VyLWNhbGxhYmxlLiBTZXR0bGVzIFBuTCBkaXJlY3RseSBhZ2FpbnN0IHRoZSBMUCBwb29sIGFuZCByZWxlYXNlcyBjb2xsYXRlcmFsLgpUaGUgY2FsbGVyIHByb3ZpZGVzIHRoZSBzaWduZWQgUG5MIChjb21wdXRlZCBvZmYtY2hhaW4gZnJvbSB0aGUgb3JhY2xlIGNsb3NlIHByaWNlKS4KCi0gcG5sID4gMDogcG9vbCBwYXlzIHRoZSB3aW5uZXIg4oCUIFBvb2xCYWxhbmNlIC09IHBubCwgVXNlck1hcmdpbiArPSBjb2xsYXRlcmFsICsgcG5sCi0gcG5sIDwgMDogcG9vbCBnYWlucyBmcm9tIHRoZSBsb3NlciDigJQgUG9vbEJhbGFuY2UgKz0gfHBubHwsIFVzZXJNYXJnaW4gKz0gY29sbGF0ZXJhbCAtIHxwbmx8Ci0gcG5sID0gMDogVXNlck1hcmdpbiArPSBjb2xsYXRlcmFsIChubyBwb29sIGltcGFjdCkKClJldHVybnMgYEluc3VmZmljaWVudFBvb2xgIGlmIHRoZSBwb29sIGNhbm5vdCBjb3ZlciBhIHdpbm5pbmcgcGF5b3V0LgAAAAAAAA5jbG9zZV9wb3NpdGlvbgAAAAAAAwAAAAAAAAAEdXNlcgAAABMAAAAAAAAAEGNvbGxhdGVyYWxfdG9rZW4AAAATAAAAAAAAAANwbmwAAAAACwAAAAEAAAPpAAAH0AAAAAhQb3NpdGlvbgAAAAM=",
        "AAAAAAAAACJUb3RhbCBMUCBwb29sIGJhbGFuY2UgZm9yIGEgdG9rZW4uAAAAAAAQZ2V0X3Bvb2xfYmFsYW5jZQAAAAEAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAL",
        "AAAAAAAAAERVc2VyIGRlcG9zaXRzIG1hcmdpbiAoY29sbGF0ZXJhbCkgdG8gYmFjayB0aGVpciBsZXZlcmFnZWQgcG9zaXRpb25zLgAAABJkZXBvc2l0X2NvbGxhdGVyYWwAAAAAAAMAAAAAAAAABHVzZXIAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAD1Vc2VyIHdpdGhkcmF3cyBmcmVlIG1hcmdpbi4gQmxvY2tlZCB3aGlsZSBhIHBvc2l0aW9uIGlzIG9wZW4uAAAAAAAAE3dpdGhkcmF3X2NvbGxhdGVyYWwAAAAAAwAAAAAAAAAEdXNlcgAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAD5BZG1pbi1vbmx5OiBhbGxvdyBhIHRva2VuIHRvIGJlIHVzZWQgYXMgY29sbGF0ZXJhbCAvIExQIHRva2VuLgAAAAAAFGFkZF9jb2xsYXRlcmFsX3Rva2VuAAAAAQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAADZGcmVlIG1hcmdpbiBiYWxhbmNlIGZvciBhIHVzZXIgKGFsaWFzIGZvciBVc2VyTWFyZ2luKS4AAAAAABZnZXRfY29sbGF0ZXJhbF9iYWxhbmNlAAAAAAACAAAAAAAAAAR1c2VyAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAs=",
        "AAAAAAAAAMxDYWxsZWQgYnkgdGhlIHVzZXIgZnJvbSB0aGUgZnJvbnRlbmQgYWZ0ZXIgY29tcHV0aW5nIGVjb25vbWljcyBvZmYtY2hhaW4uCkxvY2tzIGBjb2xsYXRlcmFsX2xvY2tlZGAgZnJvbSB0aGUgdXNlcidzIGZyZWUgbWFyZ2luIGFuZCByZWNvcmRzIHRoZQpQb3NpdGlvbiBvbi1jaGFpbiBmb3IgdHJhbnNwYXJlbmN5IGFuZCBsaXF1aWRhdGlvbiB0cmFja2luZy4AAAAXb3Blbl9zeW50aGV0aWNfcG9zaXRpb24AAAAABQAAAAAAAAAEdXNlcgAAABMAAAAAAAAADGFzc2V0X3N5bWJvbAAAABEAAAAAAAAAC2RlYnRfYW1vdW50AAAAAAsAAAAAAAAAEGNvbGxhdGVyYWxfdG9rZW4AAAATAAAAAAAAABFjb2xsYXRlcmFsX2xvY2tlZAAAAAAAAAsAAAABAAAD6QAAAAIAAAAD" ]),
      options
    )
  }
  public readonly fromJSON = {
    initialize: this.txFromJSON<Result<void>>,
        lp_deposit: this.txFromJSON<Result<void>>,
        lp_withdraw: this.txFromJSON<Result<void>>,
        get_lp_share: this.txFromJSON<i128>,
        get_position: this.txFromJSON<Option<Position>>,
        close_position: this.txFromJSON<Result<Position>>,
        get_pool_balance: this.txFromJSON<i128>,
        deposit_collateral: this.txFromJSON<Result<void>>,
        withdraw_collateral: this.txFromJSON<Result<void>>,
        add_collateral_token: this.txFromJSON<Result<void>>,
        get_collateral_balance: this.txFromJSON<i128>,
        open_synthetic_position: this.txFromJSON<Result<void>>
  }
}