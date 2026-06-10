# Phase 0 API Spike 결과

실행 시각: 2026-06-02T10:07:54.383119+00:00

## 요약

- ok: 6
- partial: 1
- skipped: 1
- error: 1

## 상세 결과

| Check | Status | Latency | Summary |
|---|---|---:|---|
| rdkit_normalize | ok | 180 ms | RDKit parsed and normalized the molecule. |
| pubchem_name_lookup | ok | 1056 ms | Returned 1 PubChem property rows for name 'aspirin'. |
| pubchem_formula_lookup | ok | 1852 ms | Returned 1244 PubChem CID candidates for formula 'C9H8O4'. |
| chembl_similarity | ok | 3592 ms | Returned 5 ChEMBL similarity rows at threshold 80. |
| chembl_substructure | ok | 5492 ms | Returned 5 ChEMBL substructure rows. |
| semantic_scholar_search | partial | 537 ms | Semantic Scholar returned HTTP 429. Configure SEMANTIC_SCHOLAR_API_KEY or retry later. |
| crossref_search | ok | 2898 ms | Returned 5 Crossref work candidates. |
| surechembl_discovery | error | 0 ms | SureChEMBL root discovery failed. |
| epo_ops_credentials | skipped | 0 ms | EPO OPS credentials are not configured. Set EPO_OPS_CONSUMER_KEY and EPO_OPS_CONSUMER_SECRET. |

## 오류/주의

- `surechembl_discovery`: `SSLError(MaxRetryError("HTTPSConnectionPool(host='www.api.surechembl.org', port=443): Max retries exceeded with url: / (Caused by SSLError(SSLCertVerificationError(1, '[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: self-signed certificate (_ssl.c:1006)')))"))`

## 다음 판단

- `rdkit_normalize`가 skipped이면 RDKit 설치 방식을 먼저 결정해야 한다.
- `surechembl_discovery`는 root 확인만 하므로 실제 compound-patent endpoint 검증이 추가로 필요하다.
- `epo_ops_credentials`가 skipped이면 EPO OPS 등록/키 발급이 필요하다.
