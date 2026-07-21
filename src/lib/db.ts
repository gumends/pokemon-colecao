import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

import type {
  CardBrief,
  CardVariant,
  CollectionEntry,
  CollectionMap,
  CollectionStatus,
} from "@/lib/types";
import { collectionCardId } from "@/lib/tcgdex";

type CollectionRow = {
  entry_id: string;
  tcgdex_id: string;
  local_id: string;
  name: string;
  image: string | null;
  variant: CardVariant;
  types: string | null;
  status: CollectionStatus;
  updated_at: string;
};

declare global {
  var __pokemonColecaoDb: Database.Database | undefined;
}

function getDbPath() {
  return path.join(process.cwd(), "data", "collection.db");
}

function migrate(db: Database.Database) {
  const columns = db
    .prepare(`PRAGMA table_info(collection_cards)`)
    .all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));

  if (names.size === 0) {
    db.exec(`
      CREATE TABLE collection_cards (
        entry_id TEXT PRIMARY KEY,
        tcgdex_id TEXT NOT NULL,
        local_id TEXT NOT NULL,
        name TEXT NOT NULL,
        image TEXT,
        variant TEXT NOT NULL CHECK (variant IN ('normal', 'reverse', 'holo', 'firstEdition')),
        types TEXT,
        status TEXT NOT NULL CHECK (status IN ('owned', 'wanted')),
        updated_at TEXT NOT NULL
      );
    `);
    return;
  }

  if (!names.has("entry_id")) {
    db.exec(`
      CREATE TABLE collection_cards_v2 (
        entry_id TEXT PRIMARY KEY,
        tcgdex_id TEXT NOT NULL,
        local_id TEXT NOT NULL,
        name TEXT NOT NULL,
        image TEXT,
        variant TEXT NOT NULL CHECK (variant IN ('normal', 'reverse', 'holo', 'firstEdition')),
        status TEXT NOT NULL CHECK (status IN ('owned', 'wanted')),
        updated_at TEXT NOT NULL
      );

      INSERT INTO collection_cards_v2 (
        entry_id, tcgdex_id, local_id, name, image, variant, status, updated_at
      )
      SELECT
        card_id || '::normal',
        card_id,
        local_id,
        name,
        image,
        'normal',
        status,
        updated_at
      FROM collection_cards;

      DROP TABLE collection_cards;
      ALTER TABLE collection_cards_v2 RENAME TO collection_cards;
    `);
  }

  if (!names.has("types") && names.size > 0) {
    db.exec(`ALTER TABLE collection_cards ADD COLUMN types TEXT;`);
  }
}

function createDb() {
  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

export function getDb() {
  if (!globalThis.__pokemonColecaoDb) {
    globalThis.__pokemonColecaoDb = createDb();
  } else {
    migrate(globalThis.__pokemonColecaoDb);
  }
  return globalThis.__pokemonColecaoDb;
}

function parseTypes(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : undefined;
  } catch {
    return undefined;
  }
}

function rowToEntry(row: CollectionRow): CollectionEntry {
  return {
    card: {
      id: row.entry_id,
      tcgdexId: row.tcgdex_id,
      localId: row.local_id,
      name: row.name,
      image: row.image ?? undefined,
      variant: row.variant,
      types: parseTypes(row.types),
    },
    status: row.status,
    updatedAt: row.updated_at,
  };
}

export function listCollection(): CollectionMap {
  const rows = getDb()
    .prepare(
      `SELECT entry_id, tcgdex_id, local_id, name, image, variant, types, status, updated_at
       FROM collection_cards
       ORDER BY updated_at DESC`,
    )
    .all() as CollectionRow[];

  const map: CollectionMap = {};
  for (const row of rows) {
    map[row.entry_id] = rowToEntry(row);
  }
  return map;
}

export function upsertCardStatus(
  card: CardBrief,
  status: CollectionStatus,
): CollectionEntry {
  const updatedAt = new Date().toISOString();
  const variant = card.variant ?? "normal";
  const tcgdexId = card.tcgdexId ?? card.id.split("::")[0];
  const entryId = card.id.includes("::")
    ? card.id
    : collectionCardId(tcgdexId, variant);

  getDb()
    .prepare(
      `INSERT INTO collection_cards (
         entry_id, tcgdex_id, local_id, name, image, variant, types, status, updated_at
       )
       VALUES (
         @entry_id, @tcgdex_id, @local_id, @name, @image, @variant, @types, @status, @updated_at
       )
       ON CONFLICT(entry_id) DO UPDATE SET
         tcgdex_id = excluded.tcgdex_id,
         local_id = excluded.local_id,
         name = excluded.name,
         image = excluded.image,
         variant = excluded.variant,
         types = COALESCE(excluded.types, collection_cards.types),
         status = excluded.status,
         updated_at = excluded.updated_at`,
    )
    .run({
      entry_id: entryId,
      tcgdex_id: tcgdexId,
      local_id: card.localId,
      name: card.name,
      image: card.image ?? null,
      variant,
      types: card.types?.length ? JSON.stringify(card.types) : null,
      status,
      updated_at: updatedAt,
    });

  const normalized: CardBrief = {
    ...card,
    id: entryId,
    tcgdexId,
    variant,
  };

  return {
    card: normalized,
    status,
    updatedAt,
  };
}

export function updateCardTypes(entryId: string, types: string[]): void {
  getDb()
    .prepare(`UPDATE collection_cards SET types = ? WHERE entry_id = ?`)
    .run(JSON.stringify(types), entryId);
}

export function deleteCardStatus(entryId: string): boolean {
  const result = getDb()
    .prepare(`DELETE FROM collection_cards WHERE entry_id = ?`)
    .run(entryId);

  return result.changes > 0;
}
