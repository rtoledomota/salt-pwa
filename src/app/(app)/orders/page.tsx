"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase.client";
import { Page, Card, CardBody, Button, Alert } from "@/components/ui/Page";

type Order = {
  storeId: string;
  storeName?: string;
  storeCode?: string;
  status: "draft" | "sent" | "received";
  createdAt?: any;
};

type OrderItem = {
  itemId: string;
  itemName: string;
  unit: string;
  currentQty: number;
  minQty: number;
  toBuy: number;
};

function formatDate(ts: any) {
  try {
    const d = ts?.toDate?.();
    if (!d) return "";
    return d.toLocaleString();
  } catch {
    return "";
  }
}

function invId(storeId: string, itemId: string) {
  return `${storeId}_${itemId}`;
}

function escapeCsv(value: string) {
  if (/[,"\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
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

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params?.id;

  const [loadingAuth, setLoadingAuth] = useState(true);

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setLoadingAuth(false);
      if (!u) window.location.href = "/login";
    });
    return unsubAuth;
  }, []);

  useEffect(() => {
    if (!orderId) return;

    const unsub = onSnapshot(
      doc(db, "orders", orderId),
      (snap) => {
        if (!snap.exists()) {
          setOrder(null);
          return;
        }
        setOrder(snap.data() as any);
      },
      (err) => setError(err.message)
    );

    return unsub;
  }, [orderId]);

  useEffect(() => {
    if (!orderId) return;

    const unsub = onSnapshot(
      collection(db, "orders", orderId, "items"),
      (snap) => {
        const list: OrderItem[] = snap.docs.map((d) => d.data() as any);
        list.sort((a, b) => (a.itemName ?? "").localeCompare(b.itemName ?? ""));
        setItems(list);
      },
      (err) => setError(err.message)
    );

    return unsub;
  }, [orderId]);

  const totalToBuy = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.toBuy) || 0), 0),
    [items]
  );

  async function setStatus(newStatus: Order["status"]) {
    setError(null);
    if (!orderId) return;

    setBusy(true);
    try {
      await updateDoc(doc(db, "orders", orderId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (e: any) {
      setError(e?.message ?? "Erro ao atualizar status.");
    } finally {
      setBusy(false);
    }
  }

  async function receiveAndUpdateInventory() {
    setError(null);
    if (!orderId || !order) return;

    if (order.status === "received") {
      setError("Este pedido já está como recebido.");
      return;
    }

    const ok = window.confirm(
      "Marcar como RECEBIDO e somar as quantidades compradas no estoque atual desta loja?"
    );
    if (!ok) return;

    setBusy(true);

    try {
      await runTransaction(db, async (tx) => {
        const orderRef = doc(db, "orders", orderId);
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists()) throw new Error("Pedido não encontrado.");

        const orderData = orderSnap.data() as Order;
        if (orderData.status === "received") return;

        const orderItemsSnap = await getDocs(collection(db, "orders", orderId, "items"));

        for (const d of orderItemsSnap.docs) {
          const it = d.data() as OrderItem;
          const toBuy = Number(it.toBuy) || 0;
          if (toBuy <= 0) continue;

          const invRef = doc(db, "inventory", invId(orderData.storeId, it.itemId));
          const invSnap = await tx.get(invRef);

          const currentQty = (invSnap.exists() ? Number((invSnap.data() as any).currentQty) : 0) || 0;
          const minQty = (invSnap.exists() ? Number((invSnap.data() as any).minQty) : 0) || 0;

          tx.set(
            invRef,
            {
              storeId: orderData.storeId,
              itemId: it.itemId,
              currentQty: currentQty + toBuy,
              minQty,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }

        tx.update(orderRef, {
          status: "received",
          receivedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
    } catch (e: any) {
      setError(e?.message ?? "Erro ao receber e atualizar estoque.");
    } finally {
      setBusy(false);
    }
  }

  async function exportOrderCsvWithMeta() {
    if (!order) return;

    // busca supplier/buyer do catálogo items
    const uniqueIds = Array.from(new Set(items.map((i) => i.itemId)));

    const metas = await Promise.all(
      uniqueIds.map(async (itemId) => {
        const snap = await getDoc(doc(db, "items", itemId));
        const data = snap.exists() ? (snap.data() as any) : null;
        return {
          itemId,
          supplier: data?.supplier ? String(data.supplier) : "",
          buyer: data?.buyer ? String(data.buyer) : "",
        };
      })
    );

    const metaById = new Map<string, { supplier: string; buyer: string }>();
    for (const m of metas) metaById.set(m.itemId, { supplier: m.supplier, buyer: m.buyer });

    const header = ["Item", "Unidade", "Fornecedor", "Comprador", "Atual", "Minimo", "Comprar"];
    const rows = items.map((r) => {
      const meta = metaById.get(r.itemId) ?? { supplier: "", buyer: "" };
      return [
        r.itemName,
        r.unit,
        meta.supplier,
        meta.buyer,
        String(r.currentQty ?? 0),
        String(r.minQty ?? 0),
        String(r.toBuy ?? 0),
      ];
    });

    const csv = [header, ...rows].map((cols) => cols.map(escapeCsv).join(",")).join("\n") + "\n";

    const code = order.storeCode ?? "LOJA";
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");

    downloadTextFile(`pedido_${code}_${orderId}_${y}-${m}-${d}.csv`, csv);
  }

  if (loadingAuth) return <p>Carregando...</p>;
  if (!orderId) return <p>Pedido inválido.</p>;
  if (!order) return <p>Carregando pedido...</p>;

  return (
    <Page
      title="Pedido"
      description={`Detalhes do pedido ${orderId} - ${order.storeName ?? "Loja"}`}
      right={
        <div className="flex gap-2">
          <Button variant="secondary" asChild>
            <a href="/orders">Voltar para Pedidos</a>
          </Button>
          <Button variant="secondary" asChild>
            <a href="/shopping-list">Lista de Compras</a>
          </Button>
        </div>
      }
    >
      {error && (
        <Alert variant="error">{error}</Alert>
      )}

      <Card>
        <CardBody>
          <div className="space-y-4">
            <div>
              <div className="font-semibold text-lg text-gray-900">
                {order.storeName ?? "Loja"} {order.storeCode ? `(${order.storeCode})` : ""}
              </div>
              <div className="text-sm text-gray-600">Criado em: {formatDate(order.createdAt)}</div>
              <div className="mt-2">
                Status: <span className="font-medium">{order.status}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => setStatus("draft")}
                disabled={busy}
              >
                Marcar rascunho
              </Button>
              <Button
                variant="secondary"
                onClick={() => setStatus("sent")}
                disabled={busy}
              >
                Marcar enviado
              </Button>
              <Button
                variant="primary"
                onClick={receiveAndUpdateInventory}
                disabled={busy}
              >
                Marcar recebido + atualizar estoque
              </Button>
              <Button
                variant="success"
                onClick={exportOrderCsvWithMeta}
                disabled={items.length === 0}
              >
                Exportar CSV do pedido
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Itens</h2>
          <p className="text-gray-600 mt-1">
            Total (soma de "comprar"): <strong>{totalToBuy}</strong>
          </p>
        </div>

        {items.length === 0 ? (
          <Alert variant="default">Nenhum item no pedido.</Alert>
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
                  {items.map((r) => (
                    <tr key={r.itemId}>
                      <td className="px-4 py-3 text-sm text-gray-900">{r.itemName}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{r.unit}</td>
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
      </div>
    </Page>
  );
}