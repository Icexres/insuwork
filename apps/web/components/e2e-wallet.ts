// Dev-only test wallet for Playwright (E-54). Signs with a keypair the test puts in localStorage
// ("insuwork-e2e-wallet", base58 secret). Registered only when NEXT_PUBLIC_E2E_WALLET=1 outside production.
import {
  BaseMessageSignerWalletAdapter, WalletNotReadyError, WalletReadyState,
  type TransactionOrVersionedTransaction, type WalletName,
} from "@solana/wallet-adapter-base";
import { Keypair, VersionedTransaction, type PublicKey } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";

export const E2E_WALLET_NAME = "InsuWork E2E Test Wallet" as WalletName<"InsuWork E2E Test Wallet">;
export const e2eWalletEnabled = () => process.env.NEXT_PUBLIC_E2E_WALLET === "1" && process.env.NODE_ENV !== "production";

export class E2eWalletAdapter extends BaseMessageSignerWalletAdapter {
  name = E2E_WALLET_NAME;
  url = "https://github.com/insuwork";
  icon = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxIDEiLz4=";
  readyState = WalletReadyState.Installed;
  supportedTransactionVersions = new Set(["legacy", 0] as const);
  connecting = false;
  private kp: Keypair | null = null;

  get publicKey(): PublicKey | null {
    return this.kp?.publicKey ?? null;
  }

  async connect() {
    const secret = typeof localStorage === "undefined" ? null : localStorage.getItem("insuwork-e2e-wallet");
    if (!secret) throw new WalletNotReadyError("no e2e keypair in localStorage");
    this.kp = Keypair.fromSecretKey(bs58.decode(secret));
    this.emit("connect", this.kp.publicKey);
  }

  async disconnect() {
    this.kp = null;
    this.emit("disconnect");
  }

  async signTransaction<T extends TransactionOrVersionedTransaction<this["supportedTransactionVersions"]>>(tx: T): Promise<T> {
    if (!this.kp) throw new WalletNotReadyError();
    if (tx instanceof VersionedTransaction) tx.sign([this.kp]);
    else tx.partialSign(this.kp);
    return tx;
  }

  async signMessage(message: Uint8Array) {
    if (!this.kp) throw new WalletNotReadyError();
    return ed25519.sign(message, this.kp.secretKey.slice(0, 32));
  }
}
