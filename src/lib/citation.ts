/**
 * 논문 인용 포맷(BibTeX / RIS) 생성기.
 *
 * 모두 Paper 필드(authors/title/venue/year/doi/url/abstract)에서만 만들어지는 순수 함수다.
 * 외부 입력을 그대로 직렬화하므로, BibTeX 본문에 들어가는 값은 중괄호/역슬래시 등을
 * 가볍게 정리한다(완전한 LaTeX 이스케이프는 아니지만 깨진 항목을 막는다).
 */

import type { Paper } from "./api";

/** 저자 문자열에서 성(姓)을 뽑는다. "A. Kim" → "Kim", "Kim, A." → "Kim". */
function surname(author: string): string {
  const trimmed = author.trim();
  if (!trimmed) return "";
  if (trimmed.includes(",")) {
    return trimmed.split(",")[0].trim();
  }
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1] ?? "";
}

/** cite key 토큰용: 알파벳/숫자만 남긴다(공백·기호 제거). */
function alnum(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "");
}

/**
 * 단일 논문의 cite key를 만든다: 첫 저자 성 + 연도 + 제목 첫 단어.
 * 비어 있으면 "ref"로 대체한다(절대 빈 키를 만들지 않는다).
 */
function baseCiteKey(paper: Paper): string {
  const first = paper.authors[0] ? alnum(surname(paper.authors[0])) : "";
  const year = paper.year !== null ? String(paper.year) : "";
  const titleWord = alnum((paper.title.trim().split(/\s+/)[0] ?? "").toLowerCase());
  const key = `${first}${year}${titleWord}`;
  return key || "ref";
}

/**
 * 논문 목록에 대해 cite key를 생성하면서 중복은 a/b/c… 접미사로 구분한다.
 * 목록 순서대로 결정적으로 부여한다.
 */
export function buildCiteKeys(papers: Paper[]): string[] {
  const counts = new Map<string, number>();
  return papers.map((paper) => {
    const base = baseCiteKey(paper);
    const used = counts.get(base) ?? 0;
    counts.set(base, used + 1);
    // 첫 번째는 접미사 없음, 두 번째부터 a/b/c…
    return used === 0 ? base : `${base}${String.fromCharCode(96 + used)}`;
  });
}

/** BibTeX 필드 값 정리: 줄바꿈 접기 + 중괄호/역슬래시 제거. */
function bibValue(value: string): string {
  return value.replace(/[{}\\]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * 단일 논문을 BibTeX @article 항목으로 직렬화한다.
 * citeKey를 명시하지 않으면 단독 키를 생성한다(목록에서는 buildCiteKeys로 중복을 해소).
 */
export function toBibTeX(paper: Paper, citeKey?: string): string {
  const key = citeKey ?? baseCiteKey(paper);
  const fields: Array<[string, string]> = [];

  if (paper.authors.length) {
    fields.push(["author", paper.authors.map(bibValue).join(" and ")]);
  }
  fields.push(["title", bibValue(paper.title)]);
  if (paper.venue) fields.push(["journal", bibValue(paper.venue)]);
  if (paper.year !== null) fields.push(["year", String(paper.year)]);
  if (paper.doi) fields.push(["doi", bibValue(paper.doi)]);
  if (paper.url) fields.push(["url", paper.url.trim()]);

  const body = fields
    .map(([name, value]) => `  ${name} = {${value}}`)
    .join(",\n");
  return `@article{${key},\n${body}\n}`;
}

/** 단일 논문을 RIS 항목으로 직렬화한다. */
export function toRIS(paper: Paper): string {
  const lines: string[] = ["TY  - JOUR"];
  for (const author of paper.authors) {
    const clean = author.replace(/\s+/g, " ").trim();
    if (clean) lines.push(`AU  - ${clean}`);
  }
  lines.push(`TI  - ${paper.title.replace(/\s+/g, " ").trim()}`);
  if (paper.venue) lines.push(`JO  - ${paper.venue.replace(/\s+/g, " ").trim()}`);
  if (paper.year !== null) lines.push(`PY  - ${paper.year}`);
  if (paper.doi) lines.push(`DO  - ${paper.doi.trim()}`);
  if (paper.url) lines.push(`UR  - ${paper.url.trim()}`);
  if (paper.abstract) {
    lines.push(`AB  - ${paper.abstract.replace(/\s+/g, " ").trim()}`);
  }
  lines.push("ER  - ");
  return lines.join("\n");
}

/** 논문 목록을 하나의 BibTeX 문서로(고유 cite key 적용). */
export function papersToBibTeX(papers: Paper[]): string {
  const keys = buildCiteKeys(papers);
  return papers.map((paper, index) => toBibTeX(paper, keys[index])).join("\n\n") + "\n";
}

/** 논문 목록을 하나의 RIS 문서로. */
export function papersToRIS(papers: Paper[]): string {
  return papers.map(toRIS).join("\n\n") + "\n";
}
