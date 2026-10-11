"use client";
// Wallet adapter: imported ONLY from the /client, /voucher, /panel, /admin layouts (AGENTS.md rule 1).
import { useMemo, useState, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import bs58 from "bs58";
import en from "@insuwork/shared/i18n/en.json";
import "@solana/wallet-adapter-react-ui/styles.css";
import { E2eWalletAdapter, e2eWalletEnabled } from "./e2e-wallet";

export function WalletProviders({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl("devnet"), []);
  // Phantom, Solflare, Backpack… register via Wallet Standard, so no adapter list is needed.
  // The E2E test wallet exists only in dev with NEXT_PUBLIC_E2E_WALLET=1 (E-54).
  const wallets = useMemo(() => (e2eWalletEnabled() ? [new E2eWalletAdapter()] : []), []);
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

/** SIWS: sign a server nonce to bind the connected wallet to the signed-in profile. */
export function WalletBind() {
  const t = en.auth.wallet;
  const { publicKey, signMessage } = useWallet();
  const [state, setState] = useState<"idle" | "busy" | "bound" | "failed">("idle");

  const bind = async () => {
    if (!publicKey || !signMessage) return;
    setState("busy");
    try {
      const wallet = publicKey.toBase58();
      const post = (path: string, body: object) =>
        fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const n = await post("/api/auth/siws/nonce", { wallet });
      if (!n.ok) throw new Error();
      const { message } = await n.json();
      const signature = bs58.encode(await signMessage(new TextEncoder().encode(message)));
      const v = await post("/api/auth/siws/verify", { wallet, signature });
      setState(v.ok ? "bound" : "failed");
      if (v.ok) location.reload();
    } catch {
      setState("failed");
    }
  };

  return (
    <section className="m-4 flex flex-wrap items-center gap-3 rounded border p-4">
      <div className="flex-1">
        <h2 className="font-medium">{t.title}</h2>
        <p className="text-sm">{t.body}</p>
      </div>
      <WalletMultiButton />
      {publicKey && state !== "bound" && (
        <button type="button" onClick={bind} disabled={state === "busy"} className="rounded bg-black px-3 py-2 text-white">
          {t.sign}
        </button>
      )}
      {state === "bound" && <p role="status">{t.bound}</p>}
      {state === "failed" && <p role="alert">{t.failed}</p>}
    </section>
  );
}
