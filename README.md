# RF Engineering AI Assistant

A full-stack RAG (Retrieval-Augmented Generation) chatbot for RF and antenna engineering queries. Built with React, FastAPI, MongoDB, and FAISS.

## Features

- **Multi-model support** — switch between GPT-4o, Claude, and Gemini mid-conversation
- **RAG pipeline** — upload RF engineering PDFs; answers are grounded in your documents
- **JWT authentication** — secure user accounts with persistent conversation history
- **Dark-themed UI** — clean, professional interface built with React and Tailwind CSS

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Tailwind CSS |
| Backend | FastAPI (Python) |
| Database | MongoDB (Motor async driver) |
| Vector store | FAISS + Sentence Transformers |
| LLMs | OpenAI GPT-4o, Anthropic Claude, Google Gemini |

## Project Structure

```
rf-engineering-assistant/
├── backend/
│   ├── server.py          # FastAPI app — auth, RAG engine, chat routes
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.js         # Main React app + all components
    │   ├── App.css
    │   └── index.css
    └── package.json
```

## Local Setup

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Copy and fill in your credentials
cp .env.example .env
uvicorn server:app --reload
```

### Frontend

```bash
cd frontend
npm install
echo "REACT_APP_BACKEND_URL=http://localhost:8000" > .env
npm start
```

## Environment Variables

Create `backend/.env` from the provided `.env.example`:

```
MONGO_URL=mongodb+srv://...
JWT_SECRET=your_random_secret
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
```

You only need API keys for the models you want to enable.

## Architecture Notes

The RAG pipeline uses FAISS for vector similarity search and `all-MiniLM-L6-v2` for embeddings. Documents are chunked with overlap for better retrieval. Retrieved chunks are injected into the system prompt with source citations shown under each response.

Authentication uses JWT tokens with bcrypt password hashing. Conversation history is persisted to MongoDB per user.
