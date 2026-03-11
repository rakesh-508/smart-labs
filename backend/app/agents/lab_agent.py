# ───────────────────────────────────────────────────────
#  Smart Lab – Backend Lab Agent
#  Processes student messages, queries RAG,
#  performs calculations, returns structured responses.
#  In production, integrate with an LLM (OpenAI, etc.)
# ───────────────────────────────────────────────────────

import re
from typing import Dict, Any, Optional, List
from app.rag.engine import RAGEngine
from app.chemistry.calculator import ChemistryCalculator


class BackendLabAgent:
    """Agentic backend that processes student queries using RAG + Chemistry."""

    def __init__(self, rag: RAGEngine, chemistry: ChemistryCalculator):
        self.rag = rag
        self.chemistry = chemistry

    def process_message(
        self,
        experiment_id: str,
        message: str,
        context: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Process a student message and return structured response."""
        lower = message.lower().strip()

        # Detect intent
        intent = self._detect_intent(lower)

        # Query RAG for context
        rag_results = self.rag.query(message, experiment_id, top_k=3)
        rag_context = [{"title": r["title"], "excerpt": r["excerpt"]} for r in rag_results]

        # Generate response based on intent
        if intent == "calculate_circuit":
            return self._handle_circuit_calculation(context, rag_context)

        elif intent == "show_reaction":
            return self._handle_reactions(rag_context)

        elif intent == "calculate_runtime":
            return self._handle_runtime(context, rag_context)

        elif intent == "explain":
            return self._handle_explanation(message, rag_results, rag_context)

        elif intent == "material_info":
            return self._handle_material_info(message, rag_results, rag_context)

        else:
            return self._handle_general(message, rag_results, rag_context)

    def _detect_intent(self, text: str) -> str:
        """Simple NLU intent detection."""
        if re.search(r'calculat|comput|what.*voltage|what.*current|what.*power', text):
            if re.search(r'runtime|how long|lifetime|last', text):
                return "calculate_runtime"
            return "calculate_circuit"

        if re.search(r'reaction|equation|formula|chemistry|what happens', text):
            return "show_reaction"

        if re.search(r'explain|why|how does|tell me about|what is', text):
            return "explain"

        if re.search(r'lemon|zinc|copper|led|wire|nail|material|properties', text):
            return "material_info"

        return "general"

    def _handle_circuit_calculation(self, context: Optional[Dict], rag_context: List) -> Dict:
        num_cells = (context or {}).get("cell_count", 1)
        rolled = (context or {}).get("rolled", True)
        circuit = self.chemistry.calculate_circuit(num_cells, rolled)

        return {
            "reply": (
                f"📊 **Circuit Calculation Results:**\n\n"
                f"• Cells: {num_cells}\n"
                f"• Total Voltage: {circuit['total_voltage']:.3f}V\n"
                f"• Current: {circuit['current_mA']:.3f}mA\n"
                f"• Power: {circuit['power_mW']:.4f}mW\n"
                f"• LED: {circuit['led_status']}\n\n"
                f"{circuit['explanation']}"
            ),
            "action": {"type": "CALCULATE", "payload": circuit},
            "rag_context": rag_context,
            "calculations": circuit,
        }

    def _handle_reactions(self, rag_context: List) -> Dict:
        reactions = [
            {"equation": "Zn(s) → Zn²⁺(aq) + 2e⁻", "type": "oxidation",
             "description": "Zinc loses electrons at the anode", "deltaG": -146.7},
            {"equation": "2H⁺(aq) + 2e⁻ → H₂(g)↑", "type": "reduction",
             "description": "Hydrogen ions gain electrons at copper cathode", "deltaG": 0},
            {"equation": "Zn(s) + 2H⁺(aq) → Zn²⁺(aq) + H₂(g)↑", "type": "overall",
             "description": "Net reaction producing electric current", "deltaG": -212.3},
        ]

        reply = "⚗️ **Lemon Battery Reactions:**\n\n"
        for r in reactions:
            emoji = "🔴" if r["type"] == "oxidation" else "🔵" if r["type"] == "reduction" else "🟢"
            reply += f"{emoji} **{r['type'].title()}**: `{r['equation']}`\n"
            reply += f"   {r['description']} (ΔG = {r['deltaG']} kJ/mol)\n\n"

        reply += "Electrons flow from Zn → external circuit → Cu, powering the LED!"

        return {
            "reply": reply,
            "action": {"type": "SHOW_REACTION", "payload": {"reactions": reactions}},
            "rag_context": rag_context,
            "calculations": None,
        }

    def _handle_runtime(self, context: Optional[Dict], rag_context: List) -> Dict:
        current = (context or {}).get("current", 0.001)
        result = self.chemistry.calculate_runtime(8.0, current)

        return {
            "reply": f"⏱️ **Battery Runtime:**\n\n{result['explanation']}\n\nNote: Practical runtime is much shorter due to zinc coating depletion, acid neutralization, and hydrogen bubble polarization.",
            "action": {"type": "CALCULATE", "payload": result},
            "rag_context": rag_context,
            "calculations": result,
        }

    def _handle_explanation(self, message: str, rag_results: List, rag_context: List) -> Dict:
        if rag_results:
            content = rag_results[0].get("content", "")[:600]
            return {
                "reply": f"📖 **Here's an explanation:**\n\n{content}",
                "action": {"type": "EXPLAIN", "payload": {}},
                "rag_context": rag_context,
                "calculations": None,
            }
        return {
            "reply": "I don't have specific information about that. Could you rephrase your question?",
            "action": None,
            "rag_context": [],
            "calculations": None,
        }

    def _handle_material_info(self, message: str, rag_results: List, rag_context: List) -> Dict:
        if rag_results:
            content = rag_results[0].get("content", "")[:500]
            return {
                "reply": f"🧪 **Material Information:**\n\n{content}",
                "action": {"type": "EXPLAIN", "payload": {}},
                "rag_context": rag_context,
                "calculations": None,
            }
        return self._handle_explanation(message, rag_results, rag_context)

    def _handle_general(self, message: str, rag_results: List, rag_context: List) -> Dict:
        if rag_results:
            content = rag_results[0].get("content", "")[:400]
            return {
                "reply": f"📖 {content}",
                "action": None,
                "rag_context": rag_context,
                "calculations": None,
            }
        return {
            "reply": (
                "I'd be happy to help! You can ask me about:\n"
                "• Materials (lemon, zinc, copper, LED)\n"
                "• Chemical reactions and equations\n"
                "• Voltage/current calculations\n"
                "• Experiment steps and techniques\n"
                "• Troubleshooting tips"
            ),
            "action": None,
            "rag_context": [],
            "calculations": None,
        }
