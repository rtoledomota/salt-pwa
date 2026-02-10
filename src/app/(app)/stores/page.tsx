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
import { Page, Card, CardBody, Button, Input, Alert } from "@/components/ui/Page";

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
    <Page
      title="Itens"
      description="Gerencie os itens cadastrados no sistema."
      right={
        <Button variant="secondary" asChild>
          <a href="/dashboard">Voltar ao Dashboard</a>
        </Button>
      }
    >
      {error && (
        <Alert variant="error">{error}</Alert>
      )}

      <Card>
        <CardBody>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <Input
                value={name}
                onChange={setName}
                placeholder="Nome do item (ex: Tomate)"
                disabled={!canInteract || saving}
                className="sm:col-span-2"
              />
              <Input
                value={unit}
                onChange={setUnit}
                placeholder="Unidade (ex: kg, un, cx)"
                disabled={!canInteract || saving}
              />
              <Input
                value={supplier}
                onChange={setSupplier}
                placeholder="Fornecedor (opcional)"
                disabled={!canInteract || saving}
              />
              <Button
                type="submit"
                disabled={!canInteract || saving}
                className="w-full"
              >
                {saving ? "Salvando..." : "Adicionar"}
              </Button>
            </div>
            <Input
              value={buyer}
              onChange={setBuyer}
              placeholder="Comprador resp. (opcional)"
              disabled={!canInteract || saving}
              className="max-w-md"
            />
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Lista de Itens</h2>

          {loadingItems ? (
            <p className="text-gray-600">Carregando itens...</p>
          ) : items.length === 0 ? (
            <Alert variant="default">Nenhum item cadastrado ainda.</Alert>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const isEditing = editingId === item.id;
                const isBusy = busyId === item.id;

                return (
                  <Card key={item.id}>
                    <CardBody>
                      {isEditing ? (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <Input
                              value={editingName}
                              onChange={setEditingName}
                              placeholder="Nome do item"
                              disabled={isBusy}
                              className="sm:col-span-2"
                              autoFocus
                            />
                            <Input
                              value={editingUnit}
                              onChange={setEditingUnit}
                              placeholder="Unidade"
                              disabled={isBusy}
                            />
                            <Input
                              value={editingSupplier}
                              onChange={setEditingSupplier}
                              placeholder="Fornecedor"
                              disabled={isBusy}
                            />
                            <Input
                              value={editingBuyer}
                              onChange={setEditingBuyer}
                              placeholder="Comprador"
                              disabled={isBusy}
                            />
                          </div>
                          <div className="flex gap-3">
                            <Button
                              variant="success"
                              onClick={() => saveEdit(item.id)}
                              disabled={isBusy}
                            >
                              {isBusy ? "Salvando..." : "Salvar"}
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={cancelEdit}
                              disabled={isBusy}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                          <div>
                            <div className="font-medium text-gray-900">{item.name}</div>
                            <div className="text-sm text-gray-600">
                              Unidade: {item.unit}
                              {item.supplier && ` • Fornecedor: ${item.supplier}`}
                              {item.buyer && ` • Comprador: ${item.buyer}`}
                            </div>
                          </div>
                          <div className="flex gap-3">
                            <Button
                              variant="secondary"
                              onClick={() => startEdit(item)}
                              disabled={isBusy}
                            >
                              Editar
                            </Button>
                            <Button
                              variant="danger"
                              onClick={() => removeItem(item)}
                              disabled={isBusy}
                            >
                              {isBusy ? "Excluindo..." : "Excluir"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>
    </Page>
  );
}