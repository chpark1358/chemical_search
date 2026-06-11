# Chemical Literature Search (papers-only)

Python pipeline that normalizes a chemical input (name, SMILES, InChI,
InChIKey, or formula) via RDKit + PubChem and searches academic papers about
the compound on Semantic Scholar + Crossref.

## Setup

Create the project-local Python 3.11 environment and run tests:

```powershell
& scripts\chemical_search\setup-poc.ps1
```

Use `.venv-chemical\Scripts\python.exe` for reproducible commands.

## Run the CLI

```powershell
$env:PYTHONUTF8='1'
.venv-chemical\Scripts\python.exe -m scripts.chemical_search.poc_cli aspirin
```

Search by formula; when multiple candidates resolve, the CLI lists them and
asks you to pick one by id:

```powershell
py -m scripts.chemical_search.poc_cli C9H8O4 --input-type formula --candidate-id pubchem:2244
```

Options: `--sources semantic_scholar crossref`, `--sort relevance|citations|year`,
`--limit 1..50`, `--no-cache`.

Results are written to `output/chemical-search/poc/search-result.{json,csv,md}`.
Provider failures are reported as `partial` results instead of terminating the
entire search; `failed` means no provider returned anything usable.

Successful provider responses are cached under `output/chemical-search/cache`.
Cache file names are request hashes and cache payloads do not store request
URLs or API keys. Disable cache for sensitive queries with `--no-cache`.

Set `CROSSREF_MAILTO` to identify requests to Crossref's polite pool and
`SEMANTIC_SCHOLAR_API_KEY` for a higher Semantic Scholar rate limit.

## Run the API

```powershell
.venv-chemical\Scripts\python.exe -m uvicorn scripts.chemical_search.api:app --port 8000
```

The Next.js dev server proxies `/chemical-api/:path*` to this service.
Endpoints: `POST /api/searches`, `GET /api/searches/{id}`,
`POST /api/searches/{id}/select`, `GET /api/searches/{id}/export?format=csv|markdown|json`,
`POST /api/chem/normalize`. OpenAPI docs at `http://127.0.0.1:8000/docs`.

The in-memory search store assumes a single uvicorn worker; records expire
after one hour (max 200 records).

## Test

```powershell
$env:PYTHONUTF8='1'
.venv-chemical\Scripts\python.exe -m unittest discover -s tests -p 'test_chemical_search*.py' -v
```

Run the normalization quality fixture:

```powershell
.venv-chemical\Scripts\python.exe -m scripts.chemical_search.evaluate_quality
```
