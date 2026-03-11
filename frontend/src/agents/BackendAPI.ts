/* ───────────────────────────────────────────────────────
   Smart Lab – Backend API Client
   Calls the Python backend for LLM-powered intent
   classification. Falls back gracefully when backend
   is unavailable.
   ─────────────────────────────────────────────────────── */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface LLMIntentResult {
  action: string | null;
  targets: string[];
  quantity: number;
  confidence: number;
  reasoning: string;
  llm_used: boolean;
  rag_context?: { title: string; excerpt: string }[];
}

export interface BackendStatus {
  status: string;
  llm_available: boolean;
  llm_model: string | null;
}

/** Check if the backend is reachable and LLM is available */
export async function checkBackendStatus(): Promise<BackendStatus | null> {
  try {
    const res = await fetch(`${API_BASE}/api/status`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Call the backend Gemini LLM to classify a student message.
 * Returns null if backend is unreachable or LLM is not configured.
 */
export async function classifyIntent(
  message: string,
  experimentId: string,
  labState: Record<string, unknown>,
): Promise<LLMIntentResult | null> {
  try {
    const res = await fetch(`${API_BASE}/api/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        experiment_id: experimentId,
        message,
        lab_state: labState,
      }),
      signal: AbortSignal.timeout(10000), // 10s timeout for LLM
    });

    if (!res.ok) return null;

    const data: LLMIntentResult = await res.json();
    return data.llm_used ? data : null;
  } catch {
    // Backend down or timeout — fall back to local engine
    return null;
  }
}
