"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  type DocumentReference,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase.client";

type Item = {
  id: string;
  name: string;
  unit: string;
  supplier?: string | null;
  buyer?: string | null;
  createdAt?: any;
  createdBy?: string;
};

function normalizeName(input: string) {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export default function ItemsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);

  // criar
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [supplier, setSupplier] = useState("");
  const [buyer, setBuyer] = useState("");
  const [saving, setSaving] = useState(false);

  // editar
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingUnit, setEditingUnit] = useState("");
  const [editingSupplier, setEditingSupplier] = useState("");
  const [editingBuyer, setEditingBuyer] = useState("");

  const [busyId, setBusyId] = useState<string | null>(null);
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

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "items"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Item[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));
        setItems(list);
        setLoadingItems(false);
      },
      (err) => {
        setError(err.message);
        setLoadingItems(false);
      }
    );

    return unsub;
  }, [user]);

  function startEdit(item: Item) {
    setError(null);
    setEditingId(item.id);
    setEditingName(item.name);
    setEditingUnit(item.unit);
    setEditingSupplier(item.supplier ?? "");
    setEditingBuyer(item.buyer ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
    setEditingUnit("");
    setEditingSupplier("");
    setEditingBuyer("");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!user) {
      setError("Você precisa estar logado.");
      return;
    }

    const trimmedName = name.trim();
    const trimmedUnit = unit.trim();

    if (!trimmedName) return setError("Informe o nome do item.");
    if (!trimmedUnit) return setError("Informe a unidade (ex: kg, un, cx).");

    const nameKey = normalizeName(trimmedName);

    setSaving(true);
    try {
      await runTransaction(db, async (tx) => {
        const nameIndexRef = doc(db, "itemNameIndex", nameKey);
        const itemRef = doc(collection(db, "items")) as DocumentReference;

        const nameSnap = await tx.get(nameIndexRef);
        if (nameSnap.exists()) throw new Error("Já existe um item com esse nome.");

        tx.set(itemRef, {
          name: trimmedName,
          unit: trimmedUnit,
          supplier: supplier.trim() ? supplier.trim() : null,
          buyer: buyer.trim() ? buyer.trim() : null,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        });

        tx.set(nameIndexRef, { itemId: itemRef.id, createdAt: serverTimestamp() });
      });

      setName("");
      setUnit("");
      setSupplier("");
      setBuyer("");
    } catch (err: any) {
      setError(err?.message ?? "Erro ao criar item.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(itemId: string) {
    setError(null);

    const trimmedName = editingName.trim();
    const trimmedUnit = editingUnit.trim();

    if (!trimmedName) return setError("O nome não pode ficar vazio.");
    if (!trimmedUnit) return setError("A unidade não pode ficar vazia.");

    const current = items.find((i) => i.id === itemId);
    if (!current) return setError("Item não encontrado em memória. Recarregue a página.");

    const newKey = normalizeName(trimmedName);
    const oldKey = normalizeName(current.name);

    setBusyId(itemId);

    try {
      await runTransaction(db, async (tx) => {
        const itemRef = doc(db, "items", itemId);

        if (newKey !== oldKey) {
          const newIndexRef = doc(db, "itemNameIndex", newKey);
          const snap = await tx.get(newIndexRef);
          if (snap.exists()) throw new Error("Já existe um item com esse nome.");

          tx.delete(doc(db, "itemNameIndex", oldKey));
          tx.set(newIndexRef, { itemId, updatedAt: serverTimestamp() });
        }

        tx.update(itemRef, {
          name: trimmedName,
          unit: trimmedUnit,
          supplier: editingSupplier.trim() ? editingSupplier.trim() : null,
          buyer: editingBuyer.trim() ? editingBuyer.trim() : null,
        });
      });

      cancelEdit();
    } catch (err: any) {
      setError(err?.message ?? "Erro ao salvar item.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeItem(item: Item) {
    setError(null);

    const ok = window.confirm(`Excluir o item "${item.name}"?`);
    if (!ok) return;

    const key = normalizeName(item.name);

    setBusyId(item.id);
    try {
      await runTransaction(db, async (tx) => {
        tx.delete(doc(db, "items", item.id));
        tx.delete(doc(db, "itemNameIndex", key));
      });

      if (editingId === item.id) cancelEdit();
    } catch (err: any) {
      setError(err?.message ?? "Erro ao excluir item.");
    } finally {
      setBusyId(null);
    }
  }

  if (loadingAuth) return <p>Carregando...</p>;

  return (
    <div style={{ padding: 24, maxWidth: 1000 }}>
      <h1>Itens</h1>

      <p style={{ marginTop: 8 }}>
        <a href="/dashboard">Voltar ao Dashboard</a>
      </p>

      <form onSubmit={handleCreate} style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do item (ex: Tomate)"
          style={{ flex: 2, minWidth: 260, padding: "10px 12px" }}
          disabled={!canInteract || saving}
        />
        <input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="Unidade (ex: kg, un, cx)"
          style={{ flex: 1, minWidth: 160, padding: "10px 12px" }}
          disabled={!canInteract || saving}
        />
        <input
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          placeholder="Fornecedor (opcional)"
          style={{ flex: 1, minWidth: 200, padding: "10px 12px" }}
          disabled={!canInteract || saving}
        />
        <input
          value={buyer}
          onChange={(e) => setBuyer(e.target.value)}
          placeholder="Comprador resp. (opcional)"
          style={{ flex: 1, minWidth: 220, padding: "10px 12px" }}
          disabled={!canInteract || saving}
        />
        <button disabled={!canInteract || saving} style={{ padding: "10px 14px" }}>
          {saving ? "Salvando..." : "Adicionar"}
        </button>
      </form>

      {error && <p style={{ color: "crimson", marginTop: 12 }}>{error}</p>}

      <h2 style={{ marginTop: 24 }}>Lista</h2>

      {loadingItems ? (
        <p>Carregando itens...</p>
      ) : items.length === 0 ? (
        <p>Nenhum item cadastrado ainda.</p>
      ) : (
        <ul style={{ marginTop: 8, paddingLeft: 18 }}>
          {items.map((i) => {
            const isEditing = editingId === i.id;
            const isBusy = busyId === i.id;

            return (
              <li key={i.id} style={{ marginBottom: 12 }}>
                {isEditing ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      style={{ flex: 2, minWidth: 240, padding: "8px 10px" }}
                      disabled={isBusy}
                      autoFocus
                    />
                    <input
                      value={editingUnit}
                      onChange={(e) => setEditingUnit(e.target.value)}
                      style={{ flex: 1, minWidth: 140, padding: "8px 10px" }}
                      disabled={isBusy}
                    />
                    <input
                      value={editingSupplier}
                      onChange={(e) => setEditingSupplier(e.target.value)}
                      style={{ flex: 1, minWidth: 200, padding: "8px 10px" }}
                      disabled={isBusy}
                      placeholder="Fornecedor"
                    />
                    <input
                      value={editingBuyer}
                      onChange={(e) => setEditingBuyer(e.target.value)}
                      style={{ flex: 1, minWidth: 200, padding: "8px 10px" }}
                      disabled={isBusy}
                      placeholder="Comprador resp."
                    />
                    <button type="button" onClick={() => saveEdit(i.id)} disabled={isBusy} style={{ padding: "8px 12px" }}>
                      {isBusy ? "Salvando..." : "Salvar"}
                    </button>
                    <button type="button" onClick={cancelEdit} disabled={isBusy} style={{ padding: "8px 12px" }}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ flex: 2, minWidth: 240 }}>
                      {i.name} <span style={{ color: "#666" }}>({i.unit})</span>
                      {i.supplier ? <span style={{ color: "#666" }}> — Forn: {i.supplier}</span> : null}
                      {i.buyer ? <span style={{ color: "#666" }}> — Comp: {i.buyer}</span> : null}
                    </span>

                    <button type="button" onClick={() => startEdit(i)} disabled={isBusy} style={{ padding: "6px 10px" }}>
                      Editar
                    </button>

                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      disabled={isBusy}
                      style={{ padding: "6px 10px", background: "#ffe3e3" }}
                    >
                      {isBusy ? "Excluindo..." : "Excluir"}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
