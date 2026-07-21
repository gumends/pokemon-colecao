export type CollectionStatus = "owned" | "wanted";

export type CardVariant = "normal" | "reverse" | "holo" | "firstEdition";

export type CardBrief = {
  /** Chave única na coleção: `{tcgdexId}::{variant}` */
  id: string;
  /** ID original na TCGdex (ex.: me04-001) */
  tcgdexId: string;
  localId: string;
  name: string;
  image?: string;
  variant: CardVariant;
  /** Tipos do Pokémon (ex.: Planta, Fogo). Vazio para Treinador/Energia. */
  types?: string[];
};

export type CardVariantsFlags = {
  firstEdition?: boolean;
  holo?: boolean;
  normal?: boolean;
  reverse?: boolean;
  wPromo?: boolean;
};

export type TcgdexCardDetail = {
  id: string;
  localId: string;
  name: string;
  image?: string;
  types?: string[];
  variants?: CardVariantsFlags;
  variants_detailed?: Array<{ type?: string }>;
  pricing?: {
    tcgplayer?: Record<string, unknown>;
  };
};

export type SerieBrief = {
  id: string;
  name: string;
  logo?: string;
};

export type SetBrief = {
  id: string;
  name: string;
  logo?: string;
  symbol?: string;
  cardCount: {
    total: number;
    official: number;
  };
};

export type SetDetail = SetBrief & {
  cards: CardBrief[];
  releaseDate?: string;
  serie?: SerieBrief;
};

export type CollectionEntry = {
  card: CardBrief;
  status: CollectionStatus;
  updatedAt: string;
};

export type CollectionMap = Record<string, CollectionEntry>;

export const VARIANT_LABELS: Record<CardVariant, string> = {
  normal: "Normal",
  reverse: "Reverse",
  holo: "Holo",
  firstEdition: "1ª Edição",
};
