# Chemical Search POC

Phase 1 CLI POC for compound normalization and public compound/literature search.

## Setup

Create the project-local Python 3.11 environment and run tests:

```powershell
& scripts\chemical_search\setup-poc.ps1
```

Use `.venv-chemical\Scripts\python.exe` for reproducible POC commands.

## Run

Search by name and run all ChEMBL structure search modes:

```powershell
$env:PYTHONUTF8='1'
.venv-chemical\Scripts\python.exe -m scripts.chemical_search.poc_cli aspirin --mode all
```

Search by formula and select a PubChem candidate by zero-based index:

```powershell
py -m scripts.chemical_search.poc_cli C9H8O4 --input-type formula --candidate-index 0
```

Search by SMILES without Semantic Scholar:

```powershell
py -m scripts.chemical_search.poc_cli "CC(=O)Oc1ccccc1C(=O)O" --no-semantic-scholar
```

Results are written to `output/chemical-search/poc/search-result.json`,
`search-result.md`, and `search-result.csv`. Provider failures are recorded as
partial results instead of terminating the entire search.

Successful provider responses are cached under `output/chemical-search/cache`.
Cache file names are request hashes and cache payloads do not store request
URLs or API keys. Disable cache for sensitive queries:

```powershell
py -m scripts.chemical_search.poc_cli aspirin --no-cache
```

Set `CROSSREF_MAILTO` to identify requests to Crossref's polite pool.

## Test

```powershell
$env:PYTHONUTF8='1'
py -m unittest discover -s tests -p 'test*.py' -v
```

Run the 10-case normalization quality fixture:

```powershell
.venv-chemical\Scripts\python.exe -m scripts.chemical_search.evaluate_quality
```

Run the FastAPI service:

```powershell
.venv-chemical\Scripts\python.exe -m uvicorn scripts.chemical_search.api:app --reload --port 8000
```

OpenAPI documentation is available at `http://127.0.0.1:8000/docs`.
