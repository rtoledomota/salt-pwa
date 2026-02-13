"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase.client";
import { Page, Card, CardBody, Button, Alert } from "@/components/ui/Page";

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;

      setError("Demorou demais para confirmar o login. Tente recarregar a página.");
      setLoadingAuth(false);
    }, 10000);

    const unsub = onAuthStateChanged(auth, (u) => {
      if (settled) return;
      settled = true;

      clearTimeout(timeout);

      setUser(u);
      setLoadingAuth(false);

      if (!u) {
        window.location.href = "/login";
      }
    });

    return () => {
      clearTimeout(timeout);
      unsub();
    };
  }, []);

  async function handleSignOut() {
    try {
      await auth.signOut();
      window.location.href = "/login";
    } catch (e: any) {
      setError(e?.message ?? "Erro ao sair.");
    }
  }

  if (loadingAuth) {
    return (
      <Page title="Dashboard" description="Carregando...">
        <Card>
          <CardBody>
            <p className="text-gray-600">Carregando...</p>
          </CardBody>
        </Card>
      </Page>
    );
  }

  // Se não tem user, o onAuthStateChanged já redirecionou
  if (!user) return null;

  return (
    <Page
      title="Dashboard"
      description={`Logado como ${user.email ?? "usuário"}`}
      right={
        <Button variant="secondary" onClick={handleSignOut}>
          Sair
        </Button>
      }
    >
      {error && <Alert variant="error">{error}</Alert>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardBody>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Lojas</h3>
            <p className="text-sm text-gray-600 mb-4">Cadastre e gerencie suas lojas.</p>
            <Button variant="primary" asChild>
              <a href="/stores">Acessar Lojas</a>
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Itens</h3>
            <p className="text-sm text-gray-600 mb-4">Cadastre produtos e materiais.</p>
            <Button variant="primary" asChild>
              <a href="/items">Acessar Itens</a>
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Estoque</h3>
            <p className="text-sm text-gray-600 mb-4">Atualize estoque atual e mínimo por loja.</p>
            <Button variant="primary" asChild>
              <a href="/inventory">Acessar Estoque</a>
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Lista de Compras</h3>
            <p className="text-sm text-gray-600 mb-4">Veja automaticamente o que comprar.</p>
            <Button variant="primary" asChild>
              <a href="/shopping-list">Acessar Lista</a>
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Pedidos</h3>
            <p className="text-sm text-gray-600 mb-4">Crie e acompanhe pedidos.</p>
            <Button variant="primary" asChild>
              <a href="/orders">Acessar Pedidos</a>
            </Button>
          </CardBody>
        </Card>
      </div>
    </Page>
  );
}