# ───────────────────────────────────────────────────────
#  Smart Lab – Pydantic Models / Schemas
# ───────────────────────────────────────────────────────

from pydantic import BaseModel
from typing import Optional, Any, List


class ChatRequest(BaseModel):
    experiment_id: str
    message: str
    context: Optional[dict] = None


class ChatResponse(BaseModel):
    reply: str
    action: Optional[dict] = None
    rag_context: Optional[list] = None
    calculations: Optional[dict] = None


class IntentRequest(BaseModel):
    """Input for the LLM intent classifier."""
    experiment_id: str = "lemon-battery"
    message: str
    lab_state: Optional[dict] = None


class IntentResponse(BaseModel):
    """Structured action returned by the LLM intent classifier."""
    action: Optional[str] = None
    targets: List[str] = []
    quantity: int = 1
    confidence: float = 0.0
    reasoning: str = ""
    llm_used: bool = False
    rag_context: Optional[list] = None


class CircuitRequest(BaseModel):
    num_cells: int = 1
    rolled: bool = True
    external_resistance: float = 100.0


class CircuitResponse(BaseModel):
    total_voltage: float
    current_amps: float
    current_mA: float
    resistance_ohms: float
    power_watts: float
    power_mW: float
    led_brightness: float
    led_status: str
    cells: list
    explanation: str


class MaterialQueryRequest(BaseModel):
    query: str
    experiment_id: str = "lemon-battery"
    top_k: int = 3


class MaterialQueryResponse(BaseModel):
    results: list


class ExperimentResponse(BaseModel):
    id: str
    name: str
    emoji: str = ""
    description: str = ""
    category: str = ""
    difficulty: str = ""
    materials: list = []
    steps: list = []
    reactions: list = []
    rag_documents: list = []
    scientific_background: str = ""
