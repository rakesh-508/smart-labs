# ───────────────────────────────────────────────────────
#  Smart Lab – LLM Intent Classifier
#  Uses OpenRouter (OpenAI-compatible) + RAG context to
#  understand ANY student input and map it to lab actions.
#  Falls back gracefully if API key is not configured.
# ───────────────────────────────────────────────────────

import json
import logging
import os
import asyncio
import re
from typing import Any, Dict, List, Optional

from app.rag.engine import RAGEngine

logger = logging.getLogger(__name__)

# ── Available actions the UI can execute ─────────────────
VALID_ACTIONS = [
    "ADD_MATERIAL",
    "REMOVE_MATERIAL",
    "ROLL_LEMON",
    "INSERT_INTO",
    "CONNECT_WIRE",
    "COMPLETE_CIRCUIT",
    "ADD_SERIES_CELL",
    "SHOW_REACTION",
    "CALCULATE",
    "REVERSE_LED",
    "EXPLAIN",
]

VALID_MATERIALS = [
    "lemon",
    "zinc-nail",
    "copper-wire",
    "led",
    "wire-clip",
    "knife",
]

# ── System prompt template ───────────────────────────────

SYSTEM_PROMPT = """You are the intent-classifier for Smart Lab, a virtual science experiment platform.
Your ONLY job is to read the student's message and return a single JSON object that describes the lab action they want.

## THE EXPERIMENT
{experiment_description}

## CURRENT LAB STATE
{lab_state}

## RAG CONTEXT (relevant experiment knowledge)
{rag_context}

## VALID ACTIONS
- ADD_MATERIAL: Student wants to add/take/get a material. Targets: one material id.
- REMOVE_MATERIAL: Student wants to remove/discard a material. Targets: one material id.
- ROLL_LEMON: Student wants to roll/squeeze/prepare the lemon.
- INSERT_INTO: Student wants to insert an electrode into the lemon. Targets: [electrode_id, host_id].
- CONNECT_WIRE: Student wants to connect/attach wires or the LED. Targets: material id(s).
- COMPLETE_CIRCUIT: Student wants to complete/close/finish/activate the circuit.
- ADD_SERIES_CELL: Student wants to add another lemon for more voltage (series connection).
- SHOW_REACTION: Student wants to see chemical reactions/equations.
- CALCULATE: Student wants to calculate voltage/current/power/metrics.
- REVERSE_LED: Student wants to reverse/flip/swap the LED polarity.
- EXPLAIN: Student is asking a question that should be answered using the RAG knowledge.

## VALID MATERIAL IDs
lemon, zinc-nail, copper-wire, led, wire-clip, knife

## Rules
1. Return EXACTLY one JSON object, nothing else. No markdown, no explanation.
2. If the student is asking a question (what/why/how/explain), use action "EXPLAIN".
3. If the student mentions "insert X into Y", identify the electrode and host material.
4. "take", "get", "grab", "pick up", "give me", "i need" → ADD_MATERIAL
5. "another", "more", "extra", "series", "increase voltage" → ADD_SERIES_CELL
6. "roll", "squeeze", "press", "soften", "prepare" (the lemon) → ROLL_LEMON
7. "reverse", "flip", "swap", "change" + "poles"/"polarity"/"LED" → REVERSE_LED
8. "remove", "discard", "take away", "get rid of" → REMOVE_MATERIAL
9. "connect", "attach", "wire", "hook up" → CONNECT_WIRE
10. "complete", "close", "finish", "activate", "turn on", "light it up" → COMPLETE_CIRCUIT
11. For typos and misspellings, infer what the student meant from context.
12. quantity defaults to 1 unless the student specifies a number.
13. If very ambiguous, prefer action "EXPLAIN" and set confidence low.

## JSON Schema
{{
  "action": "<one of the valid actions>",
  "targets": ["<material_id>", ...],
  "quantity": <integer>,
  "confidence": <float 0-1>,
  "reasoning": "<brief one-line explanation of why you chose this action>"
}}
"""


class LLMIntentClassifier:
    """Classifies student intent using OpenRouter (OpenAI-compatible) + RAG context."""

    def __init__(self, rag: RAGEngine):
        self.rag = rag
        self._client = None
        self._model_name: str = ""
        self._available = False
        self._init_openrouter()

    def _init_openrouter(self):
        """Initialise the OpenRouter client via the OpenAI SDK."""
        api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
        if not api_key or api_key.startswith("your_"):
            logger.info("No valid OpenRouter API key found")
            return

        try:
            from openai import OpenAI

            self._client = OpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=api_key,
            )
            self._model_name = os.getenv(
                "OPENROUTER_MODEL", "google/gemini-2.0-flash-lite-001"
            )
            self._available = True
            logger.info(f"OpenRouter initialised OK (model: {self._model_name})")
        except ImportError:
            logger.warning("openai package not installed — run: pip install openai")
        except Exception as e:
            logger.error(f"OpenRouter init failed: {e}")

    @property
    def is_available(self) -> bool:
        return self._available

    def _extract_retry_delay(self, error_msg: str) -> float:
        """Extract retry delay from a 429 error message."""
        match = re.search(r"retry.*?(\d+(?:\.\d+)?)\s*s", str(error_msg), re.IGNORECASE)
        return float(match.group(1)) if match else 5.0

    async def classify(
        self,
        message: str,
        experiment_id: str = "lemon-battery",
        lab_state: Optional[Dict] = None,
        experiment_description: str = "",
    ) -> Optional[Dict[str, Any]]:
        """
        Classify a student message into a structured lab action.
        Returns None if LLM is unavailable or fails.
        Automatically retries on 429 rate-limit errors with backoff.
        """
        if not self._available or self._client is None:
            logger.warning("classify called but LLM not available")
            return None

        logger.info(f"Classifying: '{message}' for experiment '{experiment_id}'")

        # 1. Query RAG for relevant context
        rag_results = self.rag.query(message, experiment_id, top_k=4)
        rag_text = "\n\n".join(
            f"[{r['title']}]\n{r['content'][:300]}"
            for r in rag_results
        ) or "No relevant documents found."

        # 2. Build the system prompt with injected context
        state_text = json.dumps(lab_state or {}, indent=2)
        system_instruction = SYSTEM_PROMPT.format(
            experiment_description=experiment_description
            or "Lemon Battery – Build an electrochemical cell to light an LED.",
            lab_state=state_text,
            rag_context=rag_text,
        )

        # 3. Call OpenRouter with retry logic for rate limits
        max_retries = 3
        for attempt in range(max_retries + 1):
            try:
                response = self._client.chat.completions.create(
                    model=self._model_name,
                    messages=[
                        {"role": "system", "content": system_instruction},
                        {"role": "user", "content": f'Student says: "{message}"'},
                    ],
                    temperature=0.1,
                    max_tokens=256,
                    response_format={"type": "json_object"},
                )

                raw = response.choices[0].message.content.strip()
                logger.info(f"LLM raw response: {raw[:200]}")
                result = json.loads(raw)

                # Validate action
                if result.get("action") not in VALID_ACTIONS:
                    logger.warning(f"LLM returned invalid action: {result.get('action')}")
                    return None

                # Sanitise targets
                targets = result.get("targets", [])
                if isinstance(targets, str):
                    targets = [targets]
                result["targets"] = [t for t in targets if t in VALID_MATERIALS]

                result.setdefault("quantity", 1)
                result.setdefault("confidence", 0.8)

                return result

            except json.JSONDecodeError as e:
                logger.warning(f"LLM returned non-JSON: {e}")
                return None
            except Exception as e:
                error_str = str(e)
                if "429" in error_str or "rate" in error_str.lower():
                    if attempt < max_retries:
                        delay = self._extract_retry_delay(error_str)
                        delay = min(delay, 30.0)  # Cap at 30s
                        logger.warning(
                            f"Rate limited (attempt {attempt + 1}/{max_retries + 1}). "
                            f"Retrying in {delay:.1f}s..."
                        )
                        await asyncio.sleep(delay)
                        continue
                    else:
                        logger.error(f"Rate limit exhausted after {max_retries + 1} attempts")
                        return None
                else:
                    logger.error(f"OpenRouter API error: {e}")
                    return None

        return None
