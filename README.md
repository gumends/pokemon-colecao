# PokéColeção

Base de um gerenciador de coleção de cartas Pokémon TCG.

## Stack

- Next.js (App Router) + Route Handlers
- shadcn/ui
- SQLite (`better-sqlite3`) em `data/collection.db`
- [TCGdex API](https://tcgdex.dev/) para catálogo (PT-BR)

## O que já funciona

- Navegação por expansões/coleções
- Busca de cartas pelo nome (TCGdex)
- Marcar cartas como **Tenho** ou **Preciso**
- Persistência local via API + SQLite

## API

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/collection` | Lista a coleção |
| `PUT` | `/api/collection` | Salva/atualiza carta (`owned` ou `wanted`) |
| `DELETE` | `/api/collection?cardId=...` | Remove da coleção |

## Rodar

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

O arquivo SQLite é criado automaticamente em `data/collection.db` (ignorado pelo git).
