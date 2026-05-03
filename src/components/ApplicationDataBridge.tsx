"use client";

import { useEffect } from "react";

import { useApplicationStore } from "@/features/applications/store";

export function ApplicationDataBridge() {
  useEffect(() => {
    const store = useApplicationStore.getState();

    void store.initializeDatabase();
    const unsubscribe = store.subscribeToDatabase();

    return unsubscribe;
  }, []);

  return null;
}
