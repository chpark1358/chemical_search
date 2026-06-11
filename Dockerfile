# Python FastAPI backend (chemical search pipeline) for container hosts
# (Render / Railway / Fly.io / Cloud Run). The Next.js frontend deploys
# separately on Vercel and proxies to this service via CHEMICAL_API_URL.
#
# NOTE: this Dockerfile is for the BACKEND only. Vercel builds the Next.js
# frontend with its own builder and ignores this file.
FROM python:3.11-slim

WORKDIR /app

# RDKit needs libxrender/libxext at runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libxrender1 libxext6 \
    && rm -rf /var/lib/apt/lists/*

COPY scripts/chemical_search/requirements-poc.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY scripts ./scripts

# Provider response cache (writable inside the container).
ENV CHEMICAL_SEARCH_CACHE_DIR=/tmp/chemical-cache
# Bound the in-memory record store; this app assumes a SINGLE worker (the
# create -> poll -> select flow shares an in-process store + background tasks).
EXPOSE 8000
CMD ["sh", "-c", "uvicorn --app-dir scripts chemical_search.api:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
