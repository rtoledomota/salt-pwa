"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase.client";
import { Page, Card, CardBody, Button, Select, Alert } from "@/components/ui/Page";

type Store = { id: string; name: string; code: string };
type Item = { id: string; name: string; unit: string; supplier?: string; buyer?: string };

type InventoryDoc = {
  storeId: string;
  itemId: string;
  currentQty: number;
  minQty: number;
};

function escapeCsv(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ShoppingListPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [stores, setStores] = useState<Store[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loadingBase, setLoadingBase] = useState(true);

  const [selectedStoreId, setSelectedStoreId] = useState<string>("");

  const [inventory, setInventory] = useState<InventoryDoc[]>([]);
  const [loadingInv, setLoadingInv] = useState(false);

  const [creatingOrder, setCreatingOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedStore = useMemo(
    () => stores.find((s) => s.id === selectedStoreId) ?? null,
    [stores, selectedStoreId]
  );

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

        const storesList: Store[] = storesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        const itemsList: Item[] = itemsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

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

  // escuta inventory SOMENTE da loja selecionada
  useEffect(() => {
    if (!user) return;
    if (!selectedStoreId) return;

    setError(null);
    setLoadingInv(true);

    const q = query(collection(db, "inventory"), where("storeId", "==", selectedStoreId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const invList: InventoryDoc[] = snap.docs.map((d) => d.data() as any);
        setInventory(invList);
        setLoadingInv(false);
      },
      (err) => {
        setError(err.message);
        setLoadingInv(false);
      }
    );

    return unsub;
  }, [user, selectedStoreId]);

  const list = useMemo(() => {
    if (!selectedStoreId) return [];

    const invByItem = new Map<string, InventoryDoc>();
    for (const inv of inventory) invByItem.set(inv.itemId, inv);

    return items
      .map((it) => {
        const inv = invByItem.get(it.id);
        const currentQty = inv?.currentQty ?? 0;
        const minQty = inv?.minQty ?? 0;
        const toBuy = Math.max(0, minQty - currentQty);

        return {
          itemId: it.id,
          name: it.name,
          unit: it.unit,
          supplier: it.supplier ?? "",
          buyer: it.buyer ?? "",
          currentQty,
          minQty,
          toBuy,
        };
      })
      .filter((r) => r.toBuy > 0)
      .sort((a, b) => b.toBuy - a.toBuy);
  }, [inventory, items, selectedStoreId]);

  async function exportCsvWithMeta() {
    // já temos supplier/buyer no list (vem do items)
    const header = ["Item", "Unidade", "Fornecedor", "Comprador", "Atual", "Minimo", "Comprar"];
    const rows = list.map((r) => [
      r.name,
      r.unit,
      r.supplier,
      r.buyer,
      String(r.currentQty),
      String(r.minQty),
      String(r.toBuy),
    ]);

    const csv = [header, ...rows].map((cols) => cols.map(escapeCsv).join(",")).join("\n") + "\n";

    const storeCode = selectedStore?.code ?? "LOJA";
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");

    downloadTextFile(`lista-compras_${storeCode}_${y}-${m}-${d}.csv`, csv);
  }

  async function createOrder() {
    setError(null);

    if (!user) return setError("Você precisa estar logado.");
    if (!selectedStore) return setError("Selecione uma loja.");
    if (list.length === 0) return setError("Não há itens para comprar.");

    const ok = window.confirm(
      `Gerar pedido para a loja "${selectedStore.name}" com ${list.length} itens?`
    );
    if (!ok) return;

    setCreatingOrder(true);

    try {
      // 1) cria order
      const orderRef = await addDoc(collection(db, "orders"), {
        storeId: selectedStore.id,
        storeCode: selectedStore.code,
        storeName: selectedStore.name,
        status: "draft",
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      });

      // 2) grava subcoleção /orders/{id}/items
      const batch = writeBatch(db);

      for (const r of list) {
        batch.set(doc(db, "orders", orderRef.id, "items", r.itemId), {
          itemId: r.itemId,
          itemName: r.name, // snapshot
          unit: r.unit, // snapshot
          currentQty: r.currentQty,
          minQty: r.minQty,
          toBuy: r.toBuy,
          createdAt: serverTimestamp(),
        });
      }

      await batch.commit();

      window.location.href = `/orders/${orderRef.id}`;
    } catch (e: any) {
      setError(e?.message ?? "Erro ao gerar pedido.");
    } finally {
      setCreatingOrder(false);
    }
  }

  if (loadingAuth) return <p>Carregando...</p>;

  return (
    <Page
      title="Lista de Compras"
      description="Itens que precisam ser comprados baseado no estoque mínimo."
      right={
        <div className="flex gap-2">
          <Button variant="secondary" asChild>
            <a href="/dashboard">Voltar ao Dashboard</a>
          </Button>
          <Button variant="secondary" asChild>
            <a href="/inventory">Ir para Estoque</a>
          </Button>
          <Button variant="secondary" asChild>
            <a href="/orders">Pedidos</a>
          </Button>
        </div>
      }
    >
      {error && (
        <Alert variant="error">{error}</Alert>
      )}

      {loadingBase ? (
        <Alert variant="default">Carregando lojas e itens...</Alert>
      ) : stores.length === 0 ? (
        <Alert variant="warning">Cadastre pelo menos 1 loja em "Lojas".</Alert>
      ) : items.length === 0 ? (
        <Alert variant="warning">Cadastre itens em "Itens".</Alert>
      ) : (
        <>
          <Card>
            <CardBody>
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700">Loja</label>
                    <Select
                      value={selectedStoreId}
                      onChange={setSelectedStoreId}
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

                  {loadingInv && (
                    <div className="text-sm text-gray-600">Carregando estoque...</div>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    onClick={exportCsvWithMeta}
                    disabled={list.length === 0 || creatingOrder}
                  >
                    Exportar CSV
                  </Button>
                  <Button
                    variant="primary"
                    onClick={createOrder}
                    disabled={list.length === 0 || creatingOrder}
                  >
                    {creatingOrder ? "Gerando..." : "Gerar pedido"}
                  </Button>
                </div>
              </div>

              <div className="mt-4 text-sm text-gray-600">
                Itens para comprar: <strong>{list.length}</strong>
              </div>
            </CardBody>
          </Card>

          {list.length === 0 ? (
            <Alert variant="success">Nada para comprar (estoque ok para os mínimos definidos).</Alert>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Item
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Unid.
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Fornecedor
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Comprador
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {list.map((r) => (
                      <tr key={r.itemId}>
                        <td className="px-4 py-3 text-sm text-gray-900">{r.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{r.unit}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{r.supplier}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{r.buyer}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{r.currentQty}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{r.minQty}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.toBuy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </Page>
  );
}