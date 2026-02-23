"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();

  const isActive =
    href === "/"
      ? pathname === "/"
      : href === "/missions"
      ? pathname === "/missions" || /^\/missions\/\d+$/.test(pathname)
      : pathname === href; // ex: /missions/new uniquement

  return (
    <Link
      href={href}
      className={`px-3 py-2 text-sm font-medium rounded-md transition ${
        isActive
          ? "bg-black text-white"
          : "text-muted-foreground hover:text-black hover:bg-accent"
      }`}
    >
      {label}
    </Link>
  );
}

export default function Header() {
  return (
    <header className="border-b bg-white">
      <nav className="navbar">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-semibold">
              Escrow
            </Link>

            <div className="flex items-center gap-2">
              <NavLink href="/" label="Home" />
              <NavLink href="/missions" label="Missions" />
              <NavLink href="/missions/new" label="Créer" />
            </div>
          </div>

          <ConnectButton />
        </div>
      </nav>
    </header>
  );
}