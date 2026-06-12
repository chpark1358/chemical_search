/**
 * 클라이언트 측 내보내기 생성기.
 *
 * 서버 내보내기 라우트(전체 리포트)를 쓸 수 없는 경우 — 선택 항목만, 또는 서버에
 * 라우트가 없는 BibTeX/RIS — 에 사용한다. 모두 Paper/Patent 필드에서만 문자열을 만들고
 * Blob으로 다운로드한다.
 */

import type { Paper, Patent } from "./api";
import { papersToBibTeX, papersToRIS } from "./citation";

/** 출처 머신명 → 사람이 읽는 라벨. 내보내기(CSV/Markdown/xlsx)의 '출처' 열에 쓴다. */
const SOURCE_LABELS: Record<string, string> = {
  openalex: "OpenAlex",
  crossref: "Crossref",
  semantic_scholar: "Semantic Scholar",
  google_patents: "Google Patents",
  surechembl: "SureChEMBL",
  kipris: "KIPRIS"
};

/** 알려진 출처는 사람이 읽는 라벨로, 모르는 값은 원본 문자열을 그대로 돌려준다. */
function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

/**
 * CSV 셀 escape: 따옴표/콤마/개행이 있으면 큰따옴표로 감싸고 내부 따옴표를 두 번으로.
 * 또한 =,+,-,@ 로 시작하는 값은 작은따옴표를 붙여 스프레드시트 수식 주입(CSV injection)을 막는다.
 */
function csvCell(value: string | number | null): string {
  if (value === null) return "";
  let str = String(value);
  // CSV injection 가드: 수식 트리거 문자로 시작하면 작은따옴표로 무력화한다.
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }
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
    ["순위", "제목", "저자", "저널", "연도", "인용수", "DOI", "링크", "출처"],
    papers.map((p, index) => [
      index + 1,
      p.title,
      p.authors.join("; "),
      p.venue,
      p.year,
      p.citations,
      p.doi,
      p.url,
      sourceLabel(p.source)
    ])
  );
}

export function patentsToCsv(patents: Patent[]): string {
  return csvRows(
    ["순위", "공개번호", "제목", "출원인", "날짜", "출처", "링크"],
    patents.map((p, index) => [
      index + 1,
      p.publication_number,
      p.title,
      p.assignee,
      p.date,
      sourceLabel(p.source),
      p.url
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
    `| ${mdEscape(p.title)} | ${mdEscape(p.authors.join("; "))} | ${mdEscape(p.venue ?? "")} | ${p.year ?? ""} | ${p.doi ?? ""} | ${p.citations ?? ""} | ${sourceLabel(p.source)} |`
  );
  return [header, divider, ...rows].join("\n") + "\n";
}

export function patentsToMarkdown(patents: Patent[]): string {
  const header = "| 공개번호 | 제목 | 출원인 | 공개일 | 출처 |";
  const divider = "| --- | --- | --- | --- | --- |";
  const rows = patents.map((p) =>
    `| ${mdEscape(p.publication_number)} | ${mdEscape(p.title)} | ${mdEscape(p.assignee ?? "")} | ${p.date ?? ""} | ${sourceLabel(p.source)} |`
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

/** 브라우저에서 Blob을 파일로 다운로드한다(텍스트가 아닌 바이너리용). */
function downloadBlob(filename: string, blob: Blob): void {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * 논문/특허를 디자인된 Excel(.xlsx) 워크북으로 내보낸다.
 *
 * - exceljs는 동적 import로만 로드해 메인 번들에서 코드 분할한다.
 * - 논문/특허는 각각 별도 시트('논문'/'특허')에 담고, 행이 있는 종류만 시트를 만든다.
 * - 헤더 굵게 + 짙은 채움 + 얇은 하단 테두리, 헤더 고정, 자동 필터, DOI/링크는 하이퍼링크.
 */
export async function exportXlsx({
  papers = [],
  patents = [],
  filenameBase = "export"
}: {
  papers?: Paper[];
  patents?: Patent[];
  filenameBase?: string;
}): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "화학 구조 검색";
  workbook.created = new Date();

  if (papers.length) {
    const sheet = workbook.addWorksheet("논문");
    sheet.columns = [
      { header: "순위", key: "rank", width: 6 },
      { header: "제목", key: "title", width: 60 },
      { header: "저자", key: "authors", width: 28 },
      { header: "저널", key: "venue", width: 28 },
      { header: "연도", key: "year", width: 8 },
      { header: "인용수", key: "citations", width: 10 },
      { header: "DOI", key: "doi", width: 26 },
      { header: "링크", key: "url", width: 36 },
      { header: "출처", key: "source", width: 16 }
    ];
    papers.forEach((p, index) => {
      const row = sheet.addRow({
        rank: index + 1,
        title: p.title,
        authors: p.authors.join("; "),
        venue: p.venue ?? "",
        year: p.year ?? "",
        citations: p.citations ?? "",
        doi: p.doi ?? "",
        url: "",
        source: sourceLabel(p.source)
      });
      if (p.doi) {
        const doiCell = row.getCell("doi");
        doiCell.value = {
          text: p.doi,
          hyperlink: `https://doi.org/${p.doi}`
        };
        doiCell.font = { color: { argb: "FF2563EB" }, underline: true };
      }
      if (p.url) {
        const urlCell = row.getCell("url");
        urlCell.value = { text: p.url, hyperlink: p.url };
        urlCell.font = { color: { argb: "FF2563EB" }, underline: true };
      }
    });
    styleSheet(sheet, 9);
  }

  if (patents.length) {
    const sheet = workbook.addWorksheet("특허");
    sheet.columns = [
      { header: "순위", key: "rank", width: 6 },
      { header: "공개번호", key: "publication_number", width: 22 },
      { header: "제목", key: "title", width: 60 },
      { header: "출원인", key: "assignee", width: 28 },
      { header: "날짜", key: "date", width: 14 },
      { header: "출처", key: "source", width: 16 },
      { header: "링크", key: "url", width: 36 }
    ];
    patents.forEach((p, index) => {
      const row = sheet.addRow({
        rank: index + 1,
        publication_number: p.publication_number,
        title: p.title,
        assignee: p.assignee ?? "",
        date: p.date ?? "",
        source: sourceLabel(p.source),
        url: ""
      });
      if (p.url) {
        const urlCell = row.getCell("url");
        urlCell.value = { text: p.url, hyperlink: p.url };
        urlCell.font = { color: { argb: "FF2563EB" }, underline: true };
      }
    });
    styleSheet(sheet, 7);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: XLSX_MIME });
  downloadBlob(`${filenameBase}.xlsx`, blob);
}

/**
 * 헤더 행 디자인(굵게+짙은 채움+하단 테두리), 헤더 고정, 자동 필터, 본문 정렬을 적용한다.
 * 행이 있을 때만(헤더 외 데이터가 존재) 고정/필터를 건다.
 */
function styleSheet(
  sheet: import("exceljs").Worksheet,
  columnCount: number
): void {
  const headerRow = sheet.getRow(1);
  headerRow.height = 20;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFF4F4F5" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F2430" }
    };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: false };
    cell.border = { bottom: { style: "thin", color: { argb: "FF3F3F46" } } };
  });

  // 본문 셀: 세로 가운데 정렬, 줄바꿈 끔.
  for (let r = 2; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    row.eachCell((cell) => {
      const existing = cell.alignment ?? {};
      cell.alignment = { ...existing, vertical: "middle", wrapText: false };
    });
  }

  const hasData = sheet.rowCount > 1;
  if (hasData) {
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    const lastColumn = sheet.getColumn(columnCount).letter;
    sheet.autoFilter = {
      from: "A1",
      to: `${lastColumn}1`
    };
  }
}
