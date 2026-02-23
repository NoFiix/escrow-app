"use client";

import * as React from "react";
import Link from "next/link";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatEther } from "viem";
import { contractAbi, contractAddress } from "@/constants";

const ZERO = "0x0000000000000000000000000000000000000000";

const STATUS = [
  "Created",
  "Funded",
  "InProgress",
  "Delivered",
  "Approved",
  "Rejected",
  "Disputed",
  "Refunded",
  "Cancelled",
] as const;

type MissionFull = {
  id: number;
  creator: `0x${string}`;
  title: string;
  description: string;
  rejectionMessage: string;
  paymentAmount: bigint;
  escrowedAmount: bigint;
  deliveryDeadline: bigint;
  validationDeadline: bigint;
  validationPeriod: bigint;
  deliveredAt: bigint;
  arbiter: boolean;
  freelancer: `0x${string}`;
  cancellationType: boolean;
  status: number;
};

function shortAddr(a: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
}

function fmtDate(ts: bigint) {
  if (!ts || ts === 0n) return "—";
  const d = new Date(Number(ts) * 1000);
  return d.toLocaleString();
}

function isZeroAddr(a: string) {
  return a.toLowerCase() === ZERO;
}

function cls(...x: (string | false | undefined)[]) {
  return x.filter(Boolean).join(" ");
}

export default function MissionDetails({ id }: { id: string }) {
  const missionId = Number(id);
  const { address, isConnected } = useAccount();

  // --- Reads ---
  const { data: ownerData } = useReadContract({
    abi: contractAbi,
    address: contractAddress as `0x${string}`,
    functionName: "owner",
  });

  const {
    data: missionRaw,
    isLoading: missionLoading,
    error: missionError,
    refetch: refetchMission,
  } = useReadContract({
    abi: contractAbi,
    address: contractAddress as `0x${string}`,
    functionName: "missions",
    args: [BigInt(missionId)],
    query: { enabled: Number.isFinite(missionId) && missionId >= 0 },
  });

  const mission = React.useMemo<MissionFull | null>(() => {
    if (!missionRaw) return null;

    const m = missionRaw as unknown as readonly [
      `0x${string}`, // creator
      string, // title
      string, // description
      string, // rejectionMessage
      bigint, // paymentAmount
      bigint, // escrowedAmount
      bigint, // deliveryDeadline
      bigint, // validationDeadline
      bigint, // validationPeriod
      bigint, // deliveredAt
      boolean, // arbiter
      `0x${string}`, // freelancer
      boolean, // cancellationType
      number // status (uint8)
    ];

    const [
      creator,
      title,
      description,
      rejectionMessage,
      paymentAmount,
      escrowedAmount,
      deliveryDeadline,
      validationDeadline,
      validationPeriod,
      deliveredAt,
      arbiter,
      freelancer,
      cancellationType,
      status,
    ] = m;

    return {
      id: missionId,
      creator,
      title,
      description,
      rejectionMessage,
      paymentAmount,
      escrowedAmount,
      deliveryDeadline,
      validationDeadline,
      validationPeriod,
      deliveredAt,
      arbiter,
      freelancer,
      cancellationType,
      status,
    };
  }, [missionRaw, missionId]);

  const owner = (ownerData as `0x${string}` | undefined) ?? (ZERO as `0x${string}`);

  const role = React.useMemo(() => {
    if (!address || !mission) return "visitor" as const;
    if (address.toLowerCase() === owner.toLowerCase()) return "owner" as const;
    if (address.toLowerCase() === mission.creator.toLowerCase()) return "creator" as const;
    if (address.toLowerCase() === mission.freelancer.toLowerCase()) return "freelancer" as const;
    return "visitor" as const;
  }, [address, mission, owner]);

  // --- Write (single pipe) ---
  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, error: receiptError } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  React.useEffect(() => {
    if (isSuccess) refetchMission();
  }, [isSuccess, refetchMission]);

  // --- Local UI state for forms ---
  const [reason, setReason] = React.useState("");
  const [rejectMsg, setRejectMsg] = React.useState("");
  const [extraTimeValue, setExtraTimeValue] = React.useState("2");
  const [extraTimeUnit, setExtraTimeUnit] = React.useState<"hours" | "days">("days");
  const [newDeadlineLocal, setNewDeadlineLocal] = React.useState("");

  const [uiError, setUiError] = React.useState<string | null>(null);

  function submit(fn: () => void) {
    setUiError(null);
    try {
      if (!isConnected) throw new Error("Connecte ton wallet.");
      if (!mission) throw new Error("Mission introuvable.");
      fn();
    } catch (e: any) {
      setUiError(e?.message ?? "Erreur.");
    }
  }

  // Helpers: seconds from unit
  function extraTimeSeconds(): bigint {
    const v = Number(extraTimeValue);
    if (!Number.isFinite(v) || v <= 0) throw new Error("Extra time invalide.");
    const seconds = extraTimeUnit === "days" ? v * 86400 : v * 3600;
    return BigInt(Math.floor(seconds));
  }

  function deadlineTsFromLocal(): bigint {
    if (!newDeadlineLocal) throw new Error("Choisis une nouvelle deadline.");
    const ms = Date.parse(newDeadlineLocal);
    if (Number.isNaN(ms)) throw new Error("Date invalide.");
    return BigInt(Math.floor(ms / 1000));
  }

  // --- Action availability (UX guards) ---
  const canCancel =
    mission && role === "creator" && (mission.status === 0 || mission.status === 1) && isZeroAddr(mission.freelancer);

  const canFund =
    mission && role === "creator" && mission.status === 0; // Created only

  const canAccept =
    mission && role !== "creator" && mission.status === 1 && isZeroAddr(mission.freelancer); // Funded + not accepted

  const canDeliver =
    mission && role === "freelancer" && (mission.status === 2 || mission.status === 5); // InProgress or Rejected

  const canApprove =
    mission && role === "creator" && mission.status === 3; // Delivered

  const canReject =
    mission && role === "creator" && mission.status === 3; // Delivered

  const canAutoApprove =
    mission && role === "freelancer" && mission.status === 3 && mission.escrowedAmount > 0n && mission.validationDeadline > 0n;

  const canDispute =
    mission && (role === "creator" || role === "freelancer") && (mission.status === 2 || mission.status === 3 || mission.status === 5);

  const canResolveDispute =
    mission && role === "owner" && mission.arbiter && mission.status === 6;

  const canRefund =
    mission && role === "creator" && mission.escrowedAmount > 0n && mission.status !== 6 && mission.status !== 4 && mission.status !== 7 && mission.status !== 8;

  const canUpdateDeadline =
    mission && role === "creator" && mission.status !== 4 && mission.status !== 7 && mission.status !== 8;

  const busy = isPending || isConfirming;

  if (missionLoading) return <div>Chargement…</div>;
  if (missionError) return <div>Erreur: {String(missionError)}</div>;
  if (!mission) return <div>Mission introuvable.</div>;

  const statusLabel = STATUS[mission.status as keyof typeof STATUS] ?? `Status #${mission.status}`;

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link href="/missions" className="text-sm text-muted-foreground hover:underline">
              ← Retour
            </Link>
            <span className="text-xs text-muted-foreground">#{mission.id}</span>
          </div>

          <h1 className="mt-2 text-2xl font-semibold truncate">{mission.title || `Mission #${mission.id}`}</h1>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-md border px-2 py-1 text-xs">{statusLabel}</span>
            {mission.escrowedAmount > 0n ? (
              <span className="rounded-md border px-2 py-1 text-xs">Funded</span>
            ) : (
              <span className="rounded-md border px-2 py-1 text-xs">Not funded</span>
            )}
            {mission.arbiter && <span className="rounded-md border px-2 py-1 text-xs">Arbiter ON</span>}
            {mission.cancellationType && <span className="rounded-md border px-2 py-1 text-xs">Cancellation flag</span>}
          </div>
        </div>

        <div className="rounded-xl border p-4 text-sm">
          <div className="font-medium">Montant</div>
          <div className="mt-1">
            <div>
              <span className="text-muted-foreground">Demandé:</span>{" "}
              <span className="font-semibold">{formatEther(mission.paymentAmount)} ETH</span>
            </div>
            <div>
              <span className="text-muted-foreground">Escrow:</span>{" "}
              <span className="font-semibold">{formatEther(mission.escrowedAmount)} ETH</span>
            </div>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Description</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
            {mission.description || "—"}
          </p>

          {mission.rejectionMessage?.length > 0 && (
            <div className="mt-6 rounded-xl border p-4">
              <div className="text-sm font-medium">Dernier rejet</div>
              <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{mission.rejectionMessage}</p>
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-3">
          <h2 className="text-lg font-semibold">Infos</h2>

          <div className="text-sm">
            <div className="text-muted-foreground">Creator</div>
            <div className="font-medium">{shortAddr(mission.creator)}</div>
          </div>

          <div className="text-sm">
            <div className="text-muted-foreground">Freelancer</div>
            <div className="font-medium">{isZeroAddr(mission.freelancer) ? "—" : shortAddr(mission.freelancer)}</div>
          </div>

          <div className="text-sm">
            <div className="text-muted-foreground">Delivery deadline</div>
            <div className="font-medium">{fmtDate(mission.deliveryDeadline)}</div>
          </div>

          <div className="text-sm">
            <div className="text-muted-foreground">Delivered at</div>
            <div className="font-medium">{fmtDate(mission.deliveredAt)}</div>
          </div>

          <div className="text-sm">
            <div className="text-muted-foreground">Validation deadline</div>
            <div className="font-medium">{fmtDate(mission.validationDeadline)}</div>
          </div>

          <div className="text-sm">
            <div className="text-muted-foreground">Owner (arbiter)</div>
            <div className="font-medium">{shortAddr(owner)}</div>
          </div>

          <div className="text-sm">
            <div className="text-muted-foreground">Ton rôle</div>
            <div className="font-medium">{role}</div>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {(uiError || writeError || receiptError) && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {uiError ?? (writeError ? String(writeError.message) : String(receiptError))}
        </div>
      )}

      {txHash && (
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <div className="break-all">
            <span className="font-medium">Tx:</span> {txHash}
          </div>
          <div className="mt-1 text-muted-foreground">
            {isPending ? "Signature…" : isConfirming ? "Confirmation…" : isSuccess ? "Confirmée ✅" : "—"}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Actions</h2>

        <div className="grid gap-3 md:grid-cols-2">
          {/* FUND */}
          <button
            disabled={!canFund || busy}
            className={cls(
              "rounded-xl border px-4 py-2 text-sm font-medium hover:bg-accent transition",
              (!canFund || busy) && "opacity-50 cursor-not-allowed"
            )}
            onClick={() =>
              submit(() =>
                writeContract({
                  abi: contractAbi,
                  address: contractAddress as `0x${string}`,
                  functionName: "fundMission",
                  args: [BigInt(missionId)],
                  value: mission.paymentAmount, // exact wei required
                })
              )
            }
          >
            Payer / Fund (creator)
          </button>

          {/* CANCEL */}
          <button
            disabled={!canCancel || busy}
            className={cls(
              "rounded-xl border px-4 py-2 text-sm font-medium hover:bg-accent transition",
              (!canCancel || busy) && "opacity-50 cursor-not-allowed"
            )}
            onClick={() =>
              submit(() =>
                writeContract({
                  abi: contractAbi,
                  address: contractAddress as `0x${string}`,
                  functionName: "cancelMission",
                  args: [BigInt(missionId)],
                })
              )
            }
          >
            Annuler (creator)
          </button>

          {/* ACCEPT */}
          <button
            disabled={!canAccept || busy}
            className={cls(
              "rounded-xl border px-4 py-2 text-sm font-medium hover:bg-accent transition",
              (!canAccept || busy) && "opacity-50 cursor-not-allowed"
            )}
            onClick={() =>
              submit(() =>
                writeContract({
                  abi: contractAbi,
                  address: contractAddress as `0x${string}`,
                  functionName: "acceptMission",
                  args: [BigInt(missionId)],
                })
              )
            }
          >
            Accepter (freelancer)
          </button>

          {/* DELIVER */}
          <button
            disabled={!canDeliver || busy}
            className={cls(
              "rounded-xl border px-4 py-2 text-sm font-medium hover:bg-accent transition",
              (!canDeliver || busy) && "opacity-50 cursor-not-allowed"
            )}
            onClick={() =>
              submit(() =>
                writeContract({
                  abi: contractAbi,
                  address: contractAddress as `0x${string}`,
                  functionName: "deliverMission",
                  args: [BigInt(missionId)],
                })
              )
            }
          >
            Livrer (freelancer)
          </button>

          {/* APPROVE */}
          <button
            disabled={!canApprove || busy}
            className={cls(
              "rounded-xl border px-4 py-2 text-sm font-medium hover:bg-accent transition",
              (!canApprove || busy) && "opacity-50 cursor-not-allowed"
            )}
            onClick={() =>
              submit(() =>
                writeContract({
                  abi: contractAbi,
                  address: contractAddress as `0x${string}`,
                  functionName: "approveMission",
                  args: [BigInt(missionId)],
                })
              )
            }
          >
            Approuver & payer (creator)
          </button>

          {/* AUTO APPROVE */}
          <button
            disabled={!canAutoApprove || busy}
            className={cls(
              "rounded-xl border px-4 py-2 text-sm font-medium hover:bg-accent transition",
              (!canAutoApprove || busy) && "opacity-50 cursor-not-allowed"
            )}
            onClick={() =>
              submit(() =>
                writeContract({
                  abi: contractAbi,
                  address: contractAddress as `0x${string}`,
                  functionName: "autoApprove",
                  args: [BigInt(missionId)],
                })
              )
            }
          >
            Auto-approve (freelancer)
          </button>

          {/* REFUND */}
          <button
            disabled={!canRefund || busy}
            className={cls(
              "rounded-xl border px-4 py-2 text-sm font-medium hover:bg-accent transition",
              (!canRefund || busy) && "opacity-50 cursor-not-allowed"
            )}
            onClick={() =>
              submit(() =>
                writeContract({
                  abi: contractAbi,
                  address: contractAddress as `0x${string}`,
                  functionName: "refundMission",
                  args: [BigInt(missionId)],
                })
              )
            }
          >
            Refund (creator)
          </button>
        </div>

        {/* DISPUTE */}
        <div className="rounded-xl border p-4 space-y-3">
          <div className="text-sm font-medium">Litige</div>

          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Raison du litige…"
            rows={3}
            className="w-full resize-none rounded-md border px-3 py-2 text-sm"
          />

          <button
            disabled={!canDispute || busy || reason.trim().length < 3}
            className={cls(
              "rounded-xl border px-4 py-2 text-sm font-medium hover:bg-accent transition",
              (!canDispute || busy || reason.trim().length < 3) && "opacity-50 cursor-not-allowed"
            )}
            onClick={() =>
              submit(() =>
                writeContract({
                  abi: contractAbi,
                  address: contractAddress as `0x${string}`,
                  functionName: "disputeMission",
                  args: [BigInt(missionId), reason.trim()],
                })
              )
            }
          >
            Ouvrir litige
          </button>
        </div>

        {/* REJECT */}
        <div className="rounded-xl border p-4 space-y-3">
          <div className="text-sm font-medium">Rejeter & demander retouche</div>

          <textarea
            value={rejectMsg}
            onChange={(e) => setRejectMsg(e.target.value)}
            placeholder="Message de rejet (obligatoire)…"
            rows={3}
            className="w-full resize-none rounded-md border px-3 py-2 text-sm"
          />

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={extraTimeValue}
              onChange={(e) => setExtraTimeValue(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
              inputMode="numeric"
              placeholder="2"
            />
            <select
              value={extraTimeUnit}
              onChange={(e) => setExtraTimeUnit(e.target.value as any)}
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="hours">heures</option>
              <option value="days">jours</option>
            </select>

            <button
              disabled={!canReject || busy || rejectMsg.trim().length < 3}
              className={cls(
                "rounded-xl border px-4 py-2 text-sm font-medium hover:bg-accent transition",
                (!canReject || busy || rejectMsg.trim().length < 3) && "opacity-50 cursor-not-allowed"
              )}
              onClick={() =>
                submit(() =>
                  writeContract({
                    abi: contractAbi,
                    address: contractAddress as `0x${string}`,
                    functionName: "rejectMission",
                    args: [BigInt(missionId), extraTimeSeconds(), rejectMsg.trim()],
                  })
                )
              }
            >
              Rejeter
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            extraTime est ajouté à “maintenant” côté contrat (pas à l’ancienne deadline).
          </p>
        </div>

        {/* UPDATE DEADLINE */}
        <div className="rounded-xl border p-4 space-y-3">
          <div className="text-sm font-medium">Update delivery deadline (creator)</div>

          <input
            type="datetime-local"
            value={newDeadlineLocal}
            onChange={(e) => setNewDeadlineLocal(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />

          <button
            disabled={!canUpdateDeadline || busy}
            className={cls(
              "rounded-xl border px-4 py-2 text-sm font-medium hover:bg-accent transition",
              (!canUpdateDeadline || busy) && "opacity-50 cursor-not-allowed"
            )}
            onClick={() =>
              submit(() =>
                writeContract({
                  abi: contractAbi,
                  address: contractAddress as `0x${string}`,
                  functionName: "updateDeliveryDeadline",
                  args: [BigInt(missionId), deadlineTsFromLocal()],
                })
              )
            }
          >
            Mettre à jour la deadline
          </button>
        </div>

        {/* RESOLVE DISPUTE */}
        <div className="rounded-xl border p-4 space-y-3">
          <div className="text-sm font-medium">Arbitrage (owner)</div>
          <p className="text-xs text-muted-foreground">
            Visible si tu es owner, si arbiter=true et status=Disputed.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              disabled={!canResolveDispute || busy}
              className={cls(
                "rounded-xl border px-4 py-2 text-sm font-medium hover:bg-accent transition",
                (!canResolveDispute || busy) && "opacity-50 cursor-not-allowed"
              )}
              onClick={() =>
                submit(() =>
                  writeContract({
                    abi: contractAbi,
                    address: contractAddress as `0x${string}`,
                    functionName: "resolveDispute",
                    args: [BigInt(missionId), true],
                  })
                )
              }
            >
              Payer le freelancer
            </button>

            <button
              disabled={!canResolveDispute || busy}
              className={cls(
                "rounded-xl border px-4 py-2 text-sm font-medium hover:bg-accent transition",
                (!canResolveDispute || busy) && "opacity-50 cursor-not-allowed"
              )}
              onClick={() =>
                submit(() =>
                  writeContract({
                    abi: contractAbi,
                    address: contractAddress as `0x${string}`,
                    functionName: "resolveDispute",
                    args: [BigInt(missionId), false],
                  })
                )
              }
            >
              Refund au creator
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}