from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext
import aiofiles
import asyncio
from bson import ObjectId
import json

# RAG imports
import faiss
import numpy as np
from pypdf import PdfReader
import pickle
import io

# LLM imports - direct SDK integrations
import openai
import anthropic
import google.generativeai as genai

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
SECRET_KEY = os.environ.get('JWT_SECRET', 'rf-intel-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# Create the main app
app = FastAPI(title="RF-Intel API", version="2.0.0")
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============== MODELS ==============

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    default_model: str
    api_keys: List[Dict[str, Any]]
    created_at: str

class APIKeyUpdate(BaseModel):
    provider: str
    api_key: str

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    provider: Optional[str] = None
    include_sources: bool = True

class ChatResponse(BaseModel):
    response: str
    conversation_id: str
    sources: List[Dict[str, Any]]
    model_used: str

class ConversationResponse(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str
    message_count: int

class DocumentResponse(BaseModel):
    id: str
    filename: str
    uploaded_at: str
    chunk_count: int
    status: str

class SettingsUpdate(BaseModel):
    default_model: Optional[str] = None

# ============== AUTH HELPERS ==============

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ============== RAG ENGINE ==============

class RAGEngine:
    def __init__(self):
        self.documents: List[str] = []
        self.doc_names: List[str] = []
        self.doc_ids: List[str] = []
        self.index: faiss.Index = None
        self.embedding_model = None
        self.index_path = ROOT_DIR / "data" / "rf_index.faiss"
        self.meta_path = ROOT_DIR / "data" / "rf_meta.pkl"
        
    async def initialize(self):
        """Initialize the embedding model and load existing index"""
        if self.embedding_model is not None:
            return  # Already initialized
        logger.info("Initializing RAG Engine...")
        from sentence_transformers import SentenceTransformer
        loop = asyncio.get_event_loop()
        self.embedding_model = await loop.run_in_executor(
            None, lambda: SentenceTransformer("all-MiniLM-L6-v2")
        )
        
        # Create data directory
        (ROOT_DIR / "data").mkdir(exist_ok=True)
        (ROOT_DIR / "uploads").mkdir(exist_ok=True)
        
        # Load existing index if available
        if self.index_path.exists() and self.meta_path.exists():
            await self._load_index()
        else:
            # Initialize empty index
            dimension = 384  # all-MiniLM-L6-v2 dimension
            self.index = faiss.IndexFlatL2(dimension)
            
        logger.info(f"RAG Engine initialized with {len(self.documents)} chunks")
        
    async def _load_index(self):
        """Load FAISS index from disk"""
        self.index = faiss.read_index(str(self.index_path))
        with open(self.meta_path, "rb") as f:
            meta = pickle.load(f)
        self.documents = meta.get("documents", [])
        self.doc_names = meta.get("doc_names", [])
        self.doc_ids = meta.get("doc_ids", [])
        
    async def _save_index(self):
        """Save FAISS index to disk"""
        faiss.write_index(self.index, str(self.index_path))
        meta = {
            "documents": self.documents,
            "doc_names": self.doc_names,
            "doc_ids": self.doc_ids
        }
        with open(self.meta_path, "wb") as f:
            pickle.dump(meta, f)
            
    def _split_into_chunks(self, text: str, chunk_size: int = 500) -> List[str]:
        """Split text into overlapping chunks"""
        words = text.split()
        chunks = []
        overlap = 50
        for i in range(0, len(words), chunk_size - overlap):
            chunk = " ".join(words[i:i + chunk_size])
            if len(chunk.strip()) > 50:
                chunks.append(chunk)
        return chunks
        
    async def add_document(self, file_content: bytes, filename: str, doc_id: str) -> int:
        """Add a PDF document to the index"""
        try:
            reader = PdfReader(io.BytesIO(file_content))
            text = ""
            for page in reader.pages:
                page_text = page.extract_text() or ""
                text += page_text + "\n"
                
            chunks = self._split_into_chunks(text)
            if not chunks:
                return 0
                
            # Embed chunks
            embeddings = self.embedding_model.encode(chunks, show_progress_bar=False, convert_to_numpy=True)
            
            # Add to index
            self.index.add(embeddings.astype("float32"))
            
            # Store metadata
            for chunk in chunks:
                self.documents.append(chunk)
                self.doc_names.append(filename)
                self.doc_ids.append(doc_id)
                
            await self._save_index()
            return len(chunks)
            
        except Exception as e:
            logger.error(f"Error adding document: {e}")
            raise
            
    async def remove_document(self, doc_id: str):
        """Remove a document from the index (rebuild required)"""
        # Find indices to keep
        indices_to_keep = [i for i, d_id in enumerate(self.doc_ids) if d_id != doc_id]
        
        if len(indices_to_keep) == len(self.doc_ids):
            return  # Document not found
            
        # Rebuild index with remaining documents
        self.documents = [self.documents[i] for i in indices_to_keep]
        self.doc_names = [self.doc_names[i] for i in indices_to_keep]
        self.doc_ids = [self.doc_ids[i] for i in indices_to_keep]
        
        if self.documents:
            embeddings = self.embedding_model.encode(self.documents, show_progress_bar=False, convert_to_numpy=True)
            dimension = embeddings.shape[1]
            self.index = faiss.IndexFlatL2(dimension)
            self.index.add(embeddings.astype("float32"))
        else:
            dimension = 384
            self.index = faiss.IndexFlatL2(dimension)
            
        await self._save_index()
        
    def search(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """Search for relevant document chunks"""
        if self.index is None or self.index.ntotal == 0:
            return []
            
        query_embedding = self.embedding_model.encode([query], convert_to_numpy=True).astype("float32")
        distances, indices = self.index.search(query_embedding, min(top_k, self.index.ntotal))
        
        results = []
        for idx, distance in zip(indices[0], distances[0]):
            if idx < len(self.documents):
                similarity = float(1.0 / (1.0 + distance))
                results.append({
                    "content": self.documents[idx],
                    "document": self.doc_names[idx],
                    "score": similarity
                })
        return results

# Global RAG engine
rag_engine = RAGEngine()

# ============== LLM PROVIDERS ==============

class LLMProvider:
    """Direct LLM integrations using provider SDKs."""

    @staticmethod
    def _build_messages(system_prompt: str, user_prompt: str, conversation_history: List[Dict] = None) -> List[Dict]:
        """Build message list from history + current prompt."""
        messages = []
        if conversation_history:
            for msg in conversation_history[-6:]:  # last 6 messages for context
                messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": user_prompt})
        return messages

    @staticmethod
    async def generate(provider: str, system_prompt: str, user_prompt: str, conversation_history: List[Dict] = None, session_id: str = None) -> str:
        """Generate a response using the selected LLM provider."""

        messages = LLMProvider._build_messages(system_prompt, user_prompt, conversation_history)

        if provider == "openai":
            api_key = os.environ.get("OPENAI_API_KEY")
            if not api_key:
                raise ValueError("OPENAI_API_KEY not configured")
            client = openai.AsyncOpenAI(api_key=api_key)
            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "system", "content": system_prompt}] + messages,
            )
            return response.choices[0].message.content

        elif provider == "anthropic":
            api_key = os.environ.get("ANTHROPIC_API_KEY")
            if not api_key:
                raise ValueError("ANTHROPIC_API_KEY not configured")
            client = anthropic.AsyncAnthropic(api_key=api_key)
            response = await client.messages.create(
                model="claude-opus-4-5",
                max_tokens=1024,
                system=system_prompt,
                messages=messages,
            )
            return response.content[0].text

        elif provider == "google":
            api_key = os.environ.get("GOOGLE_API_KEY")
            if not api_key:
                raise ValueError("GOOGLE_API_KEY not configured")
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel(
                model_name="gemini-2.0-flash",
                system_instruction=system_prompt,
            )
            # Gemini uses a flat string for simple single-turn calls
            history_text = ""
            if conversation_history:
                for msg in conversation_history[-6:]:
                    role = "User" if msg["role"] == "user" else "Assistant"
                    history_text += f"{role}: {msg['content']}\n\n"
            full_prompt = history_text + f"User: {user_prompt}"
            response = model.generate_content(full_prompt)
            return response.text

        else:
            raise ValueError(f"Unknown provider: {provider}")

# ============== AUTH ROUTES ==============

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    """Register a new user"""
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    user_doc = {
        "email": user_data.email,
        "password_hash": get_password_hash(user_data.password),
        "name": user_data.name,
        "default_model": "openai",
        "api_keys": [],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    
    token = create_access_token({"sub": user_id})
    
    return TokenResponse(
        access_token=token,
        user={
            "id": user_id,
            "email": user_data.email,
            "name": user_data.name,
            "default_model": "openai"
        }
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(user_data: UserLogin):
    """Login user"""
    user = await db.users.find_one({"email": user_data.email})
    if not user or not verify_password(user_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
        
    token = create_access_token({"sub": str(user["_id"])})
    
    # Sanitize API keys for response
    api_keys = [{"provider": k["provider"], "configured": True} for k in user.get("api_keys", [])]
    
    return TokenResponse(
        access_token=token,
        user={
            "id": str(user["_id"]),
            "email": user["email"],
            "name": user["name"],
            "default_model": user.get("default_model", "openai"),
            "api_keys": api_keys
        }
    )

@api_router.get("/auth/me")
async def get_me(user = Depends(get_current_user)):
    """Get current user info"""
    api_keys = [{"provider": k["provider"], "configured": True} for k in user.get("api_keys", [])]
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "name": user["name"],
        "default_model": user.get("default_model", "openai"),
        "api_keys": api_keys
    }

# ============== SETTINGS ROUTES ==============

@api_router.post("/settings/api-key")
async def update_api_key(key_data: APIKeyUpdate, user = Depends(get_current_user)):
    """Add or update an API key"""
    user_id = user["_id"]
    
    # Remove existing key for this provider
    await db.users.update_one(
        {"_id": user_id},
        {"$pull": {"api_keys": {"provider": key_data.provider}}}
    )
    
    # Add new key
    await db.users.update_one(
        {"_id": user_id},
        {"$push": {"api_keys": {"provider": key_data.provider, "api_key": key_data.api_key}}}
    )
    
    return {"message": "API key updated successfully"}

@api_router.delete("/settings/api-key/{provider}")
async def delete_api_key(provider: str, user = Depends(get_current_user)):
    """Delete an API key"""
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$pull": {"api_keys": {"provider": provider}}}
    )
    return {"message": "API key deleted"}

@api_router.put("/settings")
async def update_settings(settings: SettingsUpdate, user = Depends(get_current_user)):
    """Update user settings"""
    update_data = {}
    if settings.default_model:
        update_data["default_model"] = settings.default_model
        
    if update_data:
        await db.users.update_one({"_id": user["_id"]}, {"$set": update_data})
        
    return {"message": "Settings updated"}

# ============== DOCUMENT ROUTES ==============

@api_router.post("/documents/upload", response_model=DocumentResponse)
async def upload_document(file: UploadFile = File(...), user = Depends(get_current_user)):
    """Upload a PDF document"""
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
        
    content = await file.read()
    doc_id = str(uuid.uuid4())
    
    # Save file
    file_path = ROOT_DIR / "uploads" / f"{doc_id}.pdf"
    async with aiofiles.open(file_path, 'wb') as f:
        await f.write(content)
        
    # Process and index
    try:
        chunk_count = await rag_engine.add_document(content, file.filename, doc_id)
    except Exception as e:
        # Clean up file on failure
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")
        
    # Store document metadata
    doc_record = {
        "_id": doc_id,
        "user_id": str(user["_id"]),
        "filename": file.filename,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "chunk_count": chunk_count,
        "status": "indexed"
    }
    await db.documents.insert_one(doc_record)
    
    return DocumentResponse(
        id=doc_id,
        filename=file.filename,
        uploaded_at=doc_record["uploaded_at"],
        chunk_count=chunk_count,
        status="indexed"
    )

@api_router.get("/documents", response_model=List[DocumentResponse])
async def list_documents(user = Depends(get_current_user)):
    """List all uploaded documents"""
    cursor = db.documents.find({"user_id": str(user["_id"])})
    documents = await cursor.to_list(100)
    
    return [
        DocumentResponse(
            id=str(doc["_id"]),
            filename=doc["filename"],
            uploaded_at=doc["uploaded_at"],
            chunk_count=doc.get("chunk_count", 0),
            status=doc.get("status", "indexed")
        )
        for doc in documents
    ]

@api_router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, user = Depends(get_current_user)):
    """Delete a document"""
    doc = await db.documents.find_one({"_id": doc_id, "user_id": str(user["_id"])})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    # Remove from index
    await rag_engine.remove_document(doc_id)
    
    # Delete file
    file_path = ROOT_DIR / "uploads" / f"{doc_id}.pdf"
    if file_path.exists():
        file_path.unlink()
        
    # Delete record
    await db.documents.delete_one({"_id": doc_id})
    
    return {"message": "Document deleted"}

# ============== CHAT ROUTES ==============

@api_router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, user = Depends(get_current_user)):
    """Send a message and get AI response"""
    user_id = str(user["_id"])
    
    # Determine provider (default to openai)
    provider = request.provider or user.get("default_model", "openai")
    
    # Get or create conversation
    if request.conversation_id:
        conversation = await db.conversations.find_one({
            "_id": ObjectId(request.conversation_id),
            "user_id": user_id
        })
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
    else:
        # Create new conversation
        conversation = {
            "user_id": user_id,
            "title": request.message[:50] + "..." if len(request.message) > 50 else request.message,
            "messages": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        result = await db.conversations.insert_one(conversation)
        conversation["_id"] = result.inserted_id
        
    conversation_id = str(conversation["_id"])
    
    # Search for relevant context
    sources = []
    context = ""
    if request.include_sources:
        sources = rag_engine.search(request.message, top_k=5)
        if sources:
            context_parts = []
            for i, src in enumerate(sources, 1):
                context_parts.append(f"[Source {i} - {src['document']} - {src['score']:.0%} relevance]\n{src['content'][:800]}")
            context = "\n\n".join(context_parts)
            
    # Build system prompt
    system_prompt = """You are RF-Intel, an expert AI assistant specializing in RF (Radio Frequency) engineering, antenna design, 5G technology, and wireless communications.

Your expertise includes:
- Antenna design and optimization (MIMO, phased arrays, patch antennas)
- RF circuit design and analysis
- 5G NR specifications and mmWave technology
- Signal propagation and interference mitigation
- SAR compliance and regulatory requirements
- Beamforming and spatial filtering techniques

Guidelines:
1. Provide technically accurate, detailed responses
2. Use proper engineering terminology
3. Reference specific frequencies, standards, and specifications when relevant
4. Structure complex answers with clear headings and bullet points
5. Acknowledge limitations in the source material when applicable"""

    if context:
        system_prompt += f"""

You have access to the following technical documentation excerpts. Use them to inform your response:

{context}

When using information from sources, cite them appropriately (e.g., "According to Source 1...")."""

    # Get conversation history
    history = conversation.get("messages", [])[-10:]  # Last 10 messages
    
    # Generate response using Emergent LLM key (no user API key needed)
    try:
        response_text = await LLMProvider.generate(
            provider=provider,
            system_prompt=system_prompt,
            user_prompt=request.message,
            conversation_history=history,
            session_id=f"rf-intel-{user_id}-{conversation_id}"
        )
    except Exception as e:
        logger.error(f"LLM generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate response: {str(e)}")
        
    # Update conversation
    new_messages = [
        {"role": "user", "content": request.message},
        {"role": "assistant", "content": response_text}
    ]
    
    await db.conversations.update_one(
        {"_id": conversation["_id"]},
        {
            "$push": {"messages": {"$each": new_messages}},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    # Map provider to model name
    model_names = {
        "openai": "GPT-4o",
        "anthropic": "Claude Sonnet 4",
        "google": "Gemini 2.0 Flash"
    }
    
    return ChatResponse(
        response=response_text,
        conversation_id=conversation_id,
        sources=sources,
        model_used=model_names.get(provider, provider)
    )

@api_router.get("/conversations", response_model=List[ConversationResponse])
async def list_conversations(user = Depends(get_current_user)):
    """List all conversations"""
    cursor = db.conversations.find(
        {"user_id": str(user["_id"])}
    ).sort("updated_at", -1).limit(50)
    
    conversations = await cursor.to_list(50)
    
    return [
        ConversationResponse(
            id=str(conv["_id"]),
            title=conv.get("title", "Untitled"),
            created_at=conv["created_at"],
            updated_at=conv["updated_at"],
            message_count=len(conv.get("messages", []))
        )
        for conv in conversations
    ]

@api_router.get("/conversations/{conv_id}")
async def get_conversation(conv_id: str, user = Depends(get_current_user)):
    """Get a specific conversation with all messages"""
    conversation = await db.conversations.find_one({
        "_id": ObjectId(conv_id),
        "user_id": str(user["_id"])
    })
    
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    return {
        "id": str(conversation["_id"]),
        "title": conversation.get("title", "Untitled"),
        "messages": conversation.get("messages", []),
        "created_at": conversation["created_at"],
        "updated_at": conversation["updated_at"]
    }

@api_router.delete("/conversations/{conv_id}")
async def delete_conversation(conv_id: str, user = Depends(get_current_user)):
    """Delete a conversation"""
    result = await db.conversations.delete_one({
        "_id": ObjectId(conv_id),
        "user_id": str(user["_id"])
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    return {"message": "Conversation deleted"}

# ============== HEALTH & STATUS ==============

@api_router.get("/")
async def root():
    """Health check"""
    return {"message": "RF-Intel API is running", "version": "2.0.0"}

@api_router.get("/stats")
async def get_stats(user = Depends(get_current_user)):
    """Get user statistics"""
    user_id = str(user["_id"])
    
    doc_count = await db.documents.count_documents({"user_id": user_id})
    conv_count = await db.conversations.count_documents({"user_id": user_id})
    
    return {
        "documents": doc_count,
        "conversations": conv_count,
        "indexed_chunks": rag_engine.index.ntotal if rag_engine.index else 0
    }

# Include router
app.include_router(api_router)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup event
@app.on_event("startup")
async def startup():
    logger.info("RF-Intel API started - RAG engine will initialize on first document upload")


@app.on_event("shutdown")
async def shutdown():
    client.close()
    logger.info("RF-Intel API shutdown")
