import { useState, useEffect, useRef, useCallback } from "react";
import "@/App.css";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { 
  Radio, Send, Plus, Settings, FileText, Trash2, LogOut, 
  MessageSquare, Upload, X, Check, ChevronDown, Loader2,
  Zap, Database, Bot, User, AlertCircle, Menu, Info
} from "lucide-react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// API client with auth
const apiClient = axios.create({
  baseURL: API,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("rf_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ============== AUTH PAGES ==============

const AuthPage = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = isLogin ? "/auth/login" : "/auth/register";
      const payload = isLogin 
        ? { email, password } 
        : { email, password, name };
      
      const response = await apiClient.post(endpoint, payload);
      localStorage.setItem("rf_token", response.data.access_token);
      onLogin(response.data.user);
    } catch (err) {
      setError(err.response?.data?.detail || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-6">
      <div className="noise-overlay" />
      
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-blue-600/20 border border-blue-600/30 mb-4">
            <Radio className="w-8 h-8 text-blue-500" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">RF-Intel</h1>
          <p className="text-zinc-500 mt-2">RF Engineering AI Assistant</p>
        </div>

        {/* Auth Card */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8">
          <div className="flex gap-2 mb-6">
            <button
              data-testid="login-tab"
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
                isLogin 
                  ? "bg-blue-600 text-white" 
                  : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Sign In
            </button>
            <button
              data-testid="register-tab"
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
                !isLogin 
                  ? "bg-blue-600 text-white" 
                  : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded-lg flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Name</label>
                <input
                  data-testid="name-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-12 px-4 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  placeholder="Your name"
                  required={!isLogin}
                />
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Email</label>
              <input
                data-testid="email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-12 px-4 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                placeholder="you@example.com"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Password</label>
              <input
                data-testid="password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-12 px-4 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                placeholder="Min 6 characters"
                required
                minLength={6}
              />
            </div>

            <button
              data-testid="auth-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-lg shadow-blue-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                isLogin ? "Sign In" : "Create Account"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-zinc-600 text-sm mt-6">
          Intelligent search through RF patents & research
        </p>
      </div>
    </div>
  );
};

// ============== MAIN DASHBOARD ==============

const Dashboard = ({ user, onLogout }) => {
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [selectedModel, setSelectedModel] = useState(user.default_model || "openai");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [stats, setStats] = useState({ documents: 0, conversations: 0, indexed_chunks: 0 });
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    loadConversations();
    loadDocuments();
    loadStats();
  }, []);

  const loadConversations = async () => {
    try {
      const response = await apiClient.get("/conversations");
      setConversations(response.data);
    } catch (err) {
      console.error("Failed to load conversations:", err);
    }
  };

  const loadDocuments = async () => {
    try {
      const response = await apiClient.get("/documents");
      setDocuments(response.data);
    } catch (err) {
      console.error("Failed to load documents:", err);
    }
  };

  const loadStats = async () => {
    try {
      const response = await apiClient.get("/stats");
      setStats(response.data);
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  };

  const loadConversation = async (convId) => {
    try {
      const response = await apiClient.get(`/conversations/${convId}`);
      setCurrentConversation(response.data);
      setMessages(response.data.messages || []);
    } catch (err) {
      console.error("Failed to load conversation:", err);
    }
  };

  const startNewConversation = () => {
    setCurrentConversation(null);
    setMessages([]);
    inputRef.current?.focus();
  };

  const deleteConversation = async (convId, e) => {
    e.stopPropagation();
    try {
      await apiClient.delete(`/conversations/${convId}`);
      setConversations(prev => prev.filter(c => c.id !== convId));
      if (currentConversation?.id === convId) {
        startNewConversation();
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = { role: "user", content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await apiClient.post("/chat", {
        message: input,
        conversation_id: currentConversation?.id,
        provider: selectedModel,
        include_sources: true
      });

      const assistantMessage = {
        role: "assistant",
        content: response.data.response,
        sources: response.data.sources,
        model: response.data.model_used
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Update current conversation
      if (!currentConversation) {
        setCurrentConversation({ id: response.data.conversation_id });
        loadConversations();
      }
    } catch (err) {
      const errorMessage = err.response?.data?.detail || "Failed to send message";
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: `Error: ${errorMessage}`,
        isError: true 
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="h-screen flex bg-[#09090b] overflow-hidden">
      <div className="noise-overlay" />
      
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-72' : 'w-0'} bg-zinc-950 border-r border-zinc-800 flex flex-col transition-all duration-300 overflow-hidden`}>
        {/* Logo */}
        <div className="p-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-600/30 flex items-center justify-center">
              <Radio className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h1 className="font-bold text-white">RF-Intel</h1>
              <p className="text-xs text-zinc-500">v2.0</p>
            </div>
          </div>
        </div>

        {/* New Chat Button */}
        <div className="p-4">
          <button
            data-testid="new-chat-btn"
            onClick={startNewConversation}
            className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-900/20"
          >
            <Plus className="w-5 h-5" />
            New Chat
          </button>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto px-3">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider px-2 mb-2">History</p>
          <div className="space-y-1">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                data-testid={`conversation-${conv.id}`}
                onClick={() => loadConversation(conv.id)}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                  currentConversation?.id === conv.id 
                    ? "bg-zinc-800 text-white" 
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                }`}
              >
                <MessageSquare className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 truncate text-sm">{conv.title}</span>
                <button
                  data-testid={`delete-conv-${conv.id}`}
                  onClick={(e) => deleteConversation(conv.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-700 rounded transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5 text-zinc-500 hover:text-red-400" />
                </button>
              </div>
            ))}
            {conversations.length === 0 && (
              <p className="text-zinc-600 text-sm px-3 py-4 text-center">No conversations yet</p>
            )}
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-zinc-800 space-y-2">
          <button
            data-testid="documents-btn"
            onClick={() => setShowDocuments(true)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 rounded-lg transition-all"
          >
            <FileText className="w-4 h-4" />
            Documents
            {documents.length > 0 && (
              <span className="ml-auto text-xs bg-zinc-800 px-2 py-0.5 rounded-full">{documents.length}</span>
            )}
          </button>
          <button
            data-testid="settings-btn"
            onClick={() => setShowSettings(true)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 rounded-lg transition-all"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
          <button
            data-testid="logout-btn"
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 hover:text-red-400 hover:bg-zinc-800/50 rounded-lg transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-950/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <button
              data-testid="toggle-sidebar-btn"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-all lg:hidden"
            >
              <Menu className="w-5 h-5 text-zinc-400" />
            </button>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-all hidden lg:block"
            >
              <Menu className="w-5 h-5 text-zinc-400" />
            </button>
            <h2 className="font-medium text-zinc-200 truncate">
              {currentConversation?.title || "New Conversation"}
            </h2>
          </div>

          {/* Model Selector */}
          <div className="flex items-center gap-3">
            <ModelSelector 
              selected={selectedModel} 
              onChange={setSelectedModel}
            />
          </div>
        </header>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <WelcomeScreen stats={stats} onExampleClick={setInput} />
          ) : (
            <div className="max-w-4xl mx-auto p-6 space-y-6">
              {messages.map((msg, idx) => (
                <MessageBubble key={idx} message={msg} />
              ))}
              {loading && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-zinc-800 p-4 bg-zinc-950/80 backdrop-blur-md">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  data-testid="chat-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask about RF engineering, antenna design, 5G technology..."
                  className="w-full h-14 px-4 py-4 bg-zinc-900 border border-zinc-700 rounded-xl text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none font-mono text-sm"
                  rows={1}
                />
              </div>
              <button
                data-testid="send-btn"
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="h-14 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-800 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-all shadow-lg shadow-blue-900/20 disabled:shadow-none"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
            <p className="text-xs text-zinc-600 mt-2 text-center">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal 
          user={user}
          onClose={() => setShowSettings(false)} 
        />
      )}

      {/* Documents Modal */}
      {showDocuments && (
        <DocumentsModal
          documents={documents}
          onClose={() => setShowDocuments(false)}
          onUpdate={() => {
            loadDocuments();
            loadStats();
          }}
        />
      )}
    </div>
  );
};

// ============== COMPONENTS ==============

const ModelSelector = ({ selected, onChange }) => {
  const [open, setOpen] = useState(false);
  
  const models = [
    { id: "openai", name: "GPT-4o", icon: "O" },
    { id: "anthropic", name: "Claude Sonnet 4", icon: "A" },
    { id: "google", name: "Gemini 2.0 Flash", icon: "G" }
  ];

  const selectedModel = models.find(m => m.id === selected) || models[0];

  return (
    <div className="relative">
      <button
        data-testid="model-selector"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm transition-all"
      >
        <div className="w-5 h-5 rounded bg-blue-600/20 text-blue-400 flex items-center justify-center text-xs font-bold">
          {selectedModel.icon}
        </div>
        <span className="text-zinc-200">{selectedModel.name}</span>
        <ChevronDown className="w-4 h-4 text-zinc-500" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-50 overflow-hidden">
            {models.map((model) => (
              <button
                key={model.id}
                data-testid={`model-option-${model.id}`}
                onClick={() => {
                  onChange(model.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800 transition-all ${
                  selected === model.id ? "bg-zinc-800" : ""
                }`}
              >
                <div className="w-6 h-6 rounded bg-blue-600/20 text-blue-400 flex items-center justify-center text-xs font-bold">
                  {model.icon}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-zinc-200">{model.name}</p>
                </div>
                {selected === model.id && (
                  <Check className="w-4 h-4 text-blue-500" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const WelcomeScreen = ({ stats, onExampleClick }) => {
  const examples = [
    "What are key challenges in mmWave antenna design?",
    "Explain beamforming in 5G NR systems",
    "How to reduce mutual coupling in MIMO antennas?",
    "SAR compliance requirements for mobile devices"
  ];

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="max-w-2xl w-full text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-blue-600/20 border border-blue-600/30 mb-6">
          <Radio className="w-10 h-10 text-blue-500" />
        </div>
        
        <h2 className="text-3xl font-bold text-white mb-3">RF-Intel Assistant</h2>
        <p className="text-zinc-400 mb-8 max-w-md mx-auto">
          Your AI-powered RF engineering knowledge base. Ask questions about antenna design, 
          5G technology, and wireless communications.
        </p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              <FileText className="w-5 h-5 text-cyan-500" />
            </div>
            <p className="text-2xl font-bold text-white">{stats.documents}</p>
            <p className="text-xs text-zinc-500">Documents</p>
          </div>
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Database className="w-5 h-5 text-orange-500" />
            </div>
            <p className="text-2xl font-bold text-white">{stats.indexed_chunks}</p>
            <p className="text-xs text-zinc-500">Indexed Chunks</p>
          </div>
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              <MessageSquare className="w-5 h-5 text-green-500" />
            </div>
            <p className="text-2xl font-bold text-white">{stats.conversations}</p>
            <p className="text-xs text-zinc-500">Conversations</p>
          </div>
        </div>

        {/* Example Questions */}
        <p className="text-sm text-zinc-500 mb-4">Try asking:</p>
        <div className="grid grid-cols-2 gap-3">
          {examples.map((q, idx) => (
            <button
              key={idx}
              data-testid={`example-question-${idx}`}
              onClick={() => onExampleClick(q)}
              className="text-left p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl hover:border-zinc-700 hover:bg-zinc-900 transition-all group"
            >
              <p className="text-sm text-zinc-300 group-hover:text-white transition-colors">{q}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const MessageBubble = ({ message }) => {
  const isUser = message.role === "user";
  const [showSources, setShowSources] = useState(false);

  return (
    <div className={`flex gap-4 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-600/30 flex items-center justify-center flex-shrink-0">
          <Bot className="w-4 h-4 text-blue-500" />
        </div>
      )}
      
      <div className={`max-w-[80%] ${isUser ? "order-first" : ""}`}>
        <div className={`rounded-2xl px-4 py-3 ${
          isUser 
            ? "bg-blue-600 text-white rounded-tr-sm" 
            : message.isError 
              ? "bg-red-900/30 border border-red-800 text-red-300 rounded-tl-sm"
              : "bg-zinc-800 text-zinc-100 border border-zinc-700 rounded-tl-sm"
        }`}>
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="markdown-content text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Sources */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-2">
            <button
              data-testid="toggle-sources"
              onClick={() => setShowSources(!showSources)}
              className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <Info className="w-3.5 h-3.5" />
              {message.sources.length} sources referenced
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSources ? "rotate-180" : ""}`} />
            </button>
            
            {showSources && (
              <div className="mt-2 space-y-2">
                {message.sources.map((src, idx) => (
                  <div key={idx} className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-zinc-400">{src.document}</span>
                      <span className="text-xs bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded-full">
                        {Math.round(src.score * 100)}% match
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 line-clamp-3">{src.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Model indicator */}
        {!isUser && message.model && (
          <p className="text-xs text-zinc-600 mt-1">{message.model}</p>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
          <User className="w-4 h-4 text-zinc-400" />
        </div>
      )}
    </div>
  );
};

const TypingIndicator = () => (
  <div className="flex gap-4">
    <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-600/30 flex items-center justify-center">
      <Bot className="w-4 h-4 text-blue-500" />
    </div>
    <div className="bg-zinc-800 border border-zinc-700 rounded-2xl rounded-tl-sm px-4 py-3">
      <div className="flex gap-1.5">
        <div className="w-2 h-2 bg-zinc-500 rounded-full typing-dot" />
        <div className="w-2 h-2 bg-zinc-500 rounded-full typing-dot" />
        <div className="w-2 h-2 bg-zinc-500 rounded-full typing-dot" />
      </div>
    </div>
  </div>
);

const SettingsModal = ({ user, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <h2 className="text-xl font-bold text-white">Settings</h2>
          <button
            data-testid="close-settings"
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-all"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[60vh]">
          <div>
            <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">Account</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-4 bg-zinc-800/50 rounded-xl">
                <div className="w-12 h-12 rounded-full bg-blue-600/20 flex items-center justify-center">
                  <User className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <p className="font-medium text-zinc-200">{user.name}</p>
                  <p className="text-sm text-zinc-500">{user.email}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-800">
            <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">AI Models</h3>
            <p className="text-sm text-zinc-400 mb-4">
              RF-Intel uses premium AI models powered by Emergent. Switch between models using the selector in the header.
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 bg-zinc-800/30 rounded-lg">
                <div className="w-8 h-8 rounded bg-blue-600/20 flex items-center justify-center text-xs font-bold text-blue-400">O</div>
                <span className="text-sm text-zinc-300">GPT-4o</span>
                <span className="ml-auto text-xs bg-green-600/20 text-green-400 px-2 py-0.5 rounded-full">Available</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-zinc-800/30 rounded-lg">
                <div className="w-8 h-8 rounded bg-blue-600/20 flex items-center justify-center text-xs font-bold text-blue-400">A</div>
                <span className="text-sm text-zinc-300">Claude Sonnet 4</span>
                <span className="ml-auto text-xs bg-green-600/20 text-green-400 px-2 py-0.5 rounded-full">Available</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-zinc-800/30 rounded-lg">
                <div className="w-8 h-8 rounded bg-blue-600/20 flex items-center justify-center text-xs font-bold text-blue-400">G</div>
                <span className="text-sm text-zinc-300">Gemini 2.0 Flash</span>
                <span className="ml-auto text-xs bg-green-600/20 text-green-400 px-2 py-0.5 rounded-full">Available</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const DocumentsModal = ({ documents, onClose, onUpdate }) => {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const fileInputRef = useRef(null);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      await apiClient.post("/documents/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      onUpdate();
    } catch (err) {
      console.error("Failed to upload document:", err);
      alert(err.response?.data?.detail || "Failed to upload document");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (docId) => {
    setDeleting(docId);
    try {
      await apiClient.delete(`/documents/${docId}`);
      onUpdate();
    } catch (err) {
      console.error("Failed to delete document:", err);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <h2 className="text-xl font-bold text-white">Documents</h2>
          <button
            data-testid="close-documents"
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-all"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
          {/* Upload Area */}
          <div 
            className="border-2 border-dashed border-zinc-700 hover:border-blue-500 rounded-xl p-8 text-center transition-all cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleUpload}
              className="hidden"
              data-testid="file-input"
            />
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                <p className="text-sm text-zinc-400">Processing document...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-blue-600/20 flex items-center justify-center">
                  <Upload className="w-7 h-7 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-200">Click to upload PDF</p>
                  <p className="text-xs text-zinc-500 mt-1">Documents will be indexed for RAG search</p>
                </div>
              </div>
            )}
          </div>

          {/* Documents List */}
          <div className="space-y-2">
            {documents.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-8">No documents uploaded yet</p>
            ) : (
              documents.map((doc) => (
                <div 
                  key={doc.id}
                  className="flex items-center gap-3 p-3 bg-zinc-800/50 border border-zinc-800 rounded-xl"
                >
                  <div className="w-10 h-10 rounded-lg bg-orange-600/20 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">{doc.filename}</p>
                    <p className="text-xs text-zinc-500">{doc.chunk_count} chunks indexed</p>
                  </div>
                  <button
                    data-testid={`delete-doc-${doc.id}`}
                    onClick={() => handleDelete(doc.id)}
                    disabled={deleting === doc.id}
                    className="p-2 hover:bg-zinc-700 rounded-lg transition-all"
                  >
                    {deleting === doc.id ? (
                      <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 text-zinc-400 hover:text-red-400" />
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============== MAIN APP ==============

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem("rf_token");
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const response = await apiClient.get("/auth/me");
      setUser(response.data);
    } catch (err) {
      localStorage.removeItem("rf_token");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem("rf_token");
    setUser(null);
  };

  if (loading) {
    return (
      <div className="h-screen bg-[#09090b] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          <p className="text-zinc-500">Loading...</p>
        </div>
      </div>
    );
  }

  return user ? (
    <Dashboard user={user} onLogout={handleLogout} />
  ) : (
    <AuthPage onLogin={handleLogin} />
  );
}

export default App;
