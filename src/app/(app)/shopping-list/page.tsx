"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase.client";
import { Page, Card, CardBody, Button, Select, Alert } from "@/components/ui/Page";

type Store = { id: string; name: string; code: string };
type Item = { id: string; name: string; unit: string; supplier?: string; buyer?: string };

type ShoppingListItem = {
  itemId: string;
  itemName: string;
  unit: string;
  currentQty: number;
  minQty: number;
  toBuy: number;
  supplier?: string;
  buyer?: string;
};

type Order = {
  id: string;
  storeId: string;
  storeName: string;
  items: ShoppingListItem[];
  createdAt: Date;
  status: "pending" | "completed";
};

export default function ShoppingListPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [stores, setStores] = useState<Store[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loadingBase, setLoadingBase] = useState(true);

  const [selectedStoreId, setSelectedStoreId] = useState<string>("");

  const [shoppingList, setShoppingList] = useState<ShoppingListItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const [creatingOrder, setCreatingOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canInteract = useMemo(() => !!user && !loadingAuth, [user, loadingAuth]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoadingAuth(false);
      if (!u) window.location.href = "/login";
    });
    return unsub;
  }, []);

  // carrega stores + items (uma vez)
  useEffect(() => {
    if (!user) return;

    (async () => {
      setError(null);
      setLoadingBase(true);

      try {
        const [storesSnap, itemsSnap] = await Promise.all([
          getDocs(query(collection(db, "stores"))),
          getDocs(query(collection(db, "items"))),
        ]);

        const storesList: Store[] = storesSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));
        const itemsList: Item[] = itemsSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));

        storesList.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
        itemsList.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

        setStores(storesList);
        setItems(itemsList);

        if (!selectedStoreId && storesList.length > 0) {
          setSelectedStoreId(storesList[0].id);
        }
      } catch (e: any) {
        setError(e?.message ?? "Erro ao carregar lojas/itens.");
      } finally {
        setLoadingBase(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // calcula shopping list quando muda loja
  useEffect(() => {
    if (!user) return;
    if (!selectedStoreId) return;

    setLoadingList(true);
    setError(null);

    const q = query(collection(db, "inventory"), where("storeId", "==", selectedStoreId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const invMap: Record<string, { currentQty: number; minQty: number }> = {};

        snap.docs.forEach((d) => {
          const data = d.data() as any;
          invMap[data.itemId] = {
            currentQty: Number(data.currentQty ?? 0),
            minQty: Number(data.minQty ?? 0),
          };
        });

        const list: ShoppingListItem[] = items
          .map((it) => {
            const inv = invMap[it.id];
            if (!inv) return null;

            const toBuy = Math.max(0, inv.minQty - inv.currentQty);
            if (toBuy <= 0) return null;

            return {
              itemId: it.id,
              itemName: it.name,
              unit: it.unit,
              currentQty: inv.currentQty,
              minQty: inv.minQty,
              toBuy,
              supplier: it.supplier,
              buyer: it.buyer,
            };
          })
          .filter(Boolean) as ShoppingListItem[];

        setShoppingList(list);
        setLoadingList(false);
      },
      (err) => {
        setError(err.message);
        setLoadingList(false);
      }
    );

    return unsub;
  }, [user, selectedStoreId, items]);

  async function createOrder() {
    if (!selectedStoreId || shoppingList.length === 0) return;

    setCreatingOrder(true);
    setError(null);

    try {
      const selectedStore = stores.find((s) => s.id === selectedStoreId);
      if (!selectedStore) throw new Error("Loja não encontrada.");

      const orderData: Omit<Order, "id"> = {
        storeId: selectedStoreId,
        storeName: selectedStore.name,
        items: shoppingList,
        createdAt: new Date(),
        status: "pending",
      };

      await setDoc(doc(collection(db, "orders")), {
        ...orderData,
        createdAt: serverTimestamp(),
      });

      alert("Pedido criado com sucesso!");
    } catch (e: any) {
      setError(e?.message ?? "Erro ao criar pedido.");
    } finally {
      setCreatingOrder(false);
    }
  }

  if (loadingAuth) return <p>Carregando...</p>;

  return (
    <Page
      title="Lista de Compras"
      description="Itens que precisam ser comprados por loja."
      right={
        <div className="flex gap-2">
          <Button variant="secondary" asChild>
            <a href="/orders">Voltar para Pedidos</a>
          </Button>
          <Button variant="primary" onClick={createOrder} disabled={!canInteract || creatingOrder}>
            {creatingOrder ? "Criando..." : "Criar Pedido"}
          </Button>
        </div>
      }
    >
      {error && <Alert variant="error">{error}</Alert>}

      {loadingBase ? (
        <Card>
          <CardBody>
            <p className="text-gray-600">Carregando lojas e itens...</p>
          </CardBody>
        </Card>
      ) : stores.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-gray-600">Cadastre pelo menos 1 loja em "Lojas".</p>
          </CardBody>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-gray-600">Cadastre itens em "Itens".</p>
          </CardBody>
        </Card>
      ) : (
        <>
          <Card>
            <CardBody>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700">Loja:</label>
                <Select
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  disabled={creatingOrder}
                  className="w-64"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </Select>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Itens para comprar ({shoppingList.length})
              </h3>

              {loadingList ? (
                <p className="text-gray-600">Calculando lista...</p>
              ) : shoppingList.length === 0 ? (
                <p className="text-gray-600">Nenhum item precisa ser comprado nesta loja.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Item
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Unidade
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Atual
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Mínimo
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Comprar
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Fornecedor
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Comprador
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {shoppingList.map((it) => (
                        <tr key={it.itemId}>
                          <td className="px-4 py-3 text-sm text-gray-900">{it.itemName}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{it.unit}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{it.currentQty}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{it.minQty}</td>
                          <td className="px-4 py-3 text-sm font-medium text-green-600">{it.toBuy}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{it.supplier || "-"}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{it.buyer || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </Page>
  );
}