import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase.client";

export async function ensureUserProfile(user: User) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      email: user.email ?? null,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
    return { created: true };
  }

  // atualiza último login sem sobrescrever o resto
  await setDoc(
    ref,
    { lastLoginAt: serverTimestamp() },
    { merge: true }
  );

  return { created: false };
}
