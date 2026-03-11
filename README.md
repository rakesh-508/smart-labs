# 🔬 Smart Lab — AI-Powered Virtual Science Laboratory

> **Designing Smart Labs for Schools** — An interactive virtual laboratory platform where students perform real science experiments through a chat-driven AI agent, complete with accurate physics/chemistry calculations, visual simulations, and a RAG-powered knowledge base.

---

## 🎯 Vision

Native schools often lack proper lab equipment. Smart Lab brings **real-world experiments to any laptop** through:

- **Chat-driven interaction** — Students talk to the Lab Agent in natural language
- **Visual SVG simulation** — See materials, reactions, and results on screen
- **Real science calculations** — Nernst equation, Faraday's law, Gibbs free energy
- **RAG knowledge base** — Every experiment has its own dedicated knowledge base
- **Dynamic, not hardcoded** — Add new experiments by adding data files

---

## 🍋⚡ Current Experiment: Lemon Battery

Build an electrochemical cell to light an LED!

### How Students Interact:

```
Student: "Take a lemon"
Agent:   🍋 Lemon added! Weight: 110g, pH: 2.0, Conductivity: 0.38 S/m...

Student: "Roll the lemon"  
Agent:   🍋 Rolling... Juice vesicles breaking! Conductivity improved by 10%!

Student: "Insert the nail into the lemon"
Agent:   ✅ Zinc nail inserted. Now in contact with citric acid electrolyte.

Student: "Complete the circuit"
Agent:   ⚡ Circuit complete! Voltage: 1.058V, Current: 0.001mA, LED: Not lit — add more lemons!

Student: "Add another lemon"
Agent:   🍋 Added cell #2! Total: 2.116V, LED brightness: 21%!
```

---

## 🏗️ Architecture

```
SmartLab/
├── frontend/                    # React + TypeScript + Vite
│   └── src/
│       ├── types/index.ts       # Full type system
│       ├── engine/
│       │   ├── ChemistryEngine.ts  # Nernst, Faraday, Gibbs calculations
│       │   └── SimulationState.ts  # Lab state manager
│       ├── rag/
│       │   └── ExperimentRAG.ts    # TF-IDF RAG engine
│       ├── agents/
│       │   └── LabAgent.ts         # NLP agent (intent parsing + actions)
│       ├── data/experiments/
│       │   └── lemon-battery.ts    # Full experiment definition + RAG docs
│       └── components/
│           ├── ExperimentSelector/  # Landing page
│           └── ExperimentLab/
│               ├── LabWorkspace.tsx  # Main orchestrator
│               ├── LabCanvas.tsx     # SVG visual simulation
│               ├── ChatInterface.tsx # Student chat + quick actions
│               ├── StepsTracker.tsx  # Progress tracker
│               ├── MetricsPanel.tsx  # Live voltage/current/power
│               ├── MaterialsPalette.tsx  # Quick-add materials
│               └── ReactionsPanel.tsx    # Chemical equations
│
├── backend/                     # Python FastAPI
│   └── app/
│       ├── main.py              # API routes
│       ├── chemistry/calculator.py  # Server-side calculations
│       ├── rag/engine.py        # Server-side RAG
│       ├── agents/lab_agent.py  # Server-side agent
│       ├── models/schemas.py    # Pydantic models
│       └── data/experiments/
│           └── lemon_battery.json   # Experiment data
│
└── README.md
```

---

## 🧪 Key Technical Features

### Chemistry Engine (Real Calculations)
| Formula | Implementation |
|---------|---------------|
| **Nernst Equation** | `E = E° - (RT/nF)·ln(Q)` — adjusts electrode potential for concentration |
| **Cell EMF** | `E_cell = E_cathode - E_anode` — calculates total voltage |
| **Gibbs Free Energy** | `ΔG = -nFE` — determines spontaneity |
| **Faraday's Law** | `t = mnF/(MI)` — predicts battery lifetime |
| **Ohm's Law** | `I = V/R` — calculates current (capped at electrochemical limit) |
| **LED Brightness** | Voltage/current-dependent model with threshold |

### RAG Knowledge Base
- Each experiment has **dedicated RAG documents** (~12 docs for lemon battery)
- Covers: materials, reactions, steps, theory, troubleshooting, safety, alternatives
- **TF-IDF scoring** with tag boosting and substring matching
- In production: swap with vector DB (Pinecone, Chroma, etc.) + embeddings

### Lab Agent (NLP-Driven)
- **Intent parsing**: add material, roll, insert, connect, complete circuit, calculate, explain
- **Entity recognition**: maps natural language to specific materials
- **Step tracking**: monitors experiment progress automatically
- **RAG-augmented responses**: every answer references the knowledge base

---

## 🚀 Getting Started

### Frontend
```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# → http://localhost:8000/docs (Swagger UI)
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/experiments` | List all experiments |
| GET | `/api/experiments/{id}` | Get experiment details |
| POST | `/api/chat` | Send message to lab agent |
| POST | `/api/calculate/circuit` | Calculate circuit properties |
| POST | `/api/rag/query` | Query knowledge base |
| GET | `/api/calculate/nernst` | Nernst equation calculator |
| GET | `/api/calculate/gibbs` | Gibbs free energy calculator |
| GET | `/api/calculate/runtime` | Battery runtime calculator |

---

## 📐 Lemon Battery Science

### Cell Voltage Calculation
```
E°(Zn²⁺/Zn) = -0.76V  (anode)
E°(H⁺/H₂)  =  0.00V  (cathode, at copper)

E_cell = E_cathode - E_anode = 0.00 - (-0.76) = 0.76V (standard)

With Nernst correction (citric acid ~0.03 mol/L):
E ≈ 1.0 - 1.1V per lemon cell
```

### Series Connection
```
1 lemon: ~1.05V → LED OFF (needs 1.5V)
2 lemons: ~2.10V → LED DIM
3 lemons: ~3.15V → LED BRIGHT ✨
```

---

## 🔮 Roadmap: Adding New Experiments

1. Create experiment data file in `frontend/src/data/experiments/`
2. Create backend JSON in `backend/app/data/experiments/`
3. Define materials with properties, steps with actions, and RAG documents
4. The system dynamically loads and renders — **no hardcoding needed!**

### Planned Experiments
- 🌋 Baking Soda Volcano (acid-base reactions)
- 🧲 Electromagnet (electromagnetism)
- 🌈 Chromatography (separation techniques)
- 🔥 Candle Under Glass (combustion & gas laws)

---

## 📜 License

MIT — Built for education. Free for all schools.
