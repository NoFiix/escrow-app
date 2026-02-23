"use client";

type MissionUI = {
  id: number;
  title: string;
  shortDesc: string;
  creator: `0x${string}`;
  freelancer: `0x${string}`;
  paymentAmount: bigint;
  escrowedAmount: bigint;
  status: number;
  isFunded: boolean;
};

function shortAddr(a: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
}

export default function MissionCard({ mission }: { mission: MissionUI }) {
  return (
    <div className="rounded-lg border p-4 hover:bg-accent/40 transition">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold">{mission.title}</h2>
            <span className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground">
              #{mission.id}
            </span>
            {mission.isFunded ? (
              <span className="rounded-md border px-2 py-0.5 text-xs">Funded</span>
            ) : (
              <span className="rounded-md border px-2 py-0.5 text-xs">Not funded</span>
            )}
          </div>

          <p className="mt-1 text-sm text-muted-foreground">{mission.shortDesc}</p>

          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>Creator: {shortAddr(mission.creator)}</span>
            <span>Freelancer: {mission.freelancer === "0x0000000000000000000000000000000000000000" ? "—" : shortAddr(mission.freelancer)}</span>
            <span>Status: {mission.status}</span>
          </div>
        </div>

        <div className="text-right">
          <div className="text-sm font-semibold">{mission.paymentAmount.toString()} wei</div>
          <div className="text-xs text-muted-foreground">
            Escrow: {mission.escrowedAmount.toString()} wei
          </div>
        </div>
      </div>
    </div>
  );
}