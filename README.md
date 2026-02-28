# RF Engineering ChatBot

<div align="center">

![MIT License](https://img.shields.io/badge/License-MIT-green.svg)
![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)
![React](https://img.shields.io/badge/React-19.0-61dafb.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110-009688.svg)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248.svg)

**Ask technical RF engineering questions. Get answers grounded in your own documentation.**

[Features](#features) • [Quick Start](#quick-start) • [Usage](#usage) • [API](#api-reference) • [Architecture](#architecture) • [Deployment](#deployment)

</div>

---

## What is this?

RF Engineering Assistant is a full-stack RAG chatbot built for RF and antenna engineers. Upload your datasheets, specs, and research papers — then ask natural language questions and get answers cited directly from your documents.

**Switch between GPT-4o, Claude, and Gemini mid-conversation.** No context lost.

## Features

| Feature | Description |
|---|---|
| **RAG Pipeline** | Upload PDFs; answers are grounded in your documents with source citations |
| **Multi-Model** | Switch between GPT-4o, Claude Opus, and Gemini Flash in one conversation |
| **JWT Auth** | Secure accounts with persistent conversation history per user |
| **Document Manager** | Upload, browse, and delete indexed PDFs from the UI |
| **Conversation History** | All chats saved to MongoDB, accessible from the sidebar |
| **Dark UI** | Clean, minimal interface built with React 19 and Tailwind CSS |

## Quick Start

### Prerequisites
- Python 3.10+, Node.js 18+, MongoDB (Atlas free tier works)

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/rf-engineering-assistant.git
cd rf-engineering-assistant
```

### 2. Backend setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # fill in your values
uvicorn server:app --reload
```

### 3. Frontend setup

```bash
cd frontend
npm install
echo "REACT_APP_BACKEND_URL=http://localhost:8000" > .env
npm start
```

### 4. Environment variables

Create `backend/.env` from `.env.example`:

```bash
MONGO_URL=mongodb+srv://user:pass@cluster.mongodb.net/rf_chatbot
DB_NAME=rf_chatbot
JWT_SECRET=your_random_secret_here

OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
```

You only need keys for the models you want to enable.

## Usage

1. **Register** — create an account on the auth screen
2. **Upload PDFs** — click the document icon and upload RF datasheets or specs
3. **Ask questions** — type in the chat; answers cite the source document and chunk
4. **Switch models** — use the model selector dropdown to change LLM mid-conversation
5. **Browse history** — previous conversations are saved in the sidebar

## API Reference

All routes prefixed `/api`. Interactive docs at `http://localhost:8000/docs`.

**Auth**

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Returns JWT |
| GET | `/auth/me` | Current user profile |

**Chat & Conversations**

| Method | Endpoint | Description |
|---|---|---|
| POST | `/chat` | Send message, get RAG-grounded response |
| GET | `/conversations` | List all conversations |
| GET | `/conversations/:id` | Full conversation with history |
| DELETE | `/conversations/:id` | Delete conversation |

**Documents**

| Method | Endpoint | Description |
|---|---|---|
| POST | `/documents/upload` | Upload PDF, triggers indexing |
| GET | `/documents` | List uploaded documents |
| DELETE | `/documents/:id` | Remove document, rebuild index |

**Settings**

| Method | Endpoint | Description |
|---|---|---|
| PUT | `/settings` | Update default model preference |
| GET | `/stats` | User usage statistics |

## Architecture

```
                    RF ENGINEERING ASSISTANT
                    ========================

     FRONTEND (React 19 + Tailwind CSS)
     ┌─────────────────────────────────────────────┐
     │  AuthPage    ChatWindow    DocumentManager   │
     │  Sidebar     ModelSelector  SourceCitations  │
     └────────────────────┬────────────────────────┘
                          │  REST / JSON
                          ▼
     BACKEND (FastAPI + Python 3.10)
     ┌─────────────────────────────────────────────┐
     │  ┌───────────┐  ┌──────────┐  ┌─────────┐  │
     │  │ JWT Auth  │  │  Router  │  │  Motor  │  │
     │  │ bcrypt    │→ │ /api/*   │→ │ async   │  │
     │  │ HS256     │  │ Pydantic │  │ MongoDB │  │
     │  └───────────┘  └────┬─────┘  └─────────┘  │
     └──────────────────────┼──────────────────────┘
                            │
              ┌─────────────▼─────────────┐
              │       RAG PIPELINE        │
              │  PDF → chunk → embed →    │
              │  FAISS index → top-k=5    │
              │  → inject as context      │
              └─────────────┬─────────────┘
                            │
              ┌─────────────▼─────────────┐
              │      LLM PROVIDERS        │
              │   LLMProvider.generate()  │
              │  OpenAI · Anthropic · GCP │
              └─────────────┬─────────────┘
                            │
          ┌─────────────────┴──────────────────┐
   ┌──────▼───────┐                 ┌──────────▼──────┐
   │   MongoDB    │                 │  FAISS on disk  │
   │  users       │                 │  rf_index.faiss │
   │  conversations│                │  rf_meta.pkl    │
   │  documents   │                 │  /uploads dir   │
   └──────────────┘                 └─────────────────┘
```

**Key decisions:**
- **FAISS over Pinecone** — in-process, zero latency, no cost at this doc count
- **MiniLM local embeddings** — no per-embedding API cost, fast enough to run synchronously on upload
- **500-word chunks / 50-word overlap** — overlap prevents answers cut at boundaries in multi-paragraph specs
- **Async FastAPI + Motor** — LLM calls take 3–10s; async lets one worker handle concurrent requests without blocking
- **Stateless JWT** — horizontally scalable with no shared session store; 7-day expiry trades revocation for simplicity

## Deployment

Recommended free stack: **Vercel** (frontend) + **Render** (backend) + **MongoDB Atlas** (database)

See the [deployment guide](DEPLOYMENT.md) for step-by-step instructions covering Render, Vercel, and MongoDB Atlas.

## Project Structure

```
rf-engineering-assistant/
├── backend/
│   ├── server.py          # All routes, RAG engine, auth, LLM providers
│   ├── requirements.txt
│   ├── .env.example
│   ├── data/              # FAISS index (auto-created)
│   └── uploads/           # PDFs (auto-created)
└── frontend/
    ├── src/
    │   ├── App.js          # All components
    │   ├── App.css
    │   └── index.css
    └── package.json
```

## License

MIT — see [LICENSE](LICENSE) for details.

