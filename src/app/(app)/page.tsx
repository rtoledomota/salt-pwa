"use client";

import { useEffect } from "react";

export default function AppHome() {
  useEffect(() => {
    window.location.href = "/dashboard";
  }, []);

  return null;
}