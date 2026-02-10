"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase.client";

type Store = { id: string; name: string; code: string };
type Item = { id: string; name: string; unit: string };

type InventoryDoc = {
  storeId: string;
  itemId: string;
  currentQty: number;
  minQty: number;
};

function toNumber(value: string) {
  const cleaned = value.replace(",", ".").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function invId(storeId: string, itemId: string) {
  return `${storeId}_${itemId}`;
}

function normalizeSearch(s: string) {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function InventoryPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [stores, setStores] = useState<Store[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loadingBase, setLoadingBase] = useState(true);

  const [selectedStoreId, setSelectedStoreId] = useState<string>("");

  const [values, setValues] = useState<Record<string, { current: string; min: string }>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});

  const [savingAll, setSavingAll] = useState(false);
  const [zeroing, setZeroing] = useState(false);

  // auto-save por item
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  // UX
  const [search, setSearch] = useState("");
  const [countMode, setCountMode] = useState(false);
  const [dirtyFirst, setDirtyFirst] = useState(true);

  const currentRefs = useRef<Record<string, HTMLInputElement | null>>({});

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

    const q = query(collection(db, "inventory"), where("storeId", "==", selectedStoreId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const invMap: Record<string, InventoryDoc> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as InventoryDoc;
          invMap[data.itemId] = data;
        });

        const newValues: Record<string, { current: string; min: string }> = {};
        const newDirty: Record<string, boolean> = {};

        items.forEach((it) => {
          const inv = invMap[it.id];
          newValues[it.id] = {
            current: inv ? String(inv.currentQty) : "",
            min: inv ? String(inv.minQty) : "",
          };
          newDirty[it.id] = false;
        });

        setValues(newValues);
        setDirty(newDirty);
      },
      (err) => setError(err.message)
    );

    return unsub;
  }, [user, selectedStoreId, items]);

  // itens filtrados por busca
  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;

    const normalizedSearch = normalizeSearch(search);
    return items.filter((it) => normalizeSearch(it.name).includes(normalizedSearch));
  }, [items, search]);

  // itens ordenados (alterados primeiro ou não conferidos primeiro)
  const sortedItems = useMemo(() => {
    const list = [...filteredItems];

    if (dirtyFirst) {
      list.sort((a, b) => {
        const aDirty = dirty[a.id] || false;
        const bDirty = dirty[b.id] || false;
        if (aDirty !== bDirty) return aDirty ? -1 : 1;
        return (a.name ?? "").localeCompare(b.name ?? "");
      });
    } else {
      list.sort((a, b) => {
        const aCurrent = toNumber(values[a.id]?.current ?? "") ?? 0;
        const bCurrent = toNumber(values[b.id]?.current ?? "") ?? 0;
        if (aCurrent === 0 && bCurrent !== 0) return -1;
        if (aCurrent !== 0 && bCurrent === 0) return 1;
        return (a.name ?? "").localeCompare(b.name ?? "");
      });
    }

    return list;
  }, [filteredItems, dirtyFirst, dirty, values]);

  const selectedStore = useMemo(
    () => stores.find((s) => s.id === selectedStoreId) ?? null,
    [stores, selectedStoreId]
  );

  const hasDirty = useMemo(() => Object.values(dirty).some(Boolean), [dirty]);

  async function saveItem(itemId: string) {
    if (!selectedStoreId) return;

    setSavingItemId(itemId);
    setError(null);

    try {
      const v = values[itemId];
      if (!v) return;

      const currentQty = toNumber(v.current) ?? 0;
      const minQty = toNumber(v.min) ?? 0;

      await setDoc(
        doc(db, "inventory", invId(selectedStoreId, itemId)),
        {
          storeId: selectedStoreId,
          itemId,
          currentQty,
          minQty,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setDirty((prev) => ({ ...prev, [itemId]: false }));
    } catch (e: any) {
      setError(e?.message ?? "Erro ao salvar item.");
    } finally {
      setSavingItemId(null);
    }
  }

  async function saveAll() {
    if (!selectedStoreId) return;

    setSavingAll(true);
    setError(null);

    try {
      const batch = writeBatch(db);

      Object.entries(values).forEach(([itemId, v]) => {
        const currentQty = toNumber(v.current) ?? 0;
        const minQty = toNumber(v.min) ?? 0;

        batch.set(
          doc(db, "inventory", invId(selectedStoreId, itemId)),
          {
            storeId: selectedStoreId,
            itemId,
            currentQty,
            minQty,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });

      await batch.commit();

      setDirty({});
    } catch (e: any) {
      setError(e?.message ?? "Erro ao salvar tudo.");
    } finally {
      setSavingAll(false);
    }
  }

  async function zeroAll() {
    if (!selectedStoreId) return;

    if (!window.confirm("Zerar TODOS os estoques atuais desta loja?")) return;

    setZeroing(true);
    setError(null);

    try {
      const batch = writeBatch(db);

      items.forEach((it) => {
        batch.set(
          doc(db, "inventory", invId(selectedStoreId, it.id)),
          {
            storeId: selectedStoreId,
            itemId: it.id,
            currentQty: 0,
            minQty: toNumber(values[it.id]?.min ?? "") ?? 0,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });

      await batch.commit();

      setDirty({});
    } catch (e: any) {
      setError(e?.message ?? "Erro ao zerar estoques.");
    } finally {
      setZeroing(false);
    }
  }

  function handleValueChange(itemId: string, field: "current" | "min", value: string) {
    setValues((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));

    setDirty((prev) => ({ ...prev, [itemId]: true }));

    if (field === "current" && countMode && currentRefs.current[itemId]) {
      currentRefs.current[itemId]?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, itemId: string, field: "current" | "min") {
    if (e.key === "Enter") {
      if (field === "current" && countMode) {
        const nextIndex = sortedItems.findIndex((it) => it.id === itemId) + 1;
        if (nextIndex < sortedItems.length) {
          const nextItem = sortedItems[nextIndex];
          currentRefs.current[nextItem.id]?.focus();
        }
      } else {
        saveItem(itemId);
      }
    }
  }

  if (loadingAuth) return <p>Carregando...</p>;

  return (
    <div className="space-y-6">
      {/* Título + Descrição */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Estoque</h1>
        <p className="text-gray-600 mt-1">
          Gerencie o estoque atual e mínimos de cada item por loja.
        </p>
      </div>

      {/* Erro */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Loading base */}
      {loadingBase ? (
        <div className="bg-white rounded-lg border p-6">
          <p className="text-gray-600">Carregando lojas e itens...</p>
        </div>
      ) : stores.length === 0 ? (
        <div className="bg-white rounded-lg border p-6">
          <p className="text-gray-600">Cadastre pelo menos 1 loja em "Lojas".</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-lg border p-6">
          <p className="text-gray-600">Cadastre itens em "Itens".</p>
        </div>
      ) : (
        <>
          {/* Barra de Ações */}
          <div className="bg-white rounded-lg border p-4">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              {/* Seleção de Loja */}
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700">Loja:</label>
                <select
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={!canInteract}
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Busca + Filtros */}
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="Buscar item..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
                />

                <div className="flex gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={countMode}
                      onChange={(e) => setCountMode(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Modo contagem
                  </label>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={dirtyFirst}
                      onChange={(e) => setDirtyFirst(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Alterados primeiro
                  </label>
                </div>
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="flex gap-3 mt-4">
              <button
                onClick={saveAll}
                disabled={!hasDirty || savingAll || !canInteract}
                className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingAll ? "Salvando..." : "Salvar tudo"}
              </button>

              <button
                onClick={zeroAll}
                disabled={zeroing || !canInteract}
                className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {zeroing ? "Zerando..." : "Zerar estoques"}
              </button>
            </div>
          </div>

          {/* Tabela */}
          <div className="bg-white rounded-lg border overflow-hidden">
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
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sortedItems.map((it) => {
                    const v = values[it.id] ?? { current: "", min: "" };
                    const isDirty = dirty[it.id] || false;
                    const isSaving = savingItemId === it.id;
                    const currentNum = toNumber(v.current) ?? 0;
                    const minNum = toNumber(v.min) ?? 0;
                    const status = currentNum < minNum ? "Baixo" : "Ok";

                    return (
                      <tr key={it.id} className={isDirty ? "bg-yellow-50" : ""}>
                        <td className="px-4 py-3 text-sm text-gray-900">{it.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{it.unit}</td>
                        <td className="px-4 py-3">
                          <input
                            ref={(el) => (currentRefs.current[it.id] = el)}
                            type="number"
                            step="0.01"
                            value={v.current}
                            onChange={(e) => handleValueChange(it.id, "current", e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, it.id, "current")}
                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="0"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            step="0.01"
                            value={v.min}
                            onChange={(e) => handleValueChange(it.id, "min", e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, it.id, "min")}
                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="0"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                              status === "Baixo"
                                ? "bg-red-100 text-red-800"
                                : "bg-green-100 text-green-800"
                            }`}
                          >
                            {status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => saveItem(it.id)}
                            disabled={isSaving || !canInteract}
                            className="bg-green-600 text-white px-3 py-1 rounded-md text-xs font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isSaving ? "Salvando..." : "Salvar"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}