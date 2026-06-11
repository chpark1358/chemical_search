/**
 * 논문 목록 가공 헬퍼: 안정 키, 중복 접기.
 *
 * OpenAlex / Crossref / Semantic Scholar는 같은 논문을 각자 반환할 수 있다.
 * 같은 논문을 DOI(우선) 또는 정규화한 제목으로 묶어 대표 1건만 남기고,
 * 나머지 출처는 대표 항목에 메타데이터로 붙인다(다중 선택/내보내기에 영향 없음).
 */

import type { Paper, PaperSourceName } from "./api";

/**
 * 다중 선택·내보내기에서 쓰는 안정 키. DOI가 있으면 소문자 DOI, 없으면 id.
 * (id는 백엔드가 부여하는 안정 식별자라 정렬/필터로 순서가 바뀌어도 유지된다.)
 */
export function paperKey(paper: Paper): string {
  return paper.doi ? `doi:${paper.doi.toLowerCase()}` : `id:${paper.id}`;
}

/** 특허 안정 키. publication_number가 있으면 그것을, 없으면 id. */
export function patentKey(patent: { publication_number: string; id: string }): string {
  return patent.publication_number
    ? `pub:${patent.publication_number}`
    : `id:${patent.id}`;
}

/** 중복 묶음 키: 소문자 DOI > 정규화 제목(소문자+영숫자만). */
function dedupeKey(paper: Paper): string {
  if (paper.doi) return `doi:${paper.doi.toLowerCase()}`;
  const normalizedTitle = paper.title.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalizedTitle ? `title:${normalizedTitle}` : `id:${paper.id}`;
}

/**
 * 접힌 논문. 대표 논문 필드를 그대로 가지면서, 함께 발견된 모든 출처 목록을 더한다.
 * sources 길이가 2 이상이면 중복이 접힌 항목이다.
 */
export interface FoldedPaper extends Paper {
  /** 이 논문이 발견된 모든 출처(대표 출처 포함, 중복 제거, 입력 순서 유지). */
  sources: PaperSourceName[];
}

/** 대표 선정: 인용수(많은 쪽) → score(높은 쪽). */
function isBetterRepresentative(candidate: Paper, current: Paper): boolean {
  const candCitations = candidate.citations ?? -1;
  const currCitations = current.citations ?? -1;
  if (candCitations !== currCitations) return candCitations > currCitations;
  return candidate.score > current.score;
}

/**
 * 중복을 접어 대표 논문 목록으로 만든다. 첫 등장 순서를 보존하되,
 * 같은 묶음에서 더 나은 항목이 나오면 대표를 교체한다(sources는 누적).
 */
export function foldPapers(papers: Paper[]): FoldedPaper[] {
  const groups = new Map<string, FoldedPaper>();
  const order: string[] = [];

  for (const paper of papers) {
    const key = dedupeKey(paper);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { ...paper, sources: [paper.source] });
      order.push(key);
      continue;
    }
    // 출처 누적(중복 제거).
    if (!existing.sources.includes(paper.source)) {
      existing.sources.push(paper.source);
    }
    // 더 나은 대표면 대표 필드를 교체하되 누적된 sources는 유지한다.
    if (isBetterRepresentative(paper, existing)) {
      const sources = existing.sources;
      groups.set(key, { ...paper, sources });
    }
  }

  return order.map((key) => groups.get(key)!);
}
