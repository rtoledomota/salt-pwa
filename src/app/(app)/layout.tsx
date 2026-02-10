"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase.client";

function NavItem({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={[
        "block rounded-md px-3 py-2 text-sm font-medium transition",
        active
          ? "bg-gray-900 text-white shadow-sm"
          : "text-gray-700 hover:bg-gray-100",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        window.location.href = "/login";
        return;
      }
      setEmail(u.email ?? "");
    });
    return unsub;
  }, []);

  const pageTitle =
    pathname === "/dashboard"
      ? "Dashboard"
      : pathname === "/stores"
      ? "Lojas"
      : pathname === "/items"
      ? "Itens"
      : pathname === "/inventory"
      ? "Estoque"
      : pathname === "/shopping-list"
      ? "Lista de Compras"
      : pathname === "/orders"
      ? "Pedidos"
      : pathname?.startsWith("/orders/")
      ? "Pedido"
      : "App";

  async function logout() {
    await signOut(auth);
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden md:flex md:w-72 md:flex-col md:fixed md:inset-y-0 bg-white border-r">
          {/* Brand / Title */}
          <div className="px-6 py-5 border-b">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-gray-900 text-white flex items-center justify-center font-extrabold text-lg">
                S
              </div>

              <div className="min-w-0">
                <div className="text-base font-extrabold tracking-wide text-gray-900 uppercase leading-5">
                  GESTÃO DE ESTOQUE SALT
                </div>
                <div className="text-xs text-gray-500 truncate">
                  Versão de avaliação
                </div>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-4 py-4 space-y-1">
            <NavItem href="/dashboard" label="Dashboard" />
            <NavItem href="/stores" label="Lojas" />
            <NavItem href="/items" label="Itens" />
            <NavItem href="/inventory" label="Estoque" />
            <NavItem href="/shopping-list" label="Lista de Compras" />
            <NavItem href="/orders" label="Pedidos" />
          </nav>

          <div className="px-4 py-4 border-t">
            <div className="text-xs text-gray-500 truncate">{email}</div>
            <button
              onClick={logout}
              className="mt-3 w-full rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
            >
              Sair
            </button>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 md:pl-72">
          {/* Topbar */}
          <header className="h-16 bg-white border-b flex items-center justify-between px-4 md:px-6">
            <div className="font-semibold text-gray-900">{pageTitle}</div>

            <div className="md:hidden flex items-center gap-2">
              <span className="text-xs text-gray-500 truncate max-w-[180px]">
                {email}
              </span>
              <button
                onClick={logout}
                className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
              >
                Sair
              </button>
            </div>
          </header>

          {/* Conteúdo com container padrão */}
          <main className="p-4 md:p-6">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}