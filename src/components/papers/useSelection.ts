"use client";

import { useCallback, useMemo, useState } from "react";

/**
 * 안정 키 기반 다중 선택 상태. 정렬/필터/탭 전환과 무관하게 선택을 유지한다(키가 안정적이므로).
 * 항목 자체가 아니라 "키 집합"을 보관하므로, 현재 보이지 않는 항목의 선택도 보존된다.
 */
export interface Selection {
  /** 선택된 안정 키 집합. */
  readonly selectedKeys: ReadonlySet<string>;
  /** 선택된 키 개수(전체, 화면에 보이지 않는 항목 포함). */
  readonly count: number;
  isSelected: (key: string) => boolean;
  toggle: (key: string) => void;
  /** 주어진 키들(보통 현재 화면의 항목)이 모두 선택돼 있으면 해제, 아니면 모두 선택. */
  toggleAll: (keys: string[]) => void;
  /** 주어진 키들이 모두 선택돼 있는지(빈 목록이면 false). */
  allSelected: (keys: string[]) => boolean;
  clear: () => void;
}

export function useSelection(): Selection {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleAll = useCallback((keys: string[]) => {
    setSelectedKeys((prev) => {
      const everySelected = keys.length > 0 && keys.every((key) => prev.has(key));
      const next = new Set(prev);
      if (everySelected) {
        for (const key of keys) next.delete(key);
      } else {
        for (const key of keys) next.add(key);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelectedKeys(new Set()), []);

  const isSelected = useCallback((key: string) => selectedKeys.has(key), [selectedKeys]);

  const allSelected = useCallback(
    (keys: string[]) => keys.length > 0 && keys.every((key) => selectedKeys.has(key)),
    [selectedKeys]
  );

  return useMemo(
    () => ({
      selectedKeys,
      count: selectedKeys.size,
      isSelected,
      toggle,
      toggleAll,
      allSelected,
      clear
    }),
    [selectedKeys, isSelected, toggle, toggleAll, allSelected, clear]
  );
}
