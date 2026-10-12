# 🌿 EcoLegacy (EchoLegacy) — Conversational AI Historical Avatars

> *"Great minds left us their wisdom in books nobody reads. What if you could just ask them?"*

EcoLegacy is an end-to-end multimodal AI platform that allows users to have **real-time, voice-to-voice, grounded conversations** with digital avatars of iconic historical figures and thinkers—including **Osho**, **Nikola Tesla**, **Bhagat Singh**, **Sushant Singh Rajput**, and **Adolf Hitler (historical analysis persona)**.

EcoLegacy combines **Retrieval-Augmented Generation (RAG)** over authoritative original texts, **zero-shot voice cloning**, and **facial animation** to deliver an authentic, hallucination-resistant conversational experience.

---

## 📑 Table of Contents
1. [Core Features](#-core-features)
2. [What is RAG & How EcoLegacy Uses It](#-what-is-rag--how-ecolegacy-uses-it)
3. [System Architecture & Data Flow](#-system-architecture--data-flow)
4. [Technology Stack & Tools Breakdown](#-technology-stack--tools-breakdown)
5. [Multi-Tier Voice Cloning Pipeline](#-multi-tier-voice-cloning-pipeline)
6. [Database Schema & Vector Search](#-database-schema--vector-search)
7. [Installation & Setup Guide](#-installation--setup-guide)
8. [Running the Application](#-running-the-application)
9. [Project Directory Structure](#-project-directory-structure)
10. [AI Expo Presentation Readiness](#-ai-expo-presentation-readiness)

---

## ✨ Core Features

- 🎙️ **Zero-Cost Browser Speech-to-Text (STT):** Uses the browser-native Web Speech API (`webkitSpeechRecognition`) tuned for conversational queries without paid cloud STT dependencies.
- 🧠 **Grounding via pgvector RAG:** Eliminates generic AI hallucinations by extracting, chunking, and embedding thousands of pages from original discourses and books into Supabase `pgvector`.
- ⚡ **Ultra-Fast LLM Inference:** Powered by Groq Cloud (`llama-3.1-8b-instant`) and Google Gemini (`gemini-1.5-flash`) delivering answers within ~1.2 seconds.
- 🗣️ **Authentic Voice Cloning:** Multi-tier speech synthesis using **Smallest.ai Lightning-v3.1**, **F5-TTS** on Hugging Face ZeroGPU Spaces, and local PyTorch models (**Coqui XTTS v2 / Bark**).
- 🎬 **Animated Talking Avatar:** Synchronized lip and facial motion generated via **Wav2Lip / LivePortrait** served over a secure Ngrok tunnel with automatic static-fallback.
- 🛡️ **Rate Limiting & Character Locking:** Dual-layer usage defense (in-memory fast-check + Supabase database session logs) granting 2 free interactions per user with character-affinity locking.
- 📊 **Feedback & Admin Hub:** Built-in star ratings, qualitative user reviews, and an administrative oversight dashboard at `/feedback`.

---

## 🔍 What is RAG & How EcoLegacy Uses It?

### 1. Understanding RAG (Retrieval-Augmented Generation)

Standard Large Language Models (LLMs) suffer from three critical weaknesses:
1. **Hallucination:** They generate plausible-sounding but factually inaccurate statements.
2. **Knowledge Cutoffs / Generic Persona:** They mix internet opinions, secondary commentary, and stereotypes rather than speaking from the thinker's authentic primary sources.
3. **Context Limits:** You cannot paste 20 books into a single prompt on every message without immense latency and financial cost.

**RAG solves this in 3 phases:**
```
[User Question]
       │
       ▼
[1. RETRIEVAL] ──► Converts question to an embedding vector.
                   Searches a Vector Database for the most semantically
                   relevant passages from the curated book corpus.
       │
       ▼
[2. AUGMENTATION] ─► Injects retrieved passages directly into the LLM system prompt:
                     "You are Osho. Base your answer strictly on these passages: [...]"
       │
       ▼
[3. GENERATION] ──► LLM synthesizes an authentic, cited, in-character response.
```

### 2. How EcoLegacy Implements RAG

EcoLegacy implements an end-to-end RAG architecture across ingestion and live inference:

#### Step A: Offline Corpus Ingestion (`scripts/extract_pdfs.py` & `scripts/chunk_and_embed.py`)
1. **PDF Cleaning:** PyMuPDF (`fitz`) parses books (e.g., *The Book of Secrets*, *Courage*, *From Bondage to Freedom*). It automatically strips watermarks (*OceanofPDF*, *Bookey*), publisher notices, table of contents, and standalone page numbers.
2. **Semantic Chunking:** Text is split into windows of **2,500 characters** with a **300-character overlap**, breaking naturally on paragraph breaks (`\n`) and sentence boundaries (`. `).
3. **Dense Vector Embeddings:** Chunks are encoded into **768-dimensional normalized vectors** using the `sentence-transformers/all-mpnet-base-v2` model.
4. **Vector Upsert:** Vectors and metadata (`content`, `source`, `character_id`) are inserted into the Supabase `osho_corpus` table.

#### Step B: Online Retrieval & Generation (`web/app/api/chat/route.ts` & `test_rag.py`)
1. **Query Vectorization:** The user's question is encoded into a 768-dim query embedding.
2. **Cosine Similarity Search:** Supabase executes the PostgreSQL function `match_documents`:
   $$\text{Similarity} = 1 - (\text{embedding} \Leftrightarrow \text{query\_embedding})$$
   It filters by `character_id` and returns the top relevant excerpts exceeding the similarity threshold.
3. **Strict Grounding Prompting:**
   ```
   You are Osho. Speak calmly, philosophically, and deeply.
   CRITICAL: Keep responses brief (under 15 words for voice synthesis).
   Context (use only if directly relevant):
   {retrieved_chunks}
   ```
4. **Ultra-Low Latency Inference:** The prompt is dispatched to Groq's LPU-accelerated `llama-3.1-8b-instant`, producing an authentic response within 300–800ms.

---

## 🏛️ System Architecture & Data Flow

```
                      ┌──────────────────────────────────────┐
                      │          USER BROWSER UI             │
                      │       Next.js 15 / React 19          │
                      │  • Web Speech STT  • Audio Stream    │
                      │  • Video Player    • Character Grid  │
                      └──────────────────┬───────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 │ HTTPS API Calls                               │
                 ▼                                               ▼
     ┌────────────────────────┐                     ┌────────────────────────┐
     │   POST /api/chat       │                     │    POST /api/tts       │
     │   (LLM + RAG Route)    │                     │   (Speech Pipeline)    │
     └───────────┬────────────┘                     └───────────┬────────────┘
                 │                                              │
        ┌────────┴────────┐                          ┌──────────┴──────────┐
        ▼                 ▼                          ▼          ▼          ▼
 ┌─────────────┐   ┌─────────────┐               ┌─────────┐ ┌─────┐ ┌──────────┐
 │  Supabase   │   │  Groq Cloud │               │Smallest │ │HF   │ │Local GPU │
 │  pgvector   │   │  Llama 3.1  │               │   AI    │ │F5-  │ │PyTorch / │
 │ (RAG Store) │   │ 8B Instant  │               │Lightning│ │TTS  │ │XTTS/Bark │
 └─────────────┘   └─────────────┘               └─────────┘ └─────┘ └──────────┘
                 │                                              │
                 └───────────────────────┬──────────────────────┘
                                         │ audio_url
                                         ▼
                            ┌────────────────────────┐
                            │   POST /api/animate    │
                            │  (Ngrok -> LivePortrait│
                            │   or Wav2Lip Server)   │
                            └────────────────────────┘
```

---

## 🛠️ Technology Stack & Tools Breakdown

### Frontend
- **Framework:** Next.js 15 / 16 (App Router)
- **Library:** React 19, TypeScript
- **Styling:** Tailwind CSS v4, Lucide React (Icons)
- **Audio/Input:** Browser Web Speech API (`webkitSpeechRecognition`)
- **Client Auth:** `@supabase/ssr` with session cookies & protected routes

### Backend & API Routes
- **Next.js Serverless Routes:**
  - `/api/chat`: Orchestrates rate limiting, cache checks, vector search, and Groq LLM inference.
  - `/api/tts`: Multi-tier speech synthesis with fallback management and audio caching.
  - `/api/animate`: Dispatches audio URL to Ngrok-tunneled GPU server for lip synchronization.
  - `/api/rate-limit`: In-memory atomic gatekeeper (2 free requests per user, locked character).
  - `/api/debug-conversations`: Real-time session inspection for admin.

### AI Models & Inference Providers
| Component | Primary Tool / Model | Fallback / Alternative | Purpose |
| :--- | :--- | :--- | :--- |
| **LLM Inference** | Groq Cloud (`llama-3.1-8b-instant`) | Google Gemini (`gemini-1.5-flash`) | Sub-second character response generation |
| **Embeddings** | `all-mpnet-base-v2` (768 dims) | Groq Hash / Gemini `text-embedding-004` | Semantic vector space for RAG |
| **Vector DB** | Supabase PostgreSQL + `pgvector` | In-memory cache (`cached_responses`) | High-speed Cosine similarity search |
| **Voice Cloning** | Smallest.ai (`lightning-v3.1`) | Hugging Face F5-TTS / Local XTTS v2 | High-fidelity zero-shot voice synthesis |
| **Face Animation** | LivePortrait / Wav2Lip | Dynamic High-Res Static Portrait | Realistic lip-sync and head motion |

### Python Processing & Local Servers
- **Libraries:** PyMuPDF (`fitz`), `sentence-transformers`, `torch`, `torchaudio`, `librosa`, `soundfile`, `gradio-client`, `flask`, `flask-cors`.
- **Local Servers:**
  - `smallest_tts_server.py`: Dedicated Smallest.ai voice cloning controller.
  - `minimal_tts_server.py`: Lightweight F5-TTS server using Hugging Face ZeroGPU.
  - `local_tts_server.py`: On-device XTTS v2 and Bark server optimized for 4GB VRAM (RTX 3050).

---

## 🎙️ Multi-Tier Voice Cloning Pipeline

Voice authenticity is the emotional core of EcoLegacy. To guarantee 100% uptime during live demos, EcoLegacy uses a **3-tier fallback matrix**:

```
                  Incoming Text to Speak
                            │
                            ▼
               ┌──────────────────────────┐
               │  Check Supabase Cache    │
               │   table: audio_cache     │
               └────────────┬─────────────┘
                     [Hit]  │  [Miss]
        ┌───────────────────┘  └─────────────────────┐
        ▼                                            ▼
 Return Cached WAV/MP3                  Tier 1: Smallest.ai API
                                      (lightning-v3.1 voice clone)
                                                     │
                                            [Fail]   │  [Success]
                               ┌─────────────────────┴───────────────┐
                               ▼                                     ▼
                     Tier 2: HF F5-TTS Space                    Return Audio
                  (10-Token Rotation to prevent                      &
                     ZeroGPU Quota Lockouts)                    Cache in DB
                               │
                      [Fail]   │  [Success]
         ┌─────────────────────┴─────────────┐
         ▼                                   ▼
 Tier 3: Local Python Server            Return Audio
 (Coqui XTTS / Bark on RTX 3050)
```

### Character Voice Reference Registry
| Character ID | Name | Reference Audio | Timbre / Style Description |
| :--- | :--- | :--- | :--- |
| `osho` | Osho (Rajneesh) | `web/public/audio/osho_ref.mp3` | Slow, hypnotic, deep pauses, meditative |
| `tesla` | Nikola Tesla | `web/public/audio/tesla_ref.mp3` | Visionary, intellectual, sharp European cadence |
| `bhagat_singh`| Bhagat Singh | `web/public/audio/bhagat_ref.mpeg` | Fiery, passionate, revolutionary, resolute |
| `ssr` | Sushant Singh Rajput | `web/public/audio/ssr_ref.mpeg` | Introspective, enthusiastic, articulate |
| `hitler` | Adolf Hitler | `web/public/audio/hitler_ref.mp3` | Powerful, dramatic oratory (historical study) |

---

## 💾 Database Schema & Vector Search

The database is powered by Supabase (PostgreSQL with `pgvector`):

### 1. Vector Corpus Table (`osho_corpus`)
```sql
create extension if not exists vector;

create table osho_corpus (
  id uuid primary key default gen_random_uuid(),
  character_id text default 'osho',
  content text not null,
  source text,
  chapter text,
  embedding vector(768),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
```

### 2. Cosine Vector Search RPC (`match_documents`)
```sql
create or replace function match_documents(
  query_embedding vector(768),
  match_threshold float default 0.7,
  match_count int default 5,
  p_character_id text default null
)
returns table (
  id uuid,
  content text,
  source text,
  similarity float
)
language sql stable
as $$
  select
    id,
    content,
    source,
    1 - (embedding <=> query_embedding) as similarity
  from osho_corpus
  where 1 - (embedding <=> query_embedding) > match_threshold
    and (p_character_id is null or character_id = p_character_id)
  order by similarity desc
  limit match_count;
$$;
```

### 3. Acceleration & Session Tables
- `cached_responses`: Caches instant text responses for popular questions.
- `audio_cache`: Stores generated base64 audio and URLs to prevent repeated TTS inference.
- `conversations`: Logs user sessions, character choices, prompts, and rate limit counts.
- `feedback`: Captures star ratings (1–5) and comments submitted by users.

---

## ⚙️ Installation & Setup Guide

### Prerequisites
- Node.js 18+ (Node 20 recommended)
- Python 3.10+
- A Supabase Project (free tier with `pgvector` enabled)
- A Groq Cloud API key (free at `console.groq.com`)
- *(Optional)* Smallest.ai API key / Hugging Face Access Token

### 1. Clone the Repository
```bash
git clone https://github.com/Sam008055/EcoLegacy.git
cd EcoLegacy
```

### 2. Configure Web Environment Variables
Create a file at `web/.env.local`:
```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# LLM Providers
GROQ_API_KEY=gsk_your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key

# Voice Cloning Providers
SMALLEST_API_KEY=sk_your_smallest_ai_key
HUGGINGFACE_TOKEN=hf_your_huggingface_token
HUGGINGFACE_TOKEN_1=hf_backup_token_1

# Local Services & Live Animation (Optional)
LOCAL_TTS_URL=http://localhost:5000
NGROK_URL=https://your-tunnel.ngrok-free.app
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 3. Database Migration
In the Supabase SQL Editor, paste and execute the entire content of:
```
supabase_schema.sql
```

### 4. Install Dependencies
```bash
# Frontend
cd web
npm install
cd ..

# Python Environment (RAG Ingestion & Audio Services)
python -m venv venv
venv\Scripts\activate   # Windows PowerShell: .\venv\Scripts\Activate.ps1
pip install -r requirements_tts.txt
pip install sentence-transformers supabase PyMuPDF
```

### 5. Ingest Corpus into Supabase pgvector
```bash
# Clean PDFs from corpus/pdfs to corpus/texts
python scripts/extract_pdfs.py

# Embed texts and upload 768-dim vectors to Supabase
python scripts/chunk_and_embed.py --character osho --dir texts --clear
```

---

## 🚀 Running the Application

### Option A: Standard Web App Mode (Cloud Inference)
To run the full web application using Groq LLM + Smallest.ai / HF F5-TTS:
```bash
cd web
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in Google Chrome.

### Option B: High-Performance Local TTS Server Mode
If using the local Python TTS server alongside the web app:
```bash
# Terminal 1: Start TTS Server
python smallest_tts_server.py
# (or: python minimal_tts_server.py)

# Terminal 2: Start Web UI
cd web
npm run dev
```

### Option C: Live Lip-Sync Video Mode (LivePortrait / Wav2Lip)
```bash
# Terminal 1: Run local animation server on GPU port 7860
python server.py --port 7860

# Terminal 2: Expose via Ngrok
ngrok http 7860
# Paste your https://xxxx.ngrok-free.app into NGROK_URL in web/.env.local

# Terminal 3: Run web app
cd web
npm run dev
```

---

## 📂 Project Directory Structure

```
EcoLegacy/
├── corpus/
│   ├── pdfs/                      # Source books & discourses (Osho, etc.)
│   └── texts/                     # Cleaned .txt files post watermark-stripping
├── scripts/
│   ├── extract_pdfs.py            # PyMuPDF extraction, cleaning, and sanitization
│   ├── chunk_and_embed.py         # all-mpnet-base-v2 chunking and Supabase pgvector upsert
│   ├── check_hf_tokens.py         # Multi-token Hugging Face health validator
│   └── populate_quick_responses.py# Pre-populates common questions into cache
├── enhanced_tts/                  # Advanced quality assurance framework
│   ├── audio_preprocessor.py      # Noise removal, silence trimming, normalization
│   ├── quality_validator.py       # MFCC & speaker verification similarity scoring
│   ├── character_config_manager.py# Temperature & pitch tuning per persona
│   └── backends/                  # Hugging Face, Local F5-TTS, and Fallback adapters
├── web/                           # Next.js 15 Web Application
│   ├── app/
│   │   ├── page.tsx               # High-converting landing & character selection page
│   │   ├── [characterId]/page.tsx # Character avatar conversation room
│   │   ├── feedback/page.tsx      # Admin feedback dashboard
│   │   └── api/
│   │       ├── chat/route.ts      # RAG context lookup + Groq Llama 3.1 inference
│   │       ├── tts/route.ts       # Multi-backend voice cloning dispatcher
│   │       ├── animate/route.ts   # Ngrok LivePortrait video forwarder
│   │       └── rate-limit/route.ts# In-memory session limit enforcement
│   ├── components/
│   │   ├── AvatarInterface.tsx    # Core voice recording, playback & video display
│   │   ├── LoginForm.tsx          # Supabase magic-link & Google authentication
│   │   └── FeedbackModal.tsx      # Star rating and feedback submission modal
│   ├── public/
│   │   ├── audio/                 # High-quality voice reference clips
│   │   └── images/                # High-res portraits of historical figures
│   └── utils/
│       └── characters.ts          # Persona definitions, system prompts, voice configs
├── local_tts_server.py            # Local PyTorch TTS server (XTTS v2 / Bark)
├── minimal_tts_server.py          # Lightweight F5-TTS server
├── smallest_tts_server.py         # Smallest.ai Waves API voice manager
├── supabase_schema.sql            # Complete PostgreSQL + pgvector schema definition
├── test_rag.py                    # Standalone end-to-end RAG verification script
├── PRESENTATION_GUIDE.md          # Complete 3-Member AI Expo Presentation Playbook
└── README.md                      # Comprehensive Project Documentation
```

---

## 🏆 AI Expo Presentation Readiness

For the full presentation strategy, speech breakdowns for each team member, live demo cue cards, and judge Q&A prep, see:
👉 **[`PRESENTATION_GUIDE.md`](file:///d:/ai-expo/PRESENTATION_GUIDE.md)**

- **Speaker 1:** Vision, Real-World Problem, and Live User Experience.
- **Speaker 2:** Deep Dive into RAG Architecture, Vector Embeddings, and Anti-Hallucination.
- **Speaker 3:** Voice Synthesis, Audio QA Validation, Avatar Animation & Scalability.
