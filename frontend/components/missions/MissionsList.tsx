"use client";

import * as React from "react";
import Link from "next/link";
import { useReadContract, useReadContracts } from "wagmi";
import { contractAbi, contractAddress } from "@/constants";
import MissionCard from "./MissionCard";

type SortKey = "newest" | "amount_desc" | "status";
type MissionUI = {
  id: number;
  title: string;
  shortDesc: string;
  creator: string;
  freelancer: string;
  paymentAmount: bigint;
  escrowedAmount: bigint;
  status: number;
  isFunded: boolean;
};

export default function MissionsList() {
  const [query, setQuery] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("newest");

  // 1) read missionsCount()
  const { data: countData, isLoading: countLoading, error: countError } =
    useReadContract({
      abi: contractAbi,
      address: contractAddress,
      functionName: "missionsCount",
    });

  const count = Number(countData ?? 0);

  // 2) build calls missions(i) in batch
  const missionCalls = React.useMemo<{
        abi: typeof contractAbi;
        address: `0x${string}`;
        functionName: "missions";
        args: readonly [bigint];
    }[]
    >(() => {
    return Array.from({ length: count }, (_, i) => ({
      abi: contractAbi,
      address: contractAddress,
      functionName: "missions" as const,
      args: [BigInt(i)] as const,
    }));
  }, [count]);

  const {
    data: missionsRaw,
    isLoading: missionsLoading,
    error: missionsError,
  } = useReadContracts({
    contracts: missionCalls as any, // <- temporaire pour débloquer
    query: {
      enabled: count > 0,
    },
  });

  // 3) map raw -> UI
  const missions = React.useMemo(() => {
    const rows: MissionUI[] =
      missionsRaw
        ?.map((r, id) => {
          if (r.status !== "success" || !r.result) return null;

          // r.result is the Mission struct tuple
          // Order must match your struct:
          // creator, title, description, rejectionMessage,
          // paymentAmount, escrowedAmount, deliveryDeadline, validationDeadline,
          // validationPeriod, deliveredAt, arbiter, freelancer, cancellationType, status

          const m = r.result as unknown as readonly [
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
            number // status (enum)
          ];

          const [
            creator,
            title,
            description,
            _rejMsg,
            paymentAmount,
            escrowedAmount,
            _deliveryDeadline,
            _validationDeadline,
            _validationPeriod,
            _deliveredAt,
            _arbiter,
            freelancer,
            _cancellationType,
            status,
          ] = m;

          const isFunded = escrowedAmount > 0n;
          const shortDesc =
            description.length > 50 ? description.slice(0, 50) + "…" : description;

          return {
            id,
            title: title || `Mission #${id}`,
            shortDesc,
            creator,
            freelancer,
            paymentAmount,
            escrowedAmount,
            status,
            isFunded,
          };
        })
        .filter(Boolean) ?? [];

    // filter
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter((x) => {
          const creator = x.creator.toLowerCase();
          return (
            x.title.toLowerCase().includes(q) ||
            x.shortDesc.toLowerCase().includes(q) ||
            creator.includes(q)
          );
        })
      : rows;

    // sort
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === "amount_desc") return Number(b.paymentAmount - a.paymentAmount);
      if (sortKey === "status") return b.status - a.status;
      // newest: id desc
      return b.id - a.id;
    });

    return sorted;
  }, [missionsRaw, query, sortKey]);

  if (countLoading) return <div>Chargement…</div>;
  if (countError) return <div>Erreur missionsCount: {String(countError)}</div>;

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Missions</h1>
          <p className="text-sm text-muted-foreground">
            Total: {count} {count <= 1 ? "mission" : "missions"}
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/missions/new"
            className="inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            + Nouvelle mission
          </Link>
        </div>
      </div>

      {/* filters */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher (titre, description, creator)…"
          className="w-full rounded-md border px-3 py-2 text-sm"
        />

        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded-md border px-3 py-2 text-sm"
        >
          <option value="newest">Tri: plus récentes</option>
          <option value="amount_desc">Tri: montant décroissant</option>
          <option value="status">Tri: status</option>
        </select>
      </div>

      {/* list */}
      {missionsLoading && <div>Chargement des missions…</div>}
      {missionsError && <div>Erreur lecture missions: {String(missionsError)}</div>}

      <div className="grid gap-3">
        {missions.map((m) => (
          <Link key={m.id} href={`/missions/${m.id}`} className="block">
            <MissionCard mission={m} />
          </Link>
        ))}
        {!missionsLoading && missions.length === 0 && (
          <div className="rounded-md border p-4 text-sm text-muted-foreground">
            Aucune mission à afficher.
          </div>
        )}
      </div>
    </div>
  );
}