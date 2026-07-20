"use client";

import { useSyncExternalStore } from "react";

import {
  countByStatus,
  readCollection,
  setCardStatus,
  writeCollection,
} from "@/lib/collection-store";
import type { CardBrief, CollectionMap, CollectionStatus } from "@/lib/types";

type Listener = () => void;

let memoryCollection: CollectionMap = {};
let hydrated = false;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  memoryCollection = readCollection();
  hydrated = true;
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): CollectionMap {
  ensureHydrated();
  return memoryCollection;
}

function getServerSnapshot(): CollectionMap {
  return {};
}

function commit(next: CollectionMap) {
  memoryCollection = next;
  writeCollection(next);
  emit();
}

export function useCollection() {
  const collection = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const counts = countByStatus(collection);

  function updateStatus(card: CardBrief, status: CollectionStatus | null) {
    commit(setCardStatus(collection, card, status));
  }

  function getStatus(cardId: string): CollectionStatus | null {
    return collection[cardId]?.status ?? null;
  }

  const owned = Object.values(collection).filter((e) => e.status === "owned");
  const wanted = Object.values(collection).filter((e) => e.status === "wanted");

  return {
    collection,
    owned,
    wanted,
    counts,
    getStatus,
    updateStatus,
  };
}
