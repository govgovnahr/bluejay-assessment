FROM python:3.11-slim

WORKDIR /app

RUN apt-get update -q && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Download the PDF at build time so the image is self-contained
RUN curl -fL "https://files.consumerfinance.gov/f/documents/cfpb_your-money-your-goals_financial-empowerment_toolkit.pdf" \
    -o "/app/../YOUR MONEY, YOUR GOALS_ A financial empowerment toolkit - cfpb_your-money-your-goals_financial-empowerment_toolkit.pdf"

EXPOSE 8000

# Token server in background, agent in foreground.
# RAG index builds on first start (~60s), then persists to /app/data/rag_index.
# Mount an EFS volume at /app/data/rag_index to survive container restarts.
CMD uvicorn token_server:app --host 0.0.0.0 --port 8000 & python main.py start
