"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { parseEther } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { contractAbi, contractAddress } from "@/constants";

function nowPlusHours(hours: number) {
  const d = new Date(Date.now() + hours * 60 * 60 * 1000);
  // format for datetime-local: YYYY-MM-DDTHH:mm
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function MissionForm() {
  const router = useRouter();
  const { address, isConnected } = useAccount();

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [paymentEth, setPaymentEth] = React.useState("0.01");
  const [deadlineLocal, setDeadlineLocal] = React.useState(() => nowPlusHours(24));
  const [arbiter, setArbiter] = React.useState(false);
  const [cancellationType, setCancellationType] = React.useState(false);

  const [formError, setFormError] = React.useState<string | null>(null);

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Redirect on success
  React.useEffect(() => {
    if (isSuccess) router.push("/missions");
  }, [isSuccess, router]);

  function validate(): { paymentWei: bigint; deadlineTs: bigint } {
    const t = title.trim();
    const d = description.trim();

    if (!isConnected || !address) throw new Error("Connecte ton wallet d’abord.");
    if (t.length < 3) throw new Error("Le titre doit faire au moins 3 caractères.");
    if (d.length < 10) throw new Error("La description doit faire au moins 10 caractères.");

    // payment ETH -> wei
    let paymentWei: bigint;
    try {
      // parseEther expects a string like "0.05"
      paymentWei = parseEther(paymentEth);
    } catch {
      throw new Error("Montant invalide. Exemple: 0.05");
    }
    if (paymentWei <= 0n) throw new Error("Le montant doit être > 0.");

    // datetime-local -> timestamp seconds
    const ms = Date.parse(deadlineLocal); // milliseconds
    if (Number.isNaN(ms)) throw new Error("Deadline invalide.");
    const deadlineSeconds = BigInt(Math.floor(ms / 1000));
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    if (deadlineSeconds <= nowSeconds) throw new Error("La deadline doit être dans le futur.");

    return { paymentWei, deadlineTs: deadlineSeconds };
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    try {
      const { paymentWei, deadlineTs } = validate();

      writeContract({
        abi: contractAbi,
        address: contractAddress as `0x${string}`,
        functionName: "addMission",
        args: [
          title.trim(),
          description.trim(),
          paymentWei,
          deadlineTs,
          arbiter,
          cancellationType,
        ],
      });
    } catch (err: any) {
      setFormError(err?.message ?? "Erreur inconnue.");
    }
  }

  const disabled = isPending || isConfirming;

  return (
    <div className="rounded-xl border p-5 shadow-sm">
      <form onSubmit={onSubmit} className="space-y-5">
        {/* Title */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Titre</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Landing page + intégration wallet"
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-offset-2"
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Décris le besoin, les exigences, les livrables, etc."
            rows={6}
            className="w-full resize-none rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-offset-2"
          />
          <p className="text-xs text-muted-foreground">
            Conseil: ajoute des critères de validation clairs (ex: “responsive”, “testé”, “doc”).
          </p>
        </div>

        {/* Payment + Deadline */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Paiement (ETH)</label>
            <input
              value={paymentEth}
              onChange={(e) => setPaymentEth(e.target.value)}
              placeholder="0.05"
              inputMode="decimal"
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-offset-2"
            />
            <p className="text-xs text-muted-foreground">Converti automatiquement en wei.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Deadline livraison</label>
            <input
              type="datetime-local"
              value={deadlineLocal}
              onChange={(e) => setDeadlineLocal(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-offset-2"
            />
            <p className="text-xs text-muted-foreground">Doit être dans le futur.</p>
          </div>
        </div>

        {/* Options */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
            <input
              type="checkbox"
              checked={arbiter}
              onChange={(e) => setArbiter(e.target.checked)}
            />
            <span>
              <span className="font-medium">Arbitrage</span>
              <span className="block text-xs text-muted-foreground">
                Active le mode litige (owner tranche).
              </span>
            </span>
          </label>

          <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
            <input
              type="checkbox"
              checked={cancellationType}
              onChange={(e) => setCancellationType(e.target.checked)}
            />
            <span>
              <span className="font-medium">Cancellation type</span>
              <span className="block text-xs text-muted-foreground">
                Flag business (tu pourras définir les règles ensuite).
              </span>
            </span>
          </label>
        </div>

        {/* Errors */}
        {(formError || writeError || receiptError) && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {formError ?? (writeError ? String(writeError.message) : String(receiptError))}
          </div>
        )}

        {/* Status */}
        {txHash && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div>
              <span className="font-medium">Tx:</span>{" "}
              <span className="break-all">{txHash}</span>
            </div>
            <div className="mt-1 text-muted-foreground">
              {isConfirming
                ? "Confirmation en cours…"
                : isSuccess
                ? "Confirmée ✅ Redirection…"
                : "Transaction envoyée. Attente de confirmation…"}
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60"
        >
          {isPending ? "Signature…" : isConfirming ? "Confirmation…" : "Créer la mission"}
        </button>

        {!isConnected && (
          <p className="text-xs text-muted-foreground">
            Connecte ton wallet pour créer une mission.
          </p>
        )}
      </form>
    </div>
  );
}