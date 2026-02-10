"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase.client";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { ensureUserProfile } from "@/lib/userProfile";
import { Page, Card, CardBody, Button } from "@/components/ui/Page";

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileCreated, setProfileCreated] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);

      if (user) {
        const result = await ensureUserProfile(user);
        setProfileCreated(result.created);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  async function handleLogout() {
    await signOut(auth);
    window.location.href = "/login";
  }

  if (loading) return <p>Carregando...</p>;

  if (!user) {
    window.location.href = "/login";
    return null;
  }

  return (
    <Page
      title="Dashboard"
      description={`Bem-vindo, ${user.email}!`}
      right={
        <Button variant="danger" onClick={handleLogout}>
          Sair
        </Button>
      }
    >
      {profileCreated && (
        <Alert variant="success">Perfil criado no banco!</Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardBody>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Lojas</h3>
            <p className="text-gray-600 mb-4">Gerencie as lojas cadastradas.</p>
            <Button variant="primary" asChild>
              <a href="/stores">Acessar Lojas</a>
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Itens</h3>
            <p className="text-gray-600 mb-4">Cadastre e edite itens.</p>
            <Button variant="primary" asChild>
              <a href="/items">Acessar Itens</a>
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Estoque</h3>
            <p className="text-gray-600 mb-4">Controle o estoque por loja.</p>
            <Button variant="primary" asChild>
              <a href="/inventory">Acessar Estoque</a>
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Lista de Compras</h3>
            <p className="text-gray-600 mb-4">Veja o que precisa comprar.</p>
            <Button variant="primary" asChild>
              <a href="/shopping-list">Acessar Lista</a>
            </Button>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Pedidos</h3>
          <p className="text-gray-600 mb-4">Gerencie pedidos de compra.</p>
          <Button variant="primary" asChild>
            <a href="/orders">Acessar Pedidos</a>
          </Button>
        </CardBody>
      </Card>
    </Page>
  );
}