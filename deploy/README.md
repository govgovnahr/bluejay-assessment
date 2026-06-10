# Deployment

## Architecture

```
Browser (Vercel HTTPS)
  │
  ├─ GET /api/token ──────── Vercel serverless fn  (signs LiveKit JWT)
  │
  └─ WSS connect ─────────── LiveKit Cloud ──────── EC2 (Python agent, always-on)
```

Token generation lives in Vercel alongside the frontend — same domain, no CORS,
no HTTP/HTTPS mismatch. EC2 runs only the LiveKit agent with no inbound HTTP ports.

---

## EC2 Setup (agent)

### 1. Launch instance

- AMI: Ubuntu 22.04 LTS
- Instance type: `t3.small`
- Storage: 20 GB gp3
- Security group inbound rules:

| Type | Port | Source  | Purpose      |
|------|------|---------|--------------|
| SSH  | 22   | Your IP | Setup access |

That's it. No port 8000. LiveKit Cloud handles all WebRTC/audio traffic directly.

### 2. SSH in and run setup

```bash
ssh ubuntu@<ec2-public-ip>
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git bluejay_assessment
cd bluejay_assessment
bash deploy/ec2-setup.sh
```

### 3. Fill in API keys

```bash
nano agent/.env
```

Required:
- `LIVEKIT_URL` — from LiveKit Cloud dashboard (wss://...)
- `LIVEKIT_API_KEY` + `LIVEKIT_API_SECRET` — LiveKit Cloud → Settings → Keys
- `OPENAI_API_KEY`
- `DEEPGRAM_API_KEY`
- `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` — hex ID from ElevenLabs dashboard

### 4. Start the agent

```bash
sudo systemctl start quartermaster-agent
journalctl -u quartermaster-agent -f
```

**First start takes ~60 seconds** while the RAG index builds from the PDF.
Subsequent starts load from disk instantly.

### 5. Update after code changes

```bash
cd ~/bluejay_assessment && git pull
sudo systemctl restart quartermaster-agent
```

---

## Vercel Setup (frontend + token server)

### 1. Push repo to GitHub

### 2. Import in Vercel

- Import the repo
- Set **Root Directory** to `frontend/`
- Framework will be auto-detected as Vite

### 3. Set environment variables

In Vercel → Project → Settings → Environment Variables:

| Variable            | Value                              |
|---------------------|------------------------------------|
| `LIVEKIT_API_KEY`   | Your LiveKit API key               |
| `LIVEKIT_API_SECRET`| Your LiveKit API secret            |
| `LIVEKIT_URL`       | `wss://your-project.livekit.cloud` |

> These are used by the `/api/token` serverless function only. They stay server-side and are never exposed to the browser.

### 4. Deploy

Vercel builds the Vite app and deploys `/api/token` as a serverless function automatically.

---

## Local Development

Run both services locally:

```bash
# Terminal 1 — token server (Python)
cd agent
cp .env.example .env  # fill in keys
source .venv/bin/activate
python token_server.py

# Terminal 2 — LiveKit agent
source .venv/bin/activate
python main.py dev

# Terminal 3 — frontend
cd frontend
cp .env.example .env.local
# Set VITE_TOKEN_ENDPOINT=http://localhost:8000/token in .env.local
npm run dev
```

---

## ECS Fargate (optional bonus path)

```bash
# Build and push image from agent/
aws ecr create-repository --repository-name quartermaster-agent --region us-east-1
aws ecr get-login-password | docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com

docker build -t quartermaster-agent .
docker tag quartermaster-agent:latest <account>.dkr.ecr.us-east-1.amazonaws.com/quartermaster-agent:latest
docker push <account>.dkr.ecr.us-east-1.amazonaws.com/quartermaster-agent:latest
```

ECS task: Fargate, 1 vCPU / 2 GB, all `.env` keys as environment variables.
Mount EFS at `/app/data/rag_index` to persist the RAG index across container restarts.
No ALB needed — the agent connects outbound to LiveKit Cloud only.
