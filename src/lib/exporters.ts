/**
 * 클라이언트 측 내보내기 생성기.
 *
 * 서버 내보내기 라우트(전체 리포트)를 쓸 수 없는 경우 — 선택 항목만, 또는 서버에
 * 라우트가 없는 BibTeX/RIS — 에 사용한다. 모두 Paper/Patent 필드에서만 문자열을 만들고
 * Blob으로 다운로드한다.
 */

import type { Paper, Patent } from "./api";
import { papersToBibTeX, papersToRIS } from "./citation";

/** CSV 셀 escape: 따옴표/콤마/개행이 있으면 큰따옴표로 감싸고 내부 따옴표를 두 번으로. */
function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRows(headers: string[], rows: Array<Array<string | number | null>>): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvCell).join(","));
  }
  // BOM을 붙여 Excel에서 한글이 깨지지 않게 한다.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function papersToCsv(papers: Paper[]): string {
  return csvRows(
    ["title", "authors", "venue", "year", "doi", "url", "citations", "source", "score"],
    papers.map((p) => [
      p.title,
      p.authors.join("; "),
      p.venue,
      p.year,
      p.doi,
      p.url,
      p.citations,
      p.source,
      p.score
    ])
  );
}

export function patentsToCsv(patents: Patent[]): string {
  return csvRows(
    ["publication_number", "title", "assignee", "date", "url", "source"],
    patents.map((p) => [
      p.publication_number,
      p.title,
      p.assignee,
      p.date,
      p.url,
      p.source
    ])
  );
}

function mdEscape(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function papersToMarkdown(papers: Paper[]): string {
  const header = "| 제목 | 저자 | 저널 | 연도 | DOI | 인용수 | 출처 |";
  const divider = "| --- | --- | --- | --- | --- | --- | --- |";
  const rows = papers.map((p) =>
    `| ${mdEscape(p.title)} | ${mdEscape(p.authors.join("; "))} | ${mdEscape(p.venue ?? "")} | ${p.year ?? ""} | ${p.doi ?? ""} | ${p.citations ?? ""} | ${p.source} |`
  );
  return [header, divider, ...rows].join("\n") + "\n";
}

export function patentsToMarkdown(patents: Patent[]): string {
  const header = "| 공개번호 | 제목 | 출원인 | 공개일 | 출처 |";
  const divider = "| --- | --- | --- | --- | --- |";
  const rows = patents.map((p) =>
    `| ${mdEscape(p.publication_number)} | ${mdEscape(p.title)} | ${mdEscape(p.assignee ?? "")} | ${p.date ?? ""} | ${p.source} |`
  );
  return [header, divider, ...rows].join("\n") + "\n";
}

/** 브라우저에서 문자열을 파일로 다운로드한다. */
export function downloadText(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // 다음 틱에 해제(일부 브라우저는 클릭 직후 즉시 revoke 시 다운로드를 취소한다).
  setTimeout(() => URL.revokeObjectURL(href), 0);
}

/** 클라이언트 측 내보내기 포맷(서버 라우트가 없거나, 선택 항목만 내보낼 때). */
export type ClientFormat = "csv" | "markdown" | "json" | "bibtex" | "ris";

const PAPER_EXT: Record<ClientFormat, string> = {
  csv: "csv",
  markdown: "md",
  json: "json",
  bibtex: "bib",
  ris: "ris"
};

const PAPER_MIME: Record<ClientFormat, string> = {
  csv: "text/csv",
  markdown: "text/markdown",
  json: "application/json",
  bibtex: "application/x-bibtex",
  ris: "application/x-research-info-systems"
};

/** 논문 목록을 지정 포맷으로 다운로드한다. */
export function exportPapers(
  papers: Paper[],
  format: ClientFormat,
  baseName = "papers"
): void {
  let content: string;
  switch (format) {
    case "csv":
      content = papersToCsv(papers);
      break;
    case "markdown":
      content = papersToMarkdown(papers);
      break;
    case "json":
      content = JSON.stringify(papers, null, 2);
      break;
    case "bibtex":
      content = papersToBibTeX(papers);
      break;
    case "ris":
      content = papersToRIS(papers);
      break;
  }
  downloadText(`${baseName}.${PAPER_EXT[format]}`, PAPER_MIME[format], content);
}

/** 특허는 학술 인용이 아니므로 BibTeX/RIS를 지원하지 않는다(csv/markdown/json만). */
export type PatentClientFormat = "csv" | "markdown" | "json";

const PATENT_EXT: Record<PatentClientFormat, string> = {
  csv: "csv",
  markdown: "md",
  json: "json"
};

const PATENT_MIME: Record<PatentClientFormat, string> = {
  csv: "text/csv",
  markdown: "text/markdown",
  json: "application/json"
};

/** 특허 목록을 지정 포맷으로 다운로드한다. */
export function exportPatents(
  patents: Patent[],
  format: PatentClientFormat,
  baseName = "patents"
): void {
  let content: string;
  switch (format) {
    case "csv":
      content = patentsToCsv(patents);
      break;
    case "markdown":
      content = patentsToMarkdown(patents);
      break;
    case "json":
      content = JSON.stringify(patents, null, 2);
      break;
  }
  downloadText(`${baseName}.${PATENT_EXT[format]}`, PATENT_MIME[format], content);
}
