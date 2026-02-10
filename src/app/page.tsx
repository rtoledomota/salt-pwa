"use client";

import { useEffect } from "react";
import { auth } from "@/lib/firebase.client";
import { onAuthStateChanged } from "firebase/auth";

export default function HomePage() {
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        window.location.href = "/dashboard";
      } else {
        window.location.href = "/login";
      }
    });
    return unsubscribe;
  }, []);

  return <p>Redirecionando...</p>;
}
