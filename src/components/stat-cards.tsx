type StatCardsProps = {
  owned: number;
  wanted: number;
};

export function StatCards({ owned, wanted }: StatCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      <div className="rounded-2xl border border-border/80 bg-card/90 px-4 py-5 shadow-sm ring-1 ring-foreground/5 sm:px-6">
        <p className="text-sm text-muted-foreground">Tenho</p>
        <p className="mt-1 font-heading text-3xl font-semibold tracking-tight text-emerald-800 sm:text-4xl">
          {owned}
        </p>
      </div>
      <div className="rounded-2xl border border-border/80 bg-card/90 px-4 py-5 shadow-sm ring-1 ring-foreground/5 sm:px-6">
        <p className="text-sm text-muted-foreground">Preciso</p>
        <p className="mt-1 font-heading text-3xl font-semibold tracking-tight text-amber-700 sm:text-4xl">
          {wanted}
        </p>
      </div>
    </div>
  );
}
