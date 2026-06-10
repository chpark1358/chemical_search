from __future__ import annotations

import csv
import io
import json

from .models import SearchReport


def render_json(report: SearchReport) -> str:
    return json.dumps(report.to_dict(), indent=2, ensure_ascii=False)


def render_csv(report: SearchReport) -> str:
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(
        [
            "rank",
            "kind",
            "title",
            "score",
            "sources",
            "source_url",
            "evidence_count",
        ]
    )
    for rank, item in enumerate(report.results, start=1):
        writer.writerow(
            [
                rank,
                item.kind,
                item.title,
                item.score,
                "|".join(item.data.get("sources", [])),
                item.source_url,
                len(item.data.get("evidence", [])),
            ]
        )
    return output.getvalue()


def render_markdown(report: SearchReport) -> str:
    compound = report.selected_compound
    lines = [
        "# Chemical Search POC Result",
        "",
        "## Search",
        "",
        f"- Query: `{report.query}`",
        f"- Detected type: `{report.detected_type}`",
        f"- Mode: `{report.mode}`",
        f"- Status: `{report.status}`",
        "",
        "## Selected compound",
        "",
    ]
    if compound:
        lines.extend(
            [
                f"- Canonical SMILES: `{compound.canonical_smiles}`",
                f"- InChIKey: `{compound.inchi_key}`",
                f"- Formula: `{compound.formula}`",
                f"- Molecular weight: `{compound.molecular_weight}`",
            ]
        )
    else:
        lines.append("- No compound could be selected and normalized.")

    lines.extend(
        [
            "",
            "## Provider diagnostics",
            "",
            "| Source | Operation | Status | Items | Latency | Cached | Retries |",
            "|---|---|---|---:|---:|---|---:|",
        ]
    )
    for result in report.provider_results:
        lines.append(
            f"| {result.source} | {result.operation} | {result.status} | "
            f"{len(result.items)} | {result.diagnostics.latency_ms} ms | "
            f"{str(result.diagnostics.cached).lower()} | {result.diagnostics.retry_count} |"
        )

    lines.extend(["", "## Ranked results", ""])
    for index, item in enumerate(report.results, start=1):
        lines.append(f"### {index}. [{item.title}]({item.source_url})")
        lines.append("")
        lines.append(f"- Kind: `{item.kind}`")
        lines.append(f"- Score: `{item.score}`")
        lines.append(f"- Sources: `{', '.join(item.data.get('sources', []))}`")
        lines.append("- Evidence:")
        for evidence in item.data.get("evidence", []):
            lines.append(
                f"  - [{evidence['source']}/{evidence['operation']}]"
                f"({evidence['source_url']}): {evidence['match_reason']}"
            )
        lines.append("")

    lines.extend(["## Warnings", ""])
    all_warnings = list(report.warnings)
    if compound:
        all_warnings.extend(compound.warnings)
    for result in report.provider_results:
        if result.diagnostics.message:
            all_warnings.append(
                f"{result.source}/{result.operation}: {result.diagnostics.message}"
            )
    if all_warnings:
        lines.extend(f"- {warning}" for warning in all_warnings)
    else:
        lines.append("- None")
    return "\n".join(lines) + "\n"
