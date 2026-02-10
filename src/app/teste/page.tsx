"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase.client";
import { collection, getDocs } from "firebase/firestore";

export default function TestePage() {
  const [status, setStatus] = useState("Carregando...");

  useEffect(() => {
    async function run() {
      try {
        const snap = await getDocs(collection(db, "test"));
        setStatus(`✅ Firebase/Firestore OK. Docs: ${snap.size}`);
      } catch (e: any) {
        setStatus(`❌ Erro: ${e?.message ?? String(e)}`);
      }
    }
    run();
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1>Teste Firebase</h1>
      <p>{status}</p>
    </div>
  );
}
