## graphify

When this project has a Graphify graph at `.graphify/graph_report.md`, prefer the graph before broad raw file search.

Rules:
- Read `.graphify/graph_report.md` before architecture or cross-module codebase searches.
- Use `nodesify-graphify query "<question>"`, `nodesify-graphify path "<A>" "<B>"`, or `nodesify-graphify explain "<concept>"` for cross-module questions when the graph exists.
- Read individual source files directly when exact implementation details are needed or graph output is insufficient.
- After modifying code files while a graph exists, run `nodesify-graphify update .`.
- If there is no `.graphify/graph_report.md`, build the graph first with `/graphify` or `nodesify-graphify run .`.
