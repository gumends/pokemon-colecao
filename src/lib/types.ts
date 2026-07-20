export type CollectionStatus = "owned" | "wanted";

export type CardBrief = {
  id: string;
  localId: string;
  name: string;
  image?: string;
};

export type CollectionEntry = {
  card: CardBrief;
  status: CollectionStatus;
  updatedAt: string;
};

export type CollectionMap = Record<string, CollectionEntry>;
