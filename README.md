# Quartermaster Financial Ops

A RAG-enabled voice agent that acts as a gruff military logistics officer reviewing a soldier's personal finances. Built on LiveKit Cloud, deployed via Vercel (frontend) and AWS EC2 (agent). Built with [Claude Code](https://claude.ai/code).

**Live demo:** https://bluejay-assessment.vercel.app/

---

## System Design

### End-to-End Flow

```
Browser mic → LiveKit Cloud → Agent (EC2)
                                ├── Deepgram STT  →  transcript
                                ├── Silero VAD    →  speech detection
                                ├── MultilingualModel → end-of-turn detection
                                ├── RAG lookup    →  CFPB passages injected into prompt
                                ├── GPT-4o        →  response text
                                └── OpenAI TTS    →  audio back to browser
```

1. The React frontend gets a signed LiveKit JWT from a serverless token endpoint (`/api/token` on Vercel, or `localhost:8000/token` locally).
2. The browser joins a LiveKit room. LiveKit Cloud dispatches a job to the Python agent worker running on EC2.
3. The agent subprocess connects to the room, subscribes to the user's audio track, and fires the greeting immediately via `session.say()` (no LLM round trip).
4. Subsequent user turns go through the full pipeline: VAD → STT → EOU detection → RAG + LLM → TTS → audio published back to the room.
5. The browser receives the agent's audio track and plays it. Transcript segments are delivered via LiveKit's `TranscriptionReceived` data channel and rendered in real time.

### Latency optimisations

- **Greeting**: uses `session.say()` (TTS only, ~500ms) instead of `generate_reply` (LLM + TTS, ~2–3s).
- **RAG index**: loaded asynchronously in a thread executor when the job starts; does not block the session.
- **Preemptive TTS**: `preemptive_tts: True` streams TTS in parallel with LLM token generation.
- **Context window**: chat history is truncated to the last 20 messages so prompt size stays bounded across long conversations.

---

## RAG Integration

**Corpus**: CFPB *Your Money, Your Goals* financial empowerment toolkit (244 pages, 6.3 MB PDF).

**Indexing** (`agent/main.py → _build_or_load_index`):
- PDF is parsed with **PyMuPDF** (preserves table layout better than pypdf).
- Documents are chunked and embedded with **OpenAI `text-embedding-ada-002`** via LlamaIndex's `VectorStoreIndex`.
- The index is persisted to disk (`agent/data/rag_index/`) so it only builds once.

**Retrieval** (`llm_node` override):
- On every user turn, the last user message is used as the query.
- `similarity_top_k=3` retrieves the three most relevant chunks.
- Retrieved passages are injected into the system prompt with their page numbers before the LLM call, allowing the agent to cite real content (e.g. *"Page 81 of the field manual…"*).
- The agent is instructed never to fabricate section names or module numbers — only reference what appears in the retrieved text.

---

## Stack

| Layer | Technology |
|---|---|
| Voice infrastructure | LiveKit Cloud |
| Agent framework | `livekit-agents` v1.5 (Python) |
| Speech-to-text | Deepgram Nova-2 |
| End-of-turn detection | `livekit-plugins-turn-detector` MultilingualModel |
| LLM | OpenAI GPT-4o |
| Text-to-speech | OpenAI TTS (`onyx` voice) |
| RAG | LlamaIndex + OpenAI embeddings + PyMuPDF |
| Frontend | React + Vite + `livekit-client` |
| Token server | Vercel serverless function (`frontend/api/token.js`) |
| Agent hosting | AWS EC2 (systemd service) |

---

## Design Decisions & Assumptions

### LiveKit Agent Design
- **`@server.rtc_session()` pattern** — each browser connection gets its own isolated agent session and room. Room names are UUID-suffixed per connection to prevent stale dispatch from rooms that previously had an active agent.
- **`session.say()` for greeting** — uses TTS-only path (~500ms) rather than `generate_reply()` (LLM + TTS, ~2–3s). This keeps the opening instant even on cold sessions.
- **`dev` mode in production** — `livekit-agents` v1.5.18 has a silent job-dispatch bug in `start` mode; `dev` mode runs the entrypoint directly and is functionally identical for single-instance deployments.
- **2-second warm-up before greeting** — Deepgram STT opens a WebSocket on session start. On EC2 (t3.small) this handshake takes 1–3s; the delay prevents the first user words from being dropped.

### RAG Assumptions
- **Vector store**: LlamaIndex `VectorStoreIndex` with a local filesystem store (`agent/data/rag_index/`). No external vector database — eliminates an extra managed service for a single-document corpus.
- **Embeddings**: OpenAI `text-embedding-ada-002`. Chosen for quality and because OpenAI is already a dependency (LLM + TTS).
- **Chunking**: LlamaIndex defaults (~1024 tokens per chunk, 20-token overlap). Works well for the CFPB document's chapter/section structure.
- **PDF parsing**: PyMuPDF instead of pypdf — better preservation of table layout, which matters for the CFPB toolkit's structured financial tables.
- **Retrieval**: `similarity_top_k=3` — enough context to answer specific chapter questions without overloading the prompt.
- **Index persistence**: Built once (~30s) and saved to disk. Subsequent starts load in ~2s.

### Hosting Assumptions
- **Agent on EC2 t3.small** — 2GB RAM minimum for the turn-detector ONNX model (~900MB) plus Python overhead. t3.micro OOMs.
- **Frontend on Vercel** — zero-config for React/Vite; the `/api/token` serverless function keeps the LiveKit API secret server-side.
- **No token server on EC2** — the Vercel serverless function handles token generation in production. EC2 only runs the agent worker; it needs no open inbound ports.
- **Agent connects outbound only** — WebSocket to `wss://tally-7j3xtwba.livekit.cloud`. Security group allows SSH inbound only.

### Trade-offs & Limitations
- **Hardcoded spending data** — `get_spending_summary` returns static mock data. The intended integration is [Tally](https://www.tally.wunderblu.com/), a personal finance API, which would provide real-time spending breakdowns per category.
- **Single-instance EC2** — no auto-scaling. One concurrent call per instance. Acceptable for a demo; would need a worker pool behind a load balancer for production.
- **RAG index not in repo** — the serialised vector index is ~50MB of binary files; it's gitignored and rebuilds automatically on first run. The PDF corpus is included at `frontend/public/cfpb-guide.pdf`.
- **Chat context truncated at 20 messages** — bounds prompt size to prevent latency growth in long conversations. Trades some long-term memory for consistent response speed.

---

## Local Development

```bash
# 1. Agent (from /agent)
pip install -r requirements.txt
python -m livekit.agents download-files   # download turn-detector model
python main.py dev

# 2. Token server (from /agent)
python token_server.py

# 3. Frontend (from /frontend)
npm install
npm run dev
```

Copy `agent/.env.example` to `agent/.env` and fill in credentials for LiveKit, OpenAI, and Deepgram.

The RAG index builds automatically on first run (~30s). Subsequent starts load from disk in ~2s.
