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
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <h1>Pedido</h1>

      <p style={{ marginTop: 8 }}>
        <a href="/orders">Voltar para Pedidos</a>
        {" | "}
        <a href="/shopping-list">Lista de Compras</a>
      </p>

      {error && <p style={{ color: "crimson", marginTop: 12 }}>{error}</p>}

      <div style={{ marginTop: 16, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
        <div style={{ fontWeight: 700 }}>
          {order.storeName ?? "Loja"} {order.storeCode ? `(${order.storeCode})` : ""}
        </div>
        <div style={{ color: "#666" }}>Criado em: {formatDate(order.createdAt)}</div>
        <div style={{ marginTop: 8 }}>
          Status: <b>{order.status}</b>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => setStatus("draft")} disabled={busy}>
            Marcar rascunho
          </button>
          <button onClick={() => setStatus("sent")} disabled={busy}>
            Marcar enviado
          </button>
          <button onClick={receiveAndUpdateInventory} disabled={busy}>
            Marcar recebido + atualizar estoque
          </button>
          <button onClick={exportOrderCsvWithMeta} disabled={items.length === 0}>
            Exportar CSV do pedido
          </button>
        </div>
      </div>

      <h2 style={{ marginTop: 20 }}>Itens</h2>
      <p style={{ color: "#666" }}>
        Total (soma de “comprar”): <b>{totalToBuy}</b>
      </p>

      {items.length === 0 ? (
        <p>Nenhum item no pedido.</p>
      ) : (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", fontWeight: 600, padding: "8px 0", borderBottom: "1px solid #ddd" }}>
            <div style={{ flex: 3, minWidth: 260 }}>Item</div>
            <div style={{ flex: 1, minWidth: 120 }}>Unid.</div>
            <div style={{ flex: 1, minWidth: 160 }}>Atual</div>
            <div style={{ flex: 1, minWidth: 160 }}>Mínimo</div>
            <div style={{ flex: 1, minWidth: 160 }}>Comprar</div>
          </div>

          {items.map((r) => (
            <div
              key={r.itemId}
              style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}
            >
              <div style={{ flex: 3, minWidth: 260 }}>{r.itemName}</div>
              <div style={{ flex: 1, minWidth: 120, color: "#666" }}>{r.unit}</div>
              <div style={{ flex: 1, minWidth: 160 }}>{r.currentQty}</div>
              <div style={{ flex: 1, minWidth: 160 }}>{r.minQty}</div>
              <div style={{ flex: 1, minWidth: 160, fontWeight: 700 }}>{r.toBuy}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}