export type CollectionStatus = "owned" | "wanted";

export type CardBrief = {
  id: string;
  localId: string;
  name: string;
  image?: string;
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
