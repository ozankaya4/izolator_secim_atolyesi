FROM ghcr.io/astral-sh/uv:0.13.5 AS uv
FROM python:3.13.16-slim-bookworm
COPY --from=uv /uv /bin/uv
WORKDIR /app
ENV UV_PYTHON_DOWNLOADS=0 UV_LINK_MODE=copy PYTHONUNBUFFERED=1 PATH="/app/.venv/bin:$PATH" OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/isolator ./isolator
RUN useradd --system --uid 10001 app
USER app
EXPOSE 8000
CMD ["uvicorn", "isolator.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
