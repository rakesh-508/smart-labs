# 🔬 Smart Lab — Detailed System Architecture

> **Version**: 2.0 (Post-LLM Integration)
> **Last Updated**: March 2026
> **Stack**: React 18 + TypeScript + Vite 6 | FastAPI + Python 3 | OpenRouter LLM + RAG

---

## Table of Contents

1. [High-Level Overview](#1-high-level-overview)
2. [System Architecture Diagram](#2-system-architecture-diagram)
3. [Frontend Architecture](#3-frontend-architecture)
   - 3.1 [Entry Points & Configuration](#31-entry-points--configuration)
   - 3.2 [Type System](#32-type-system)
   - 3.3 [Component Tree](#33-component-tree)
   - 3.4 [Agent Layer](#34-agent-layer-frontendagents)
   - 3.5 [Engine Layer](#35-engine-layer-frontendengine)
   - 3.6 [RAG Layer](#36-rag-layer-frontendrag)
   - 3.7 [Data Layer](#37-data-layer-frontenddata)
4. [Backend Architecture](#4-backend-architecture)
   - 4.1 [API Routes](#41-api-routes)
   - 4.2 [LLM Intent Classifier](#42-llm-intent-classifier)
   - 4.3 [Backend Agent](#43-backend-lab-agent)
   - 4.4 [RAG Engine](#44-rag-engine)
   - 4.5 [Chemistry Calculator](#45-chemistry-calculator)
   - 4.6 [Pydantic Schemas](#46-pydantic-schemas)
5. [Data Flow — Pin-to-Pin](#5-data-flow--pin-to-pin)
   - 5.1 [Message Processing Pipeline](#51-message-processing-pipeline)
   - 5.2 [Intent Resolution Chain](#52-intent-resolution-chain)
   - 5.3 [State Update Flow](#53-state-update-flow)
   - 5.4 [Rendering Pipeline](#54-rendering-pipeline)
6. [LLM + RAG Architecture](#6-llm--rag-architecture)
7. [Chemistry Calculation Engine](#7-chemistry-calculation-engine)
8. [Canvas Rendering System](#8-canvas-rendering-system)
9. [Experiment Data Schema](#9-experiment-data-schema)
10. [Configuration & Environment](#10-configuration--environment)
11. [Key Constants Reference](#11-key-constants-reference)
12. [File Map](#12-file-map)

---

## 1. High-Level Overview

Smart Lab is an AI-powered virtual science laboratory where students interact through **natural language chat** to perform simulated experiments. The platform uses a **three-tier architecture**:

```
┌─────────────────────────────────────────────────────────────────┐
│                        PRESENTATION TIER                        │
│  React 18 + TypeScript + Vite 6 + HTML5 Canvas                 │
│  Components: LabCanvas, ChatInterface, MetricsPanel, etc.       │
├─────────────────────────────────────────────────────────────────┤
│                        INTELLIGENCE TIER                        │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │  LabAgent    │  │ IntentEngine │  │ BackendAPI → LLM/RAG  │ │
│  │  (orchestr.) │  │ (local NLP)  │  │ (OpenRouter + Gemini) │ │
│  └──────────────┘  └──────────────┘  └───────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                        SIMULATION TIER                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │ SimulationState   │  │ ChemistryEngine  │  │ ExperimentRAG│ │
│  │ (state manager)   │  │ (Nernst/Faraday) │  │ (TF-IDF)    │ │
│  └──────────────────┘  └──────────────────┘  └──────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                        BACKEND TIER (FastAPI)                   │
│  /api/intent → LLMIntentClassifier (OpenRouter)                 │
│  /api/chat   → BackendLabAgent                                  │
│  /api/rag    → RAGEngine (TF-IDF)                               │
│  /api/calc   → ChemistryCalculator                              │
└─────────────────────────────────────────────────────────────────┘
```

### Design Principles
- **LLM-First, Local-Fallback**: Always tries the cloud LLM first; falls back to local NLP if unavailable
- **Experiment-Scoped RAG**: Each experiment has its own dedicated knowledge base (12-14 documents)
- **Real Science**: All calculations use real electrochemistry equations (Nernst, Faraday, Gibbs)
- **Observer Pattern**: UI re-renders reactively when `SimulationState` changes
- **Zero Hardcoding**: New experiments can be added as data files — no code changes needed

---

## 2. System Architecture Diagram

```
                    ┌──────────────────────────────────────┐
                    │            STUDENT BROWSER            │
                    │                                      │
                    │  ┌──────────┐    ┌──────────────┐   │
                    │  │   Chat   │    │  Lab Canvas   │   │
                    │  │Interface │    │ (HTML5 Canvas) │   │
                    │  │ ┌──────┐ │    │  3 Views:     │   │
                    │  │ │Quick │ │    │  • Lab        │   │
                    │  │ │Action│ │    │  • Molecule   │   │
                    │  │ └──────┘ │    │  • Circuit    │   │
                    │  └────┬─────┘    └──────▲────────┘   │
                    │       │                 │             │
                    │       ▼                 │             │
                    │  ┌─────────────────┐    │             │
                    │  │  LabWorkspace   │    │             │
                    │  │  (orchestrator) ├────┘             │
                    │  └───────┬─────────┘                  │
                    │          │                            │
                    │          ▼                            │
                    │  ┌─────────────────┐                  │
                    │  │    LabAgent     │ ◄── IntentEngine │
                    │  │  (NLP + exec)   │ ◄── ExperimentRAG│
                    │  └───┬────────┬────┘                  │
                    │      │        │                       │
                    │      │        ▼                       │
                    │      │   SimulationState              │
                    │      │     ▲  │                       │
                    │      │     │  ▼                       │
                    │      │   ChemistryEngine              │
                    └──────┼───────────────────────────────┘
                           │ POST /api/intent
                           │ (HTTP + JSON)
                           ▼
                    ┌──────────────────────────────────────┐
                    │          BACKEND (FastAPI)            │
                    │                                      │
                    │   main.py ──► LLMIntentClassifier     │
                    │                    │                  │
                    │              ┌─────┴──────┐          │
                    │              ▼            ▼          │
                    │         RAGEngine    OpenRouter API   │
                    │         (TF-IDF)    (via OpenAI SDK)  │
                    │                          │           │
                    │                          ▼           │
                    │                  ┌──────────────┐    │
                    │                  │ Gemini 2.0   │    │
                    │                  │ Flash Lite   │    │
                    │                  └──────────────┘    │
                    └──────────────────────────────────────┘
```

---

## 3. Frontend Architecture

### 3.1 Entry Points & Configuration

| File | Purpose | Key Details |
|------|---------|-------------|
| `frontend/package.json` | NPM config | React 18.3.1, Vite 6, TypeScript 5.6 |
| `frontend/vite.config.ts` | Build config | Dev port **3000**, proxy `/api` → `localhost:8000` |
| `frontend/tsconfig.json` | TS config | Target ES2020, JSX react-jsx, strict mode |
| `frontend/src/main.tsx` | React entry | `createRoot` + `StrictMode` |
| `frontend/src/index.css` | Global styles | Dark theme, 25+ CSS variables, 843 lines |
| `frontend/src/vite-env.d.ts` | Vite types | `/// <reference types="vite/client" />` |

**Vite Proxy Configuration** (eliminates CORS in dev):
```typescript
// vite.config.ts
server: {
  port: 3000,
  proxy: { '/api': 'http://localhost:8000' }
}
```

---

### 3.2 Type System

**File**: `frontend/src/types/index.ts` (170 lines)

The entire application shares a single type system. Key types and their relationships:

```
Experiment (root)
 ├── materials: Material[]
 │    └── PlacedMaterial (extends Material)
 │         ├── instanceId, x, y, rotation
 │         ├── state: MaterialState
 │         ├── insertedInto?, connectedTo?
 │         └── animationClass?
 ├── steps: ExperimentStep[]
 │    ├── requiredMaterials[], expectedActions[]
 │    └── completed: boolean
 ├── reactions: ReactionStep[]
 │    ├── equation, description
 │    ├── type: 'oxidation' | 'reduction' | 'overall'
 │    └── deltaG?: number
 ├── ragDocuments: RAGDocument[]
 │    ├── id, title, content, tags[]
 │    └── metadata: Record<string, any>
 └── scientificBackground: string
```

**Action System**:
```typescript
type AgentActionType =
  | 'ADD_MATERIAL'     // Add material to lab
  | 'REMOVE_MATERIAL'  // Remove material
  | 'MOVE_MATERIAL'    // Reposition material
  | 'INSERT_INTO'      // Insert electrode into host
  | 'CONNECT_WIRE'     // Attach wires / LED
  | 'ANIMATE'          // Trigger animation
  | 'ROLL_LEMON'       // Roll/prepare lemon
  | 'COMPLETE_CIRCUIT'  // Close the circuit
  | 'CALCULATE'        // Run calculations
  | 'SHOW_REACTION'    // Display reactions
  | 'ADD_SERIES_CELL'  // Add another cell
  | 'REVERSE_LED'      // Flip LED polarity
  | 'EXPLAIN'          // RAG-powered answer
  | 'STEP_COMPLETE';   // Mark step done

interface AgentAction {
  type: AgentActionType;
  payload: any;
  description: string;
}
```

**Circuit & Metrics**:
```typescript
interface CircuitState {
  isComplete: boolean;
  totalVoltage: number;
  current: number;
  resistance: number;
  power: number;
  ledBrightness: number;
  cells: CellData[];
}

interface MetricSnapshot {
  timestamp: number;
  voltage: number;
  current: number;
  resistance: number;
  ledBrightness: number;
  cellCount: number;
  notes: string;
}
```

---

### 3.3 Component Tree

```
<App>                                    ← State: selectedExperiment
 ├── <ExperimentSelector>                ← When no experiment selected
 │    └── Experiment cards + placeholders
 │
 └── <LabWorkspace>                      ← When experiment selected
      ├── Props: experiment, onBack
      ├── State: labState, circuitState, messages[], currentStep,
      │         completedSteps[], isProcessing
      ├── Refs: SimulationState, LabAgent (persistent across renders)
      │
      ├── Left Column
      │   ├── <StepsTracker>             ← steps[], currentStep, completedSteps[]
      │   ├── <MaterialsPalette>         ← materials[], onSelect callback
      │   ├── <MetricsPanel>             ← circuitState
      │   └── <ReactionsPanel>           ← reactions[], circuitState
      │
      ├── Center Column
      │   └── <LabCanvas>                ← labState, circuitState, experiment
      │        ├── HTML5 Canvas with requestAnimationFrame
      │        ├── 3 views: Lab | Molecule | Circuit
      │        └── Particle system for electron flow
      │
      └── Right Column
          └── <ChatInterface>            ← messages[], onSend, isProcessing
               ├── Message bubbles (student/agent/system)
               ├── Quick action buttons (13 predefined)
               ├── Markdown renderer
               └── Auto-scroll
```

**Component Details**:

| Component | File | Lines | Props | Key Behavior |
|-----------|------|-------|-------|-------------|
| `App` | `App.tsx` | 32 | — | Holds `selectedExperiment` state, toggles between Selector/Workspace |
| `ExperimentSelector` | `ExperimentSelector.tsx` | 63 | `experiments[], onSelect` | Renders cards + 2 placeholder experiments |
| `LabWorkspace` | `LabWorkspace.tsx` | 150 | `experiment, onBack` | Creates `SimulationState` + `LabAgent` refs, subscribes to sim changes, routes messages |
| `LabCanvas` | `LabCanvas.tsx` | 480+ | `labState, circuitState, experiment` | HTML5 Canvas renderer with 3 view modes + animations |
| `ChatInterface` | `ChatInterface.tsx` | 185 | `messages[], onSend, isProcessing` | Chat UI with 13 quick actions, markdown, auto-scroll |
| `StepsTracker` | `StepsTracker.tsx` | 150 | `steps[], currentStep, completedSteps[]` | Progress bar, expandable steps, hint generation |
| `MaterialsPalette` | `MaterialsPalette.tsx` | 32 | `materials[], onSelect` | Clickable emoji chips |
| `MetricsPanel` | `MetricsPanel.tsx` | 97 | `circuitState` | Live metrics + voltage bar with LED threshold marker |
| `ReactionsPanel` | `ReactionsPanel.tsx` | 60 | `reactions[], circuitState` | 3 chemical equations + ΔG + EMF |

---

### 3.4 Agent Layer (`frontend/agents/`)

#### 3.4.1 LabAgent (`LabAgent.ts` — 595 lines)

The **central orchestrator**. Receives student messages, classifies intent, executes actions, tracks steps.

```
LabAgent
 ├── Dependencies
 │   ├── experiment: Experiment     (the active experiment)
 │   ├── sim: SimulationState       (state manager)
 │   ├── rag: ExperimentRAG         (knowledge base)
 │   └── intentEngine: IntentEngine (local NLP fallback)
 │
 ├── Public API
 │   ├── processMessage(msg) → ChatMessage[]
 │   ├── getWelcomeMessage() → ChatMessage
 │   ├── getCurrentStep() → number
 │   └── getCompletedSteps() → number[]
 │
 └── Internal Pipeline
     ├── tryLLMClassify(msg) ──► BackendAPI.classifyIntent()
     │     └── Returns ParsedIntent if confidence ≥ 0.6
     ├── parseIntents(msg) ──► IntentEngine.parse()
     │     └── Returns ScoredIntent[] from local NLP
     ├── executeIntent(intent) ──► SimulationState.methods
     │     └── Switch on 12 action types
     ├── recalcStepProgress() ──► Auto-completes steps
     │     └── Checks lab state against step requirements
     └── generateAnswer(msg) ──► ExperimentRAG.query()
           └── Pure Q&A fallback
```

**Intent Execution Map**:

| Action Type | SimulationState Method | Conditions |
|-------------|----------------------|------------|
| `ADD_MATERIAL` | `addLemon()`, `setHasNail(true)`, `setHasCopper(true)`, `setHasLED(true)` | Material-specific dispatch |
| `REMOVE_MATERIAL` | `removeLemon()`, `setHasNail(false)`, etc. | Material-specific |
| `ROLL_LEMON` | `rollLemon()` | Requires lemon present |
| `INSERT_INTO` | `insertNail()`, `insertCopper()` | Requires electrode + lemon |
| `CONNECT_WIRE` | `connectLED()` | Requires LED + electrodes |
| `COMPLETE_CIRCUIT` | `completeCircuit()` | Requires all prerequisites |
| `ADD_SERIES_CELL` | `addSeriesCell()` | Max 3 lemons |
| `REVERSE_LED` | `reverseLEDPolarity()` | Requires LED connected |
| `SHOW_REACTION` | Returns reaction equations | Circuit must be active |
| `CALCULATE` | Returns metrics from `ChemistryEngine` | Circuit must be active |
| `EXPLAIN` | `ExperimentRAG.query()` | Always available |

---

#### 3.4.2 IntentEngine (`IntentEngine.ts` — 585 lines)

**Local NLP fallback** when the backend LLM is unavailable. Uses a scoring-based fuzzy matching system.

```
IntentEngine
 ├── Dependencies
 │   ├── rag: ExperimentRAG
 │   └── sim: SimulationState
 │
 ├── Public API
 │   ├── parse(text) → ScoredIntent[]
 │   ├── matchMaterial(text) → string | null
 │   └── getSimState() → SimulationState
 │
 └── Scoring Pipeline
     ├── 1. normalise(text)    ─► Phrase normalization (14 regex rules)
     ├── 2. tokenize(text)     ─► Word array
     ├── 3. RAG context query  ─► Tag alignment boost
     ├── 4. Score all 10 intents
     │    ├── Required gates (AND) ─► ALL must match or score = 0
     │    ├── Base score           ─► 40 points
     │    ├── Optional signals     ─► +15
     │    ├── Exemplar similarity  ─► +25 (Jaccard against prototypes)
     │    ├── RAG tag alignment    ─► +15
     │    ├── Context boost        ─► ±15 (sim state dependent)
     │    └── Negative signals     ─► −25 each (prevent cross-fire)
     └── 5. Return best (threshold ≥ 30)
```

**10 Intent Definitions**:

| Intent | Required Gates (AND) | Key Negative Signals |
|--------|---------------------|---------------------|
| `REVERSE_LED` | "reverse/flip/swap/change" + "led/poles/polarity" | "add", "connect" |
| `REMOVE_MATERIAL` | "remove/discard/take away/get rid" | "add", "take a" |
| `ADD_SERIES_CELL` | "another/more/extra/series/second/third" | — |
| `ROLL_LEMON` | "roll/squeeze/press/soften/prepare/massage" | "insert", "add" |
| `INSERT_INTO` | "insert/push/stick/put/place" + "into/in/inside" | "connect", "wire" |
| `ADD_MATERIAL` | "add/take/get/grab/pick/give/need/want" | Heavy negatives: "series", "another", "roll", "insert" |
| `CONNECT_WIRE` | "connect/attach/wire/hook/clip" | "reverse", "insert" |
| `COMPLETE_CIRCUIT` | "complete/close/finish/activate/turn on/light" | "add", "connect" |
| `SHOW_REACTION` | "reaction/equation/chemical/oxidation" | — |
| `CALCULATE` | "calculate/compute/measure/voltage/current" | — |

**Utility Functions**: `editDistance()`, `fuzzyMatch()`, `tokenize()`, `normalise()`, `matchesGroup()`, `jaccardSimilarity()`

**Material Matching** (`matchMaterial`):
- Maps 6 materials with multiple aliases each (e.g., "nail" / "zinc" / "zinc nail" / "galvanized" → `zinc-nail`)
- Finds the **earliest match by character position** to prevent false positives
- Example: "lemon about 2-3 cm away from the nail" → finds "lemon" at position 0, not "nail" at position 35

---

#### 3.4.3 BackendAPI (`BackendAPI.ts` — 68 lines)

**HTTP client** for the backend LLM intent classification service.

```typescript
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Health check (3s timeout)
checkBackendStatus(): Promise<BackendStatus | null>
  → GET /api/status
  → { status, llm_available, llm_model }

// Intent classification (10s timeout)
classifyIntent(message, experimentId, labState): Promise<LLMIntentResult | null>
  → POST /api/intent
  → { action, targets[], quantity, confidence, reasoning, llm_used, rag_context? }
  → Returns null on any failure (graceful fallback)
```

---

### 3.5 Engine Layer (`frontend/engine/`)

#### 3.5.1 ChemistryEngine (`ChemistryEngine.ts` — 230 lines)

All **static methods** — no instantiation needed. Implements real electrochemistry equations.

```
ChemistryEngine (all static)
 │
 ├── Core Electrochemistry
 │   ├── nernstPotential(E°, n, [ion]) → V
 │   │     E = E° - (RT/nF) · ln(1/[ion])
 │   ├── cellVoltage(cathode, anode, electrolyte) → V
 │   │     E_cell = E_cathode - E_anode
 │   ├── gibbsFreeEnergy(n, V) → kJ/mol
 │   │     ΔG = -nFE / 1000
 │   └── cellCurrent(V, R) → A (capped at 0.001A)
 │
 ├── LED Model
 │   └── ledBrightness(V, I) → 0.0 – 1.0
 │         0 if V < 1.5V, ramps to 1.0 at 3.0V
 │
 ├── Circuit Calculator
 │   └── calculateCircuit(cells[], extR?) → CircuitState
 │         Series connection: V_total = Σ V_cell
 │         R_total = Σ R_cell + R_external
 │         I = V / R, P = V × I
 │
 ├── Cell Factories
 │   ├── getElectrode(metal, mass?) → ElectrodeData
 │   ├── getLemonElectrolyte(vol?) → ElectrolyteData
 │   ├── getRolledLemonElectrolyte() → ElectrolyteData (10% better)
 │   └── createLemonCell(rolled?) → CellData
 │
 ├── Reactions
 │   └── getLemonBatteryReactions() → ReactionStep[3]
 │         Oxidation: Zn → Zn²⁺ + 2e⁻
 │         Reduction: 2H⁺ + 2e⁻ → H₂
 │         Overall:   Zn + 2H⁺ → Zn²⁺ + H₂
 │
 └── Runtime
     ├── calculateRuntime(cell, I) → seconds
     │     t = (m × n × F) / (M × I)
     └── formatRuntime(s) → "X hours Y minutes"
```

---

#### 3.5.2 SimulationState (`SimulationState.ts` — 342 lines)

**Central state manager** using the Observer pattern. All UI components react to state changes.

```
SimulationState
 │
 ├── Internal State
 │   ├── CanvasLabState (10 fields)
 │   │   ├── lemons: number (0–3)
 │   │   ├── hasNail, hasCopper, hasLED: boolean
 │   │   ├── nailInserted, copperInserted: boolean
 │   │   ├── ledConnected, lemonRolled: boolean
 │   │   ├── circuitComplete: boolean
 │   │   └── ledReversed: boolean
 │   ├── circuitState: CircuitState
 │   ├── materials: PlacedMaterial[]
 │   └── cells: CellData[]
 │
 ├── Observer Pattern
 │   ├── subscribe(listener) → unsubscribe function
 │   └── notify() → calls all listeners
 │
 ├── Material Actions (each calls recalc + notify)
 │   ├── addLemon()       → {success, message}  (max 3)
 │   ├── removeLemon()    → {success, message}
 │   ├── setHasNail(v)    → void
 │   ├── setHasCopper(v)  → void
 │   ├── setHasLED(v)     → void
 │   └── addMaterial(m)   → PlacedMaterial
 │
 ├── Lab Actions (each calls recalc + notify)
 │   ├── rollLemon()         → {success, message}
 │   ├── insertNail()        → {success, message}
 │   ├── insertCopper()      → {success, message}
 │   ├── connectLED()        → {success, message}
 │   ├── reverseLEDPolarity()→ {success, message}
 │   ├── completeCircuit()   → {success, message, circuitState}
 │   └── addSeriesCell()     → {success, message} (alias for addLemon)
 │
 ├── Getters
 │   ├── getLabState()       → CanvasLabState (copy)
 │   ├── getCircuitState()   → CircuitState (copy)
 │   ├── getMaterials()      → PlacedMaterial[]
 │   ├── getCells()          → CellData[]
 │   └── getMetricSnapshot() → MetricSnapshot
 │
 └── Private recalc()
     ├── Rebuilds cells[] from current state
     ├── Checks circuit completeness:
     │     lemons > 0
     │     AND nailInserted
     │     AND copperInserted
     │     AND hasLED
     │     AND ledConnected
     │     AND !ledReversed  ← polarity matters!
     ├── Calls ChemistryEngine.calculateCircuit(cells, R)
     └── Notifies all subscribers
```

**State Change Flow**:
```
User action → SimulationState method → recalc() → ChemistryEngine →
  ├── CanvasLabState updated  → LabCanvas re-renders
  ├── CircuitState updated    → MetricsPanel re-renders
  └── notify() fired          → LabWorkspace updates all props
```

---

### 3.6 RAG Layer (`frontend/rag/`)

#### ExperimentRAG (`ExperimentRAG.ts` — 119 lines)

**TF-IDF based retrieval engine** with per-experiment document scoping.

```
ExperimentRAG
 │
 ├── Storage
 │   ├── documents: RAGDocument[]
 │   └── tokenIndex: Map<string, Set<number>>  (inverted index)
 │
 ├── Public API
 │   ├── loadDocuments(docs: RAGDocument[])
 │   │     Tokenizes all documents, builds inverted index
 │   ├── query(text, topK=3) → RAGQueryResult[]
 │   │     TF-IDF score + substring bonus + tag bonus
 │   ├── getDocument(id) → RAGDocument | undefined
 │   ├── getByTag(tag) → RAGDocument[]
 │   └── getAllDocuments() → RAGDocument[]
 │
 └── Scoring Formula
     score = TF-IDF(query_tokens ∩ doc_tokens)
           + substring_match_bonus (if query appears in content)
           + tag_match_bonus (if tag matches query token)
```

**Document Count per Experiment**:
- Lemon Battery: **14 RAG documents** (frontend) / **12 documents** (backend)
- Covers: overview, materials (×4), reactions, theory (Nernst, Faraday), steps (×3), troubleshooting, alternatives, safety

---

### 3.7 Data Layer (`frontend/data/`)

#### Lemon Battery Experiment (`lemon-battery.ts` — 339 lines)

```typescript
export const LEMON_BATTERY_EXPERIMENT: Experiment = {
  id: 'lemon-battery',
  name: 'Lemon Battery',
  emoji: '🍋',
  category: 'Electrochemistry',
  difficulty: 'Beginner',

  materials: [          // 6 materials
    lemon,              // 110g, pH 2.0, 0.38 S/m
    'zinc-nail',        // 8g, E° = -0.76V
    'copper-wire',      // 5g, E° = +0.34V
    'led',              // V_f = 1.8V, 20mA max
    'wire-clip',        // R = 0.1Ω
    'knife'             // For prep
  ],

  steps: [              // 5 experiment steps
    'Prepare the lemon',
    'Insert metal electrodes',
    'Attach wires and LED',
    'Complete the circuit',
    'Observe and measure'
  ],

  reactions: [          // 3 chemical reactions
    'Zn → Zn²⁺ + 2e⁻',           // Oxidation at anode
    '2H⁺ + 2e⁻ → H₂↑',          // Reduction at cathode
    'Zn + 2H⁺ → Zn²⁺ + H₂↑'     // Overall
  ],

  ragDocuments: [...]   // 14 knowledge documents
};
```

---

## 4. Backend Architecture

### 4.1 API Routes

**File**: `backend/app/main.py` (210 lines)

```
FastAPI App
 │
 ├── Middleware: CORS (allow_origins=["*"])
 │
 ├── Services (initialized at startup)
 │   ├── rag_engine = RAGEngine()
 │   ├── chemistry = ChemistryCalculator()
 │   ├── agent = BackendLabAgent(rag_engine, chemistry)
 │   └── llm_classifier = LLMIntentClassifier(rag_engine)
 │
 └── Routes
     ├── GET  /                         → Health + LLM status
     ├── GET  /api/status               → { status, llm_available, llm_model }
     ├── POST /api/intent               → ★ LLM Intent Classification
     ├── GET  /api/experiments           → List all experiments
     ├── GET  /api/experiments/{id}      → Full experiment data
     ├── POST /api/chat                  → Agent message processing
     ├── POST /api/calculate/circuit     → Circuit calculation
     ├── POST /api/rag/query             → RAG knowledge query
     ├── GET  /api/calculate/nernst      → Nernst equation
     ├── GET  /api/calculate/gibbs       → Gibbs free energy
     └── GET  /api/calculate/runtime     → Battery runtime
```

**Core Endpoint — POST /api/intent**:

```python
async def classify_intent(request: IntentRequest):
    # 1. Load experiment description from JSON
    exp_data = load_experiment(request.experiment_id)

    # 2. Call LLM classifier (with RAG context injection)
    result = await llm_classifier.classify(
        message=request.message,
        experiment_id=request.experiment_id,
        lab_state=request.lab_state,
        experiment_description=exp_data["description"],
    )

    # 3. If LLM fails → return empty (frontend falls back to local engine)
    if result is None:
        return IntentResponse(action=None, llm_used=False, ...)

    # 4. Attach RAG context excerpts for display
    rag_results = rag_engine.query(request.message, request.experiment_id)
    return IntentResponse(**result, llm_used=True, rag_context=rag_results)
```

---

### 4.2 LLM Intent Classifier

**File**: `backend/app/agents/llm_intent.py` (207 lines)

```
LLMIntentClassifier
 │
 ├── Init
 │   ├── Reads OPENROUTER_API_KEY from .env
 │   ├── Creates OpenAI client → base_url="https://openrouter.ai/api/v1"
 │   └── Model: OPENROUTER_MODEL env var (default: google/gemini-2.0-flash-lite-001)
 │
 ├── System Prompt (injected per-request)
 │   ├── Experiment description
 │   ├── Current lab state (JSON)
 │   ├── RAG context (top 4 docs, 300 chars each)
 │   ├── Valid actions (11) + descriptions
 │   ├── Valid material IDs (6)
 │   ├── 13 classification rules
 │   └── Required JSON output schema
 │
 ├── classify(message, experiment_id, lab_state, exp_desc)
 │   ├── 1. Query RAG for context (top 4)
 │   ├── 2. Build system prompt with injections
 │   ├── 3. Call OpenRouter API
 │   │     ├── model: configurable
 │   │     ├── temperature: 0.1
 │   │     ├── max_tokens: 256
 │   │     └── response_format: json_object
 │   ├── 4. Parse JSON response
 │   ├── 5. Validate action ∈ VALID_ACTIONS
 │   ├── 6. Sanitize targets ∈ VALID_MATERIALS
 │   └── 7. Return result or None
 │
 └── Retry Logic
     ├── Max 3 retries on 429 errors
     ├── Dynamic delay extraction from error message
     └── Cap delay at 30 seconds
```

**Valid Actions** (11):
```python
VALID_ACTIONS = [
    "ADD_MATERIAL", "REMOVE_MATERIAL", "ROLL_LEMON",
    "INSERT_INTO", "CONNECT_WIRE", "COMPLETE_CIRCUIT",
    "ADD_SERIES_CELL", "SHOW_REACTION", "CALCULATE",
    "REVERSE_LED", "EXPLAIN"
]
```

**Valid Materials** (6):
```python
VALID_MATERIALS = [
    "lemon", "zinc-nail", "copper-wire",
    "led", "wire-clip", "knife"
]
```

---

### 4.3 Backend Lab Agent

**File**: `backend/app/agents/lab_agent.py` (155 lines)

Regex-based intent detection for the `/api/chat` endpoint (separate from LLM classifier).

```
BackendLabAgent
 ├── process_message(experiment_id, message, context)
 │   ├── Detect intent via regex patterns
 │   └── Dispatch to handler
 │
 └── Handlers
     ├── _handle_circuit_calculation → chemistry.calculate_circuit()
     ├── _handle_reactions           → Returns 3 reaction equations
     ├── _handle_runtime             → chemistry.calculate_runtime()
     ├── _handle_explanation         → rag.query()
     ├── _handle_material_info       → rag.get_document()
     └── _handle_general             → rag.query() (generic)
```

---

### 4.4 RAG Engine

**File**: `backend/app/rag/engine.py` (117 lines)

Python mirror of the frontend `ExperimentRAG`. Per-experiment scoped.

```
RAGEngine
 ├── Auto-loads all experiment JSON files from data/experiments/
 ├── Builds per-experiment token index
 │
 ├── query(query, experiment_id, top_k) → List[Dict]
 │   ├── TF-IDF scoring
 │   ├── + substring match bonus
 │   └── + tag match bonus
 │
 └── Storage: documents[experiment_id] → List[Doc]
              token_index[experiment_id] → Dict[token, Set[doc_idx]]
```

---

### 4.5 Chemistry Calculator

**File**: `backend/app/chemistry/calculator.py` (148 lines)

Python mirror of the frontend `ChemistryEngine`.

| Method | Formula | Returns |
|--------|---------|---------|
| `nernst_potential(E°, n, [ion], T)` | $E = E° - \frac{RT}{nF} \ln \frac{1}{[\text{ion}]}$ | `float` (V) |
| `cell_voltage(E_cathode, E_anode, [ion], n)` | $E_{cell} = E_{cathode}^{Nernst} - E_{anode}^{Nernst}$ | `float` (V) |
| `gibbs_free_energy(n, V)` | $\Delta G = -nFE / 1000$ | `float` (kJ/mol) |
| `cell_current(V, R)` | $I = V/R$ (capped 1mA) | `float` (A) |
| `led_brightness(V, I)` | 0 below 1.5V, ramps to 1.0 | `float` (0–1) |
| `calculate_circuit(cells, rolled, R_ext)` | Series sum + Ohm's law | `Dict` |
| `calculate_runtime(mass, I, n, M)` | $t = \frac{m \cdot n \cdot F}{M \cdot I}$ | `Dict` |

---

### 4.6 Pydantic Schemas

**File**: `backend/app/models/schemas.py` (74 lines)

| Schema | Direction | Fields |
|--------|-----------|--------|
| `IntentRequest` | → Backend | `experiment_id`, `message`, `lab_state?` |
| `IntentResponse` | ← Backend | `action?`, `targets[]`, `quantity`, `confidence`, `reasoning`, `llm_used`, `rag_context?` |
| `ChatRequest` | → Backend | `experiment_id`, `message`, `context?` |
| `ChatResponse` | ← Backend | `reply`, `action?`, `rag_context?`, `calculations?` |
| `CircuitRequest` | → Backend | `num_cells`, `rolled`, `external_resistance` |
| `CircuitResponse` | ← Backend | Full circuit metrics + explanation |
| `MaterialQueryRequest` | → Backend | `query`, `experiment_id`, `top_k` |
| `MaterialQueryResponse` | ← Backend | `results[]` |
| `ExperimentResponse` | ← Backend | Full experiment data |

---

## 5. Data Flow — Pin-to-Pin

### 5.1 Message Processing Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Student types "Insert copper wire into the lemon"  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: ChatInterface.onSend(text)                         │
│  → LabWorkspace.handleSendMessage(text)                     │
│  → Creates student ChatMessage                              │
│  → Calls agent.processMessage(text)                         │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 3: LabAgent.processMessage(text)                      │
│                                                             │
│  3a. tryLLMClassify(text) ──────────────────────►           │
│      │  BackendAPI.classifyIntent(text, expId, labState)    │
│      │  → POST http://localhost:8000/api/intent             │
│      │    Body: {experiment_id, message, lab_state}         │
│      │                                                      │
│      │  Server-side:                                        │
│      │  ├── RAGEngine.query(text, "lemon-battery", top_k=4)│
│      │  ├── Build system prompt + RAG context               │
│      │  ├── OpenRouter API → Gemini 2.0 Flash Lite          │
│      │  │   Messages: [system_prompt, user: "Student: ..."] │
│      │  │   temp=0.1, max_tokens=256, json_object           │
│      │  ├── Parse JSON: {action, targets, confidence, ...}  │
│      │  └── Validate action + sanitize targets              │
│      │                                                      │
│      ◄── Returns: {                                         │
│          action: "INSERT_INTO",                              │
│          targets: ["copper-wire", "lemon"],                  │
│          confidence: 0.9,                                    │
│          reasoning: "Student wants to insert copper wire..." │
│      }                                                      │
│                                                             │
│  3b. (If LLM fails) IntentEngine.parse(text)               │
│      → Local NLP scoring → ScoredIntent[]                   │
│                                                             │
│  3c. (If both fail) ExperimentRAG.query(text)               │
│      → Pure Q&A answer                                      │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 4: LabAgent.executeIntent({                           │
│    action: "INSERT_INTO",                                    │
│    targets: ["copper-wire", "lemon"]                         │
│  })                                                         │
│                                                             │
│  → switch (action)                                           │
│    case "INSERT_INTO":                                       │
│      target[0] = "copper-wire" → sim.insertCopper()         │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 5: SimulationState.insertCopper()                     │
│  → labState.copperInserted = true                           │
│  → recalc()                                                 │
│    ├── Build CellData (Cu cathode + Zn anode)               │
│    ├── ChemistryEngine.calculateCircuit(cells, 500Ω)        │
│    │   → {voltage: 1.058V, current: 0.0011A, ...}          │
│    ├── Check circuit: lemons>0 ✓, nail ✓, copper ✓,        │
│    │   LED? hasLED? ledConnected? → incomplete              │
│    └── circuitState.isComplete = false                      │
│  → notify() → all subscribers called                        │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 6: UI Updates (via observer subscription)             │
│                                                             │
│  LabWorkspace re-renders with new state:                    │
│  ├── LabCanvas: redraws copper wire inserted in lemon       │
│  ├── MetricsPanel: shows updated voltage                    │
│  ├── StepsTracker: may auto-complete "Insert Metals" step   │
│  └── ChatInterface: shows agent response messages           │
└─────────────────────────────────────────────────────────────┘
```

---

### 5.2 Intent Resolution Chain

```
Student Message
      │
      ▼
  ┌───────────────────┐
  │ 1. Backend LLM    │──── POST /api/intent ────► OpenRouter ──► Gemini
  │    (confidence?)   │                                              │
  └────────┬──────────┘◄────── JSON response ◄───────────────────────┘
           │
    ≥ 0.6? ├── YES → Use LLM result
           │
    NO / ──┤
    Error   │
           ▼
  ┌───────────────────┐
  │ 2. Local Intent   │──── IntentEngine.parse() ──► Scored intents
  │    Engine (score?) │
  └────────┬──────────┘
           │
    ≥ 30?  ├── YES → Use local result
           │
    NO ────┤
           │
           ▼
  ┌───────────────────┐
  │ 3. RAG Q&A        │──── ExperimentRAG.query() ──► Knowledge answer
  │    (fallback)      │
  └───────────────────┘
```

---

### 5.3 State Update Flow

```
  executeIntent()
       │
       ▼
  SimulationState.method()
       │
       ├── Update CanvasLabState (10 booleans)
       │
       ├── recalc()
       │   ├── Build cells: CellData[] from lab state
       │   │   └── Each cell: createLemonCell(rolled?)
       │   │
       │   ├── Check circuit completeness
       │   │   └── ALL of: lemons>0, nailInserted, copperInserted,
       │   │       hasLED, ledConnected, !ledReversed
       │   │
       │   ├── ChemistryEngine.calculateCircuit(cells, R_ext)
       │   │   ├── V_total = Σ cell.cellVoltage
       │   │   ├── R_total = (n × 500Ω) + R_ext
       │   │   ├── I = V / R (capped at 1mA)
       │   │   ├── P = V × I
       │   │   └── LED_brightness = f(V, I)
       │   │
       │   └── Update circuitState
       │
       └── notify()
           ├── LabWorkspace → setState({labState, circuitState})
           ├── LabCanvas → repaint canvas
           ├── MetricsPanel → update metrics display
           ├── ReactionsPanel → show/hide reactions
           └── StepsTracker → auto-advance steps
```

---

### 5.4 Rendering Pipeline

```
LabCanvas (HTML5 Canvas, 480+ lines)
 │
 ├── requestAnimationFrame loop
 │   ├── Clear canvas
 │   ├── Draw based on current view mode:
 │   │
 │   ├── LAB VIEW
 │   │   ├── Lab bench (gradient background)
 │   │   ├── Lemons (oval, rolling animation if lemonRolled)
 │   │   │   └── For each lemon in 1..lemons
 │   │   ├── Zinc nail (if nailInserted → inside lemon)
 │   │   ├── Copper wire (if copperInserted → inside lemon)
 │   │   ├── LED (with glow rays if circuit complete)
 │   │   │   ├── Color-coded legs (red anode / black cathode)
 │   │   │   └── "REVERSED" indicator if ledReversed
 │   │   ├── Connection wires (if ledConnected)
 │   │   ├── Electron flow particles (animated dots)
 │   │   └── Voltage readout overlay
 │   │
 │   ├── MOLECULE VIEW
 │   │   ├── Animated Zn atoms (gray)
 │   │   ├── Cu atoms (copper colored)
 │   │   ├── Electron transfer arrows (blue)
 │   │   ├── H⁺ ions (red, moving)
 │   │   ├── Zn²⁺ ions (leaving anode)
 │   │   └── Labels + equation overlay
 │   │
 │   └── CIRCUIT VIEW
 │       ├── Schematic battery symbol
 │       ├── LED symbol
 │       ├── Wire connections
 │       ├── Current direction arrows
 │       └── V/I/R readout
 │
 ├── View toggle buttons (Lab | Molecule | Circuit)
 ├── Step progress dots
 └── ResizeObserver for responsive sizing
```

---

## 6. LLM + RAG Architecture

### End-to-End LLM Pipeline

```
Student: "Insert the copper wire into the lemon about 2-3 cm from the nail"
                          │
                          ▼
            ┌─────────────────────────┐
            │    Frontend (Browser)    │
            │                         │
            │  BackendAPI.classifyIntent({
            │    message: "Insert the copper wire...",
            │    experiment_id: "lemon-battery",
            │    lab_state: {
            │      lemons: 1,
            │      hasNail: true,
            │      hasCopper: true,
            │      nailInserted: true,
            │      copperInserted: false,
            │      ...
            │    }
            │  })                     │
            └────────────┬────────────┘
                         │ POST /api/intent
                         ▼
            ┌─────────────────────────┐
            │    Backend (FastAPI)     │
            │                         │
            │  1. Load experiment desc │
            │     from lemon_battery.json
            │                         │
            │  2. RAG Query (top 4):  │
            │     ├── "Copper Wire    │
            │     │    Properties"    │
            │     ├── "Zinc (Nail)    │
            │     │    Properties"    │
            │     ├── "Electrode      │
            │     │    Insertion"     │
            │     └── "Lemon Battery  │
            │          Overview"      │
            │                         │
            │  3. Build System Prompt: │
            │     ┌──────────────────┐│
            │     │EXPERIMENT: ...   ││
            │     │LAB STATE: {...}  ││
            │     │RAG CONTEXT: ...  ││
            │     │VALID ACTIONS: ...││
            │     │RULES: 1-13      ││
            │     │JSON SCHEMA: ...  ││
            │     └──────────────────┘│
            │                         │
            │  4. OpenRouter API Call  │
            └────────────┬────────────┘
                         │ HTTPS
                         ▼
            ┌─────────────────────────┐
            │    OpenRouter           │
            │    → google/gemini-2.0- │
            │      flash-lite-001    │
            │                         │
            │  Input:                 │
            │    system: [prompt]     │
            │    user: 'Student says: │
            │    "Insert the copper   │
            │     wire into the lemon │
            │     about 2-3 cm..."'   │
            │                         │
            │  Config:                │
            │    temperature: 0.1     │
            │    max_tokens: 256      │
            │    response_format:     │
            │      json_object        │
            │                         │
            │  Output:                │
            │  {                      │
            │    "action":"INSERT_INTO│",
            │    "targets":           │
            │      ["copper-wire",    │
            │       "lemon"],         │
            │    "confidence": 0.9,   │
            │    "reasoning":         │
            │      "Student wants to  │
            │       insert copper..." │
            │  }                      │
            └────────────┬────────────┘
                         │
                         ▼
            ┌─────────────────────────┐
            │  Backend validates:     │
            │  ├── action ∈ VALID (✓) │
            │  ├── targets ∈ VALID (✓)│
            │  └── Attach RAG context │
            │                         │
            │  Return IntentResponse: │
            │  {                      │
            │    action: "INSERT_INTO",│
            │    targets: ["copper-wire", "lemon"],
            │    quantity: 1,         │
            │    confidence: 0.9,     │
            │    llm_used: true,      │
            │    rag_context: [...]   │
            │  }                      │
            └────────────┬────────────┘
                         │
                         ▼
            ┌─────────────────────────┐
            │  Frontend executes:     │
            │  → sim.insertCopper()   │
            │  → recalc() → notify()  │
            │  → Canvas redraws       │
            │  → "✅ Copper wire      │
            │     inserted into       │
            │     the lemon!"         │
            └─────────────────────────┘
```

### RAG Document Injection

Each LLM call gets **4 RAG documents** injected into the system prompt:

```
## RAG CONTEXT (relevant experiment knowledge)

[Copper Wire Properties]
In the lemon battery, copper acts as the CATHODE (positive terminal).
Copper has a standard reduction potential of +0.34V...

[Zinc (Galvanized Nail) Properties]
As the battery operates, the zinc slowly dissolves into the lemon juice
as Zn²⁺ ions. Standard potential: -0.76V...

[Electrode Insertion Step]
Insert both electrodes about 2-3 cm apart. The zinc nail and copper wire
must both contact the acidic juice inside the lemon...

[Lemon Battery Overview]
The lemon battery is a classic electrochemistry experiment that demonstrates
how chemical energy can be converted to electrical energy...
```

This gives the LLM **domain knowledge** to make accurate classifications even for complex or ambiguous phrasings.

---

## 7. Chemistry Calculation Engine

### Equations Implemented

| # | Equation | Formula | Implementation |
|---|----------|---------|----------------|
| 1 | **Nernst Equation** | $E = E° - \frac{RT}{nF} \ln \frac{1}{[\text{ion}]}$ | `nernstPotential(E°, n, [ion])` |
| 2 | **Cell EMF** | $E_{cell} = E_{cathode} - E_{anode}$ | `cellVoltage(cathode, anode, electrolyte)` |
| 3 | **Gibbs Free Energy** | $\Delta G = -nFE$ | `gibbsFreeEnergy(n, E)` |
| 4 | **Ohm's Law** | $I = \frac{V}{R}$ | `cellCurrent(V, R)` |
| 5 | **Electrical Power** | $P = VI$ | Inline in `calculateCircuit()` |
| 6 | **Faraday's Law** | $t = \frac{m \cdot n \cdot F}{M \cdot I}$ | `calculateRuntime(cell, I)` |
| 7 | **LED Brightness** | Threshold model at 1.5V–3.0V | `ledBrightness(V, I)` |

### Lemon Battery Calculations Example

```
Standard Potentials:
  E°(Zn²⁺/Zn)  = -0.76 V  (anode)
  E°(Cu²⁺/Cu)  = +0.34 V  (cathode, but H⁺/H₂ reaction at copper)

Single Cell (unrolled):
  E_cell ≈ 1.058V
  R_internal = 500Ω
  I = 1.058V / 500Ω = 0.00212A → capped at 0.001A (1mA)
  P = 1.058 × 0.001 = 0.00106W

Single Cell (rolled — 10% improvement):
  Conductivity: 0.38 → 0.42 S/m
  Concentration: 0.030 → 0.035 mol/L
  E_cell ≈ 1.066V

Series Connection:
  1 lemon: ~1.06V → LED OFF  (needs ≥1.5V)
  2 lemons: ~2.12V → LED DIM  (brightness ~21%)
  3 lemons: ~3.17V → LED BRIGHT (brightness ~78%)
```

---

## 8. Canvas Rendering System

### View Modes

| View | Purpose | Key Visual Elements |
|------|---------|-------------------|
| **Lab View** | Physical bench simulation | Lemons, nails, copper wires, LED with glow, connection wires, electron flow particles, voltage readout |
| **Molecule View** | Atomic-level visualization | Zn atoms, Cu atoms, electron transfer arrows, H⁺ ions, Zn²⁺ ions dissolving, reaction labels |
| **Circuit View** | Schematic diagram | Battery symbol, LED symbol, wire paths, current arrows, V/I/R values |

### Rendering Architecture

```
LabCanvas Component
 │
 ├── useRef: canvasRef (HTMLCanvasElement)
 ├── useState: view ('lab' | 'molecule' | 'circuit')
 ├── useEffect: setup ResizeObserver
 ├── useEffect: requestAnimationFrame loop
 │
 └── Animation Frame (60fps)
     ├── ctx.clearRect(0, 0, w, h)
     ├── switch(view)
     │   ├── 'lab':      drawLabView(ctx, labState, circuitState, t)
     │   ├── 'molecule': drawMoleculeView(ctx, labState, circuitState, t)
     │   └── 'circuit':  drawCircuitView(ctx, labState, circuitState, t)
     └── requestAnimationFrame(loop) // continues
```

### Particle System (Electron Flow)

When the circuit is complete, animated particles flow along wire paths:

```
Particles[] = [
  { x, y, progress: 0..1, speed }
]

Each frame:
  particle.progress += speed × dt
  particle.position = interpolate(wirePath, progress)
  draw blue dot at position
  if progress > 1: reset to 0
```

---

## 9. Experiment Data Schema

Each experiment is a self-contained data file that includes everything needed:

```typescript
interface Experiment {
  // Identity
  id: string;                    // "lemon-battery"
  name: string;                  // "Lemon Battery"
  emoji: string;                 // "🍋"
  description: string;           // Full description
  category: string;              // "Electrochemistry"
  difficulty: string;            // "Beginner"

  // Materials (what's available)
  materials: Material[];         // 6 for lemon battery
    // Each: id, name, emoji, category, description,
    //        properties[], color, shape, dimensions

  // Steps (experiment procedure)
  steps: ExperimentStep[];       // 5 for lemon battery
    // Each: id, title, instructions[],
    //        requiredMaterials[], expectedActions[],
    //        explanation, completed

  // Reactions (chemical equations)
  reactions: ReactionStep[];     // 3 for lemon battery
    // Each: equation, description,
    //        type: 'oxidation'|'reduction'|'overall',
    //        deltaG?

  // Knowledge Base (RAG documents)
  ragDocuments: RAGDocument[];   // 14 for lemon battery
    // Each: id, title, content (300+ chars),
    //        metadata, tags[]

  // Reference Text
  scientificBackground: string;  // Detailed science background
}
```

### Adding a New Experiment

1. Create `frontend/src/data/experiments/my-experiment.ts`
2. Create `backend/app/data/experiments/my_experiment.json`
3. Export the experiment object with all materials, steps, reactions, and RAG docs
4. Import in `App.tsx` and add to the `EXPERIMENTS` array
5. **No other code changes needed** — the system dynamically handles everything

---

## 10. Configuration & Environment

### Frontend Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_URL` | `http://localhost:8000` | Backend API base URL |

### Backend Environment Variables (`.env`)

| Variable | Purpose | Example |
|----------|---------|---------|
| `OPENROUTER_API_KEY` | API key for OpenRouter | `sk-or-v1-...` |
| `OPENROUTER_MODEL` | LLM model to use | `google/gemini-2.0-flash-lite-001` |

### Ports

| Service | Port | Protocol |
|---------|------|----------|
| Frontend Dev Server (Vite) | 3000 | HTTP |
| Backend API (FastAPI/Uvicorn) | 8000 | HTTP |
| OpenRouter API | 443 | HTTPS |

### Dependencies

**Frontend** (`package.json`):
| Package | Version | Purpose |
|---------|---------|---------|
| `react` | ^18.3.1 | UI framework |
| `react-dom` | ^18.3.1 | DOM rendering |
| `typescript` | ~5.6.2 | Type safety |
| `vite` | ^6.0.0 | Build tool + dev server |
| `@vitejs/plugin-react` | ^4.3.4 | React JSX transform |

**Backend** (`requirements.txt`):
| Package | Version | Purpose |
|---------|---------|---------|
| `fastapi` | 0.115.0 | API framework |
| `uvicorn[standard]` | 0.30.0 | ASGI server |
| `pydantic` | 2.9.0 | Data validation |
| `python-dotenv` | 1.0.1 | Environment variables |
| `openai` | ≥1.0.0 | OpenRouter API client (OpenAI-compatible) |

---

## 11. Key Constants Reference

### Physics & Chemistry Constants

| Constant | Symbol | Value | Unit |
|----------|--------|-------|------|
| Gas constant | R | 8.314 | J/(mol·K) |
| Faraday constant | F | 96485 | C/mol |
| Temperature | T | 298.15 | K (25°C) |
| Standard potential (Zinc) | E°(Zn) | −0.76 | V |
| Standard potential (Copper) | E°(Cu) | +0.34 | V |
| LED forward voltage | V_f | 1.8 | V |
| LED minimum voltage | V_min | 1.5 | V |
| LED resistance | R_LED | 100 | Ω |
| Internal resistance per cell | R_int | 500 | Ω |
| Max electrochemical current | I_max | 0.001 | A (1 mA) |

### Application Constants

| Constant | Value | Location |
|----------|-------|----------|
| Max lemon cells | 3 | `SimulationState` |
| LLM confidence threshold | 0.6 | `LabAgent` |
| Intent score threshold | 30 | `IntentEngine` |
| RAG query top-K (frontend) | 3 | `ExperimentRAG.query()` |
| RAG query top-K (LLM prompt) | 4 | `LLMIntentClassifier.classify()` |
| LLM temperature | 0.1 | `llm_intent.py` |
| LLM max tokens | 256 | `llm_intent.py` |
| LLM max retries | 3 | `llm_intent.py` |
| Backend API timeout | 10s | `BackendAPI.ts` |
| Status check timeout | 3s | `BackendAPI.ts` |

---

## 12. File Map

```
SmartLab/
├── ARCHITECTURE.md                          ← This document
├── README.md                                ← Project overview + quickstart
│
├── frontend/                                ← React + TypeScript + Vite
│   ├── package.json                         ← NPM dependencies
│   ├── tsconfig.json                        ← TypeScript config
│   ├── vite.config.ts                       ← Vite build + dev proxy
│   │
│   └── src/
│       ├── main.tsx                         ← React 18 entry point
│       ├── App.tsx                          ← Root component + experiment routing
│       ├── index.css                        ← Global dark theme (843 lines)
│       ├── vite-env.d.ts                    ← Vite type declarations
│       │
│       ├── types/
│       │   └── index.ts                     ← Full type system (170 lines)
│       │
│       ├── agents/
│       │   ├── LabAgent.ts                  ← NLP orchestrator (595 lines)
│       │   ├── IntentEngine.ts              ← Local NLP fallback (585 lines)
│       │   └── BackendAPI.ts                ← HTTP client for LLM (68 lines)
│       │
│       ├── engine/
│       │   ├── ChemistryEngine.ts           ← Electrochemistry calculations (230 lines)
│       │   └── SimulationState.ts           ← Lab state manager (342 lines)
│       │
│       ├── rag/
│       │   └── ExperimentRAG.ts             ← TF-IDF retrieval (119 lines)
│       │
│       ├── data/experiments/
│       │   └── lemon-battery.ts             ← Lemon Battery data (339 lines)
│       │
│       └── components/
│           ├── ExperimentSelector/
│           │   └── ExperimentSelector.tsx    ← Landing page (63 lines)
│           │
│           └── ExperimentLab/
│               ├── LabWorkspace.tsx          ← Main layout orchestrator (150 lines)
│               ├── LabCanvas.tsx             ← HTML5 Canvas renderer (480+ lines)
│               ├── ChatInterface.tsx         ← Chat UI + quick actions (185 lines)
│               ├── StepsTracker.tsx          ← Step progress tracker (150 lines)
│               ├── MetricsPanel.tsx          ← Live circuit metrics (97 lines)
│               ├── MaterialsPalette.tsx      ← Material chips (32 lines)
│               └── ReactionsPanel.tsx        ← Chemical equations (60 lines)
│
├── backend/                                 ← Python FastAPI
│   ├── .env                                 ← OpenRouter API key + model config
│   ├── requirements.txt                     ← Python dependencies
│   │
│   └── app/
│       ├── __init__.py
│       ├── main.py                          ← FastAPI routes (210 lines)
│       │
│       ├── agents/
│       │   ├── __init__.py
│       │   ├── llm_intent.py                ← OpenRouter LLM classifier (207 lines)
│       │   └── lab_agent.py                 ← Regex-based backend agent (155 lines)
│       │
│       ├── chemistry/
│       │   ├── __init__.py
│       │   └── calculator.py                ← Server-side calculations (148 lines)
│       │
│       ├── rag/
│       │   ├── __init__.py
│       │   └── engine.py                    ← Server-side TF-IDF RAG (117 lines)
│       │
│       ├── models/
│       │   ├── __init__.py
│       │   └── schemas.py                   ← Pydantic request/response (74 lines)
│       │
│       └── data/experiments/
│           └── lemon_battery.json           ← Backend experiment data (~200 lines)
```

**Total**: ~4,800+ lines of code across 30+ files.

---

> **Note**: This architecture supports adding new experiments by simply adding data files. The LLM system prompt, RAG engine, state manager, and canvas renderer are all experiment-agnostic — they read everything from the experiment data definition.
