"""Render a papers search report to JSON, CSV, or Markdown."""

from __future__ import annotations

import csv
import io
import json

from .models import SearchReport


_FORMULA_INJECTION_PREFIXES = ("=", "+", "-", "@")


def render_json(report: SearchReport) -> str:
    return json.dumps(report.to_dict(), indent=2, ensure_ascii=False)


def _cell(value: object) -> str:
    """Render a CSV cell, neutralizing spreadsheet formula injection."""
    if value is None:
        return ""
    text = str(value)
    if text.startswith(_FORMULA_INJECTION_PREFIXES):
        return f"'{text}"
    return text


def render_csv(report: SearchReport) -> str:
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(
        [
            "rank",
            "title",
            "authors",
            "venue",
            "year",
            "doi",
            "url",
            "citations",
            "source",
            "score",
        ]
    )
    for rank, paper in enumerate(report.papers, start=1):
        writer.writerow(
            [
                rank,
                _cell(paper.title),
                _cell("; ".join(paper.authors)),
                _cell(paper.venue),
                _cell(paper.year),
                _cell(paper.doi),
                _cell(paper.url),
                _cell(paper.citations),
                _cell(paper.source),
                _cell(paper.score),
            ]
        )

    # Patents are a separate result type and follow the papers table as a second
    # section (a blank row, then a patent header row and patent rows).
    if report.patents:
        writer.writerow([])
        writer.writerow(
            ["rank", "publication_number", "title", "assignee", "date", "url", "source"]
        )
        for rank, patent in enumerate(report.patents, start=1):
            writer.writerow(
                [
                    rank,
                    _cell(patent.publication_number),
                    _cell(patent.title),
                    _cell(patent.assignee),
                    _cell(patent.date),
                    _cell(patent.url),
                    _cell(patent.source),
                ]
            )
    return output.getvalue()


def render_markdown(report: SearchReport) -> str:
    compound = report.compound
    lines = [
        "# 화학물질 논문 검색 결과",
        "",
        "## 검색 정보",
        "",
        f"- 검색어: `{report.query}`",
        f"- 입력 유형: `{report.detected_type}`",
        f"- 상태: `{report.status}`",
        "",
        "## 화합물 정보",
        "",
    ]
    if compound:
        lines.extend(
            [
                f"- 이름: {compound.name or '-'}",
                f"- Canonical SMILES: `{compound.canonical_smiles or '-'}`",
                f"- InChIKey: `{compound.inchi_key or '-'}`",
                f"- 분자식: `{compound.formula or '-'}`",
                f"- PubChem CID: `{compound.cid if compound.cid is not None else '-'}`",
            ]
        )
    else:
        lines.append("- 화합물 정보를 확인하지 못했습니다.")

    lines.extend(
        [
            "",
            "## 제공자 진단",
            "",
            "| 제공자 | 상태 | 지연(ms) | 캐시 | 재시도 | 메시지 |",
            "|---|---|---:|---|---:|---|",
        ]
    )
    for provider in report.providers:
        lines.append(
            f"| {provider.name} | {provider.status} | "
            f"{provider.latency_ms if provider.latency_ms is not None else '-'} | "
            f"{str(provider.cached).lower()} | {provider.retry_count} | "
            f"{provider.message or '-'} |"
        )

    lines.extend(["", "## 논문 목록", ""])
    if not report.papers:
        lines.append("- 검색된 논문이 없습니다.")
    for index, paper in enumerate(report.papers, start=1):
        link = f"[{paper.title}]({paper.url})" if paper.url else paper.title
        lines.append(f"### {index}. {link}")
        lines.append("")
        if paper.authors:
            lines.append(f"- 저자: {', '.join(paper.authors)}")
        lines.append(f"- 저널/학회: {paper.venue or '-'}")
        lines.append(f"- 연도: {paper.year if paper.year is not None else '-'}")
        lines.append(f"- DOI: {paper.doi or '-'}")
        lines.append(f"- 인용 수: {paper.citations if paper.citations is not None else '-'}")
        lines.append(f"- 출처: {paper.source} (score {paper.score})")
        if paper.abstract:
            abstract = paper.abstract.strip()
            if len(abstract) > 400:
                abstract = abstract[:400] + "..."
            lines.append(f"- 초록: {abstract}")
        lines.append("")

    patents_heading = "## 특허"
    if report.patents_total_hits is not None:
        patents_heading += f" (상위 {len(report.patents)}건 / 전체 {report.patents_total_hits}건)"
    lines.extend([patents_heading, ""])
    if not report.patents:
        lines.append("- 검색된 특허가 없습니다.")
    for index, patent in enumerate(report.patents, start=1):
        link = f"[{patent.title}]({patent.url})" if patent.url else patent.title
        lines.append(f"### {index}. {link}")
        lines.append("")
        lines.append(f"- 공개번호: {patent.publication_number or '-'}")
        lines.append(f"- 출원인/양수인: {patent.assignee or '-'}")
        lines.append(f"- 날짜: {patent.date or '-'}")
        lines.append(f"- 출처: {patent.source}")
        lines.append("")

    lines.extend(["## 경고", ""])
    warnings = list(compound.warnings) if compound else []
    if report.error:
        warnings.append(report.error)
    if warnings:
        lines.extend(f"- {warning}" for warning in warnings)
    else:
        lines.append("- 없음")
    return "\n".join(lines) + "\n"
