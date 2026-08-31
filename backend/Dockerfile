FROM python:3.12-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends unixodbc-dev gcc g++ && rm -rf /var/lib/apt/lists/*
COPY requirements.txt requirements.lock ./
RUN pip wheel --no-cache-dir --require-hashes --wheel-dir /wheels -r requirements.lock

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends unixodbc && rm -rf /var/lib/apt/lists/* && groupadd --system oeis && useradd --system --gid oeis --home-dir /app oeis
COPY --from=builder /wheels /wheels
COPY requirements.txt requirements.lock ./
RUN pip install --no-cache-dir --no-index --find-links=/wheels --require-hashes -r requirements.lock && rm -rf /wheels
COPY --chown=oeis:oeis . .
USER oeis
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["python","-c","import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3).read()"]
CMD ["uvicorn","app.main:app","--host","0.0.0.0","--port","8000"]
