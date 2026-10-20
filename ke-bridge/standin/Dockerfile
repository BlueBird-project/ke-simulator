FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Git is needed to install the private ke_client from GitHub.
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

# Reuse the bridge's pinned dependencies (same ke_client version).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "standin/fm_standin.py"]
