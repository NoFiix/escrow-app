import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Escrow dApp</h1>
      <p className="text-sm text-muted-foreground">
        Choisis une action.
      </p>

      <div className="flex gap-2">
        <Link className="rounded-md border px-3 py-2 text-sm hover:bg-accent" href="/missions">
          Voir les missions
        </Link>
        <Link className="rounded-md border px-3 py-2 text-sm hover:bg-accent" href="/missions/new">
          Créer une mission
        </Link>
      </div>
    </div>
  );
}