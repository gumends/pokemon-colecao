"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type AppTab = "sets" | "owned" | "wanted" | "friend" | "scan";

function isAppTab(value: string | null): value is AppTab {
  return (
    value === "sets" ||
    value === "owned" ||
    value === "wanted" ||
    value === "friend" ||
    value === "scan"
  );
}

export function useCollectionUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  const tab: AppTab = isAppTab(tabParam) ? tabParam : "sets";
  const setId = searchParams.get("set");
  const query = searchParams.get("q") ?? "";
  const serie = searchParams.get("serie") ?? "all";
  const friendCode = searchParams.get("friend") ?? "";

  const replaceParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }

      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setTab = useCallback(
    (nextTab: AppTab) => {
      replaceParams({
        tab: nextTab === "sets" ? null : nextTab,
      });
    },
    [replaceParams],
  );

  const setQuery = useCallback(
    (nextQuery: string) => {
      replaceParams({ q: nextQuery.trim() || null });
    },
    [replaceParams],
  );

  const setSerie = useCallback(
    (nextSerie: string) => {
      replaceParams({ serie: nextSerie === "all" ? null : nextSerie });
    },
    [replaceParams],
  );

  const setFriendCode = useCallback(
    (code: string) => {
      replaceParams({ friend: code.trim().toUpperCase() || null });
    },
    [replaceParams],
  );

  return useMemo(
    () => ({
      tab,
      setId,
      query,
      serie,
      friendCode,
      setTab,
      setQuery,
      setSerie,
      setFriendCode,
    }),
    [
      tab,
      setId,
      query,
      serie,
      friendCode,
      setTab,
      setQuery,
      setSerie,
      setFriendCode,
    ],
  );
}
