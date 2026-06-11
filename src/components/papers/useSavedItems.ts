"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { Paper, Patent } from "@/lib/api";
import {
  addPaper,
  addPatent,
  getSavedSnapshot,
  getServerSavedSnapshot,
  hasSaved,
  removeSaved,
  savedKeyForPaper,
  savedKeyForPatent,
  subscribeSaved,
  type SavedItem
} from "@/lib/savedItems";

/**
 * 저장됨 라이브러리 구독 훅. useSyncExternalStore로 SSR 안전하게 동기화한다.
 * 서버 스냅샷은 항상 빈 배열(localStorage 미접근)이고, 마운트 후 실제 목록으로 합쳐진다.
 *
 * 모든 구독자가 같은 localStorage를 바라보므로, 어디서 별을 토글해도(행/저장 뷰)
 * 별 상태와 저장 뷰가 함께 갱신된다.
 */

export interface SavedItemsApi {
  items: SavedItem[];
  count: number;
  isPaperSaved: (paper: Paper) => boolean;
  isPatentSaved: (patent: Patent) => boolean;
  isKeySaved: (key: string) => boolean;
  togglePaper: (paper: Paper, compoundName: string | null) => void;
  togglePatent: (patent: Patent, compoundName: string | null) => void;
}

export function useSavedItems(): SavedItemsApi {
  const items = useSyncExternalStore(
    subscribeSaved,
    getSavedSnapshot,
    getServerSavedSnapshot
  );

  const isPaperSaved = useCallback(
    (paper: Paper) => items.some((item) => item.key === savedKeyForPaper(paper)),
    [items]
  );
  const isPatentSaved = useCallback(
    (patent: Patent) => items.some((item) => item.key === savedKeyForPatent(patent)),
    [items]
  );
  const isKeySaved = useCallback(
    (key: string) => items.some((item) => item.key === key),
    [items]
  );

  const togglePaper = useCallback((paper: Paper, compoundName: string | null) => {
    const key = savedKeyForPaper(paper);
    if (hasSaved(key)) removeSaved(key);
    else addPaper(paper, compoundName);
  }, []);

  const togglePatent = useCallback((patent: Patent, compoundName: string | null) => {
    const key = savedKeyForPatent(patent);
    if (hasSaved(key)) removeSaved(key);
    else addPatent(patent, compoundName);
  }, []);

  return {
    items,
    count: items.length,
    isPaperSaved,
    isPatentSaved,
    isKeySaved,
    togglePaper,
    togglePatent
  };
}
