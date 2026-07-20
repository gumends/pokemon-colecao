import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

import type { CardBrief, CollectionEntry, CollectionMap, CollectionStatus } from "@/lib/types";

type CollectionRow = {
  card_id: string;
  local_id: string;
  name: string;
  image: string | null;
  status: CollectionStatus;
  updated_at: string;
};

declare global {
  var __pokemonColecaoDb: Database.Database | undefined;
}

function getDbPath() {
  return path.join(process.cwd(), "data", "collection.db");
}

function createDb() {
  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS collection_cards (
      card_id TEXT PRIMARY KEY,
      local_id TEXT NOT NULL,
      name TEXT NOT NULL,
      image TEXT,
      status TEXT NOT NULL CHECK (status IN ('owned', 'wanted')),
      updated_at TEXT NOT NULL
    );
  `);

  return db;
}

export function getDb() {
  if (!globalThis.__pokemonColecaoDb) {
    globalThis.__pokemonColecaoDb = createDb();
  }
  return globalThis.__pokemonColecaoDb;
}

function rowToEntry(row: CollectionRow): CollectionEntry {
  return {
    card: {
      id: row.card_id,
      localId: row.local_id,
      name: row.name,
      image: row.image ?? undefined,
    },
    status: row.status,
    updatedAt: row.updated_at,
  };
}

export function listCollection(): CollectionMap {
  const rows = getDb()
    .prepare(
      `SELECT card_id, local_id, name, image, status, updated_at
       FROM collection_cards
       ORDER BY updated_at DESC`,
    )
    .all() as CollectionRow[];

  const map: CollectionMap = {};
  for (const row of rows) {
    map[row.card_id] = rowToEntry(row);
  }
  return map;
}

export function upsertCardStatus(
  card: CardBrief,
  status: CollectionStatus,
): CollectionEntry {
  const updatedAt = new Date().toISOString();

  getDb()
    .prepare(
      `INSERT INTO collection_cards (card_id, local_id, name, image, status, updated_at)
       VALUES (@card_id, @local_id, @name, @image, @status, @updated_at)
       ON CONFLICT(card_id) DO UPDATE SET
         local_id = excluded.local_id,
         name = excluded.name,
         image = excluded.image,
         status = excluded.status,
         updated_at = excluded.updated_at`,
    )
    .run({
      card_id: card.id,
      local_id: card.localId,
      name: card.name,
      image: card.image ?? null,
      status,
      updated_at: updatedAt,
    });

  return {
    card,
    status,
    updatedAt,
  };
}

export function deleteCardStatus(cardId: string): boolean {
  const result = getDb()
    .prepare(`DELETE FROM collection_cards WHERE card_id = ?`)
    .run(cardId);

  return result.changes > 0;
}
