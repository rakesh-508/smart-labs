# ───────────────────────────────────────────────────────
#  Smart Lab – RAG Engine
#  Keyword + TF-IDF based retrieval for experiment
#  knowledge. In production, swap with vector DB.
# ───────────────────────────────────────────────────────

import math
import re
import os
import json
from typing import List, Dict, Any, Optional
from collections import defaultdict


class RAGEngine:
    """Retrieval-Augmented Generation engine for experiment knowledge."""

    def __init__(self):
        self.documents: Dict[str, List[Dict]] = {}  # experiment_id -> docs
        self.token_index: Dict[str, Dict[str, set]] = {}  # experiment_id -> token -> doc_ids
        self._load_all_experiments()

    def _load_all_experiments(self):
        """Load RAG documents from experiment data files."""
        data_dir = os.path.join(os.path.dirname(__file__), "..", "data", "experiments")
        if not os.path.exists(data_dir):
            return

        for fname in os.listdir(data_dir):
            if fname.endswith(".json"):
                filepath = os.path.join(data_dir, fname)
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    exp_id = data.get("id", fname.replace(".json", ""))
                    rag_docs = data.get("rag_documents", [])
                    self.load_documents(exp_id, rag_docs)

    def load_documents(self, experiment_id: str, documents: List[Dict]):
        """Index documents for an experiment."""
        self.documents[experiment_id] = documents
        self.token_index[experiment_id] = {}

        for doc in documents:
            tokens = self._tokenize(
                doc.get("content", "") + " " +
                doc.get("title", "") + " " +
                " ".join(doc.get("tags", []))
            )
            for token in tokens:
                if token not in self.token_index[experiment_id]:
                    self.token_index[experiment_id][token] = set()
                self.token_index[experiment_id][token].add(doc["id"])

    def query(
        self,
        query: str,
        experiment_id: str = "lemon-battery",
        top_k: int = 3,
    ) -> List[Dict[str, Any]]:
        """Query the knowledge base and return ranked results."""
        docs = self.documents.get(experiment_id, [])
        index = self.token_index.get(experiment_id, {})

        if not docs:
            return []

        query_tokens = self._tokenize(query)
        scores: Dict[str, float] = defaultdict(float)

        # TF-IDF scoring
        for token in query_tokens:
            matching = index.get(token, set())
            if matching:
                idf = math.log(len(docs) / len(matching))
                for doc_id in matching:
                    scores[doc_id] += idf

        # Substring match boost
        query_lower = query.lower()
        for doc in docs:
            content_lower = doc.get("content", "").lower()
            if query_lower in content_lower:
                scores[doc["id"]] += 5

            for token in query_tokens:
                if len(token) > 3 and token in content_lower:
                    scores[doc["id"]] += 1

        # Tag boost
        for doc in docs:
            tags_lower = [t.lower() for t in doc.get("tags", [])]
            for token in query_tokens:
                if token in tags_lower:
                    scores[doc["id"]] += 3

        # Build results
        results = []
        for doc_id, score in sorted(scores.items(), key=lambda x: -x[1])[:top_k]:
            doc = next((d for d in docs if d["id"] == doc_id), None)
            if doc:
                results.append({
                    "id": doc["id"],
                    "title": doc.get("title", ""),
                    "content": doc.get("content", ""),
                    "score": round(score, 3),
                    "excerpt": self._extract_excerpt(doc.get("content", ""), query_tokens),
                    "tags": doc.get("tags", []),
                })

        return results

    def get_document(self, experiment_id: str, doc_id: str) -> Optional[Dict]:
        """Get a specific document."""
        docs = self.documents.get(experiment_id, [])
        return next((d for d in docs if d["id"] == doc_id), None)

    def _tokenize(self, text: str) -> List[str]:
        """Simple tokenizer."""
        text = re.sub(r'[^a-zA-Z0-9\s]', ' ', text.lower())
        return [t for t in text.split() if len(t) > 2]

    def _extract_excerpt(self, content: str, query_tokens: List[str]) -> str:
        """Extract the most relevant sentence."""
        sentences = re.split(r'[.!?]+', content)
        best_sentence = sentences[0] if sentences else content[:200]
        best_score = 0

        for sentence in sentences:
            lower = sentence.lower()
            score = sum(1 for t in query_tokens if t in lower)
            if score > best_score:
                best_score = score
                best_sentence = sentence

        return best_sentence.strip()[:300]
