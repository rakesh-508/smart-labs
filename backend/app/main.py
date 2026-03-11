# ───────────────────────────────────────────────────────
#  Smart Lab – Python Backend
#  FastAPI server with RAG, Chemistry Engine, and Agent
# ───────────────────────────────────────────────────────

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import json
import os
import logging

from dotenv import load_dotenv
import pathlib

# Configure logging so all our loggers are visible
logging.basicConfig(level=logging.INFO, format="%(name)s - %(levelname)s - %(message)s")

# Load .env from the backend directory (handles --reload CWD issues)
_backend_dir = pathlib.Path(__file__).resolve().parent.parent
load_dotenv(_backend_dir / ".env")

from app.chemistry.calculator import ChemistryCalculator
from app.rag.engine import RAGEngine
from app.agents.lab_agent import BackendLabAgent
from app.agents.llm_intent import LLMIntentClassifier
from app.models.schemas import (
    ChatRequest, ChatResponse,
    CircuitRequest, CircuitResponse,
    MaterialQueryRequest, MaterialQueryResponse,
    ExperimentResponse,
    IntentRequest, IntentResponse,
)

app = FastAPI(
    title="Smart Lab API",
    description="AI-Powered Virtual Science Laboratory Backend",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Initialize services ────────────────────────────────
rag_engine = RAGEngine()
chemistry = ChemistryCalculator()
agent = BackendLabAgent(rag_engine, chemistry)
llm_classifier = LLMIntentClassifier(rag_engine)

# Load experiment data
DATA_DIR = os.path.join(os.path.dirname(__file__), "data", "experiments")

def load_experiment(exp_id: str) -> dict:
    filepath = os.path.join(DATA_DIR, f"{exp_id.replace('-', '_')}.json")
    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


# ── Routes ─────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "message": "Smart Lab API is running",
        "version": "1.0.0",
        "llm_available": llm_classifier.is_available,
    }


@app.get("/api/status")
def status():
    """Health check with LLM availability."""
    return {
        "status": "ok",
        "llm_available": llm_classifier.is_available,
        "llm_model": llm_classifier._model_name if llm_classifier.is_available else None,
    }


@app.post("/api/intent")
async def classify_intent(request: IntentRequest):
    """
    Classify student message into a structured lab action using OpenRouter LLM + RAG.
    This is the core 'smart' endpoint — it understands ANY phrasing.
    """
    # Load experiment description
    exp_data = load_experiment(request.experiment_id)
    exp_desc = exp_data.get("description", "")

    # Try LLM classification
    result = await llm_classifier.classify(
        message=request.message,
        experiment_id=request.experiment_id,
        lab_state=request.lab_state,
        experiment_description=exp_desc,
    )

    if result is None:
        # LLM unavailable — return empty so frontend falls back to local engine
        return IntentResponse(
            action=None,
            targets=[],
            quantity=1,
            confidence=0.0,
            reasoning="LLM unavailable — using local intent engine",
            llm_used=False,
        )

    # Also attach RAG context for the frontend to display
    rag_results = rag_engine.query(request.message, request.experiment_id, top_k=2)
    rag_context = [{"title": r["title"], "excerpt": r["excerpt"]} for r in rag_results]

    return IntentResponse(
        action=result.get("action"),
        targets=result.get("targets", []),
        quantity=result.get("quantity", 1),
        confidence=result.get("confidence", 0.8),
        reasoning=result.get("reasoning", ""),
        llm_used=True,
        rag_context=rag_context,
    )


@app.get("/api/experiments")
def list_experiments():
    """List all available experiments."""
    experiments = []
    if os.path.exists(DATA_DIR):
        for fname in os.listdir(DATA_DIR):
            if fname.endswith(".json"):
                with open(os.path.join(DATA_DIR, fname), "r", encoding="utf-8") as f:
                    data = json.load(f)
                    experiments.append({
                        "id": data.get("id"),
                        "name": data.get("name"),
                        "emoji": data.get("emoji"),
                        "description": data.get("description"),
                        "category": data.get("category"),
                        "difficulty": data.get("difficulty"),
                    })
    return {"experiments": experiments}


@app.get("/api/experiments/{exp_id}")
def get_experiment(exp_id: str):
    """Get full experiment data including materials, steps, and RAG docs."""
    data = load_experiment(exp_id)
    if not data:
        raise HTTPException(status_code=404, detail=f"Experiment '{exp_id}' not found")
    return ExperimentResponse(**data)


@app.post("/api/chat")
def chat(request: ChatRequest):
    """Process a student message through the Lab Agent."""
    response = agent.process_message(
        experiment_id=request.experiment_id,
        message=request.message,
        context=request.context,
    )
    return ChatResponse(**response)


@app.post("/api/calculate/circuit")
def calculate_circuit(request: CircuitRequest):
    """Calculate circuit properties from cell configuration."""
    result = chemistry.calculate_circuit(
        num_cells=request.num_cells,
        rolled=request.rolled,
        external_resistance=request.external_resistance,
    )
    return CircuitResponse(**result)


@app.post("/api/rag/query")
def query_rag(request: MaterialQueryRequest):
    """Query the RAG knowledge base."""
    results = rag_engine.query(
        query=request.query,
        experiment_id=request.experiment_id,
        top_k=request.top_k,
    )
    return MaterialQueryResponse(results=results)


@app.get("/api/calculate/nernst")
def nernst_equation(
    standard_potential: float,
    n_electrons: int = 2,
    ion_concentration: float = 0.03,
    temperature: float = 298.15,
):
    """Calculate electrode potential using Nernst equation."""
    result = chemistry.nernst_potential(
        standard_potential, n_electrons, ion_concentration, temperature
    )
    return {
        "standard_potential": standard_potential,
        "actual_potential": result,
        "n_electrons": n_electrons,
        "ion_concentration": ion_concentration,
        "temperature_K": temperature,
        "equation": f"E = {standard_potential}V - (RT/{n_electrons}F)·ln(1/{ion_concentration})",
    }


@app.get("/api/calculate/gibbs")
def gibbs_free_energy(n_electrons: int = 2, cell_voltage: float = 1.10):
    """Calculate Gibbs free energy."""
    dG = chemistry.gibbs_free_energy(n_electrons, cell_voltage)
    return {
        "delta_G_kJ_per_mol": dG,
        "n_electrons": n_electrons,
        "cell_voltage": cell_voltage,
        "spontaneous": dG < 0,
        "equation": f"ΔG = -nFE = -{n_electrons}×96485×{cell_voltage} = {dG:.1f} kJ/mol",
    }


@app.get("/api/calculate/runtime")
def calculate_runtime(
    mass_grams: float = 8.0,
    current_amps: float = 0.001,
    n_electrons: int = 2,
    molar_mass: float = 65.38,
):
    """Calculate theoretical battery runtime using Faraday's law."""
    result = chemistry.calculate_runtime(mass_grams, current_amps, n_electrons, molar_mass)
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
