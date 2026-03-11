/* ───────────────────────────────────────────────────────
   Smart Lab – Experiment RAG Knowledge Base
   Self-contained vector-free RAG using keyword matching
   and TF-IDF scoring for experiment-scoped retrieval.
   In production, swap with a real vector DB + embeddings.
   ─────────────────────────────────────────────────────── */

import type { RAGDocument, RAGQueryResult } from '../types';

export class ExperimentRAG {
  private documents: RAGDocument[] = [];
  private tokenIndex: Map<string, Set<string>> = new Map();

  constructor(docs?: RAGDocument[]) {
    if (docs) this.loadDocuments(docs);
  }

  /** Load documents and build inverted index */
  loadDocuments(docs: RAGDocument[]) {
    this.documents = docs;
    this.tokenIndex.clear();
    for (const doc of docs) {
      const tokens = this.tokenize(doc.content + ' ' + doc.title + ' ' + doc.tags.join(' '));
      for (const token of tokens) {
        if (!this.tokenIndex.has(token)) {
          this.tokenIndex.set(token, new Set());
        }
        this.tokenIndex.get(token)!.add(doc.id);
      }
    }
  }

  /** Query the knowledge base */
  query(queryText: string, topK: number = 3): RAGQueryResult[] {
    const queryTokens = this.tokenize(queryText);
    const scores: Map<string, number> = new Map();

    for (const token of queryTokens) {
      const matchingDocs = this.tokenIndex.get(token);
      if (matchingDocs) {
        const idf = Math.log(this.documents.length / matchingDocs.size);
        for (const docId of matchingDocs) {
          scores.set(docId, (scores.get(docId) || 0) + idf);
        }
      }
    }

    // Also do substring matching for multi-word queries
    const queryLower = queryText.toLowerCase();
    for (const doc of this.documents) {
      const contentLower = doc.content.toLowerCase();
      if (contentLower.includes(queryLower)) {
        scores.set(doc.id, (scores.get(doc.id) || 0) + 5);
      }
      // Partial phrase matches
      for (const token of queryTokens) {
        if (token.length > 3 && contentLower.includes(token)) {
          scores.set(doc.id, (scores.get(doc.id) || 0) + 1);
        }
      }
    }

    // Tag boost
    for (const doc of this.documents) {
      const docTagsLower = doc.tags.map(t => t.toLowerCase());
      for (const token of queryTokens) {
        if (docTagsLower.includes(token)) {
          scores.set(doc.id, (scores.get(doc.id) || 0) + 3);
        }
      }
    }

    const results: RAGQueryResult[] = [];
    for (const [docId, score] of scores) {
      const doc = this.documents.find(d => d.id === docId);
      if (doc) {
        results.push({
          document: doc,
          score,
          excerpt: this.extractExcerpt(doc.content, queryTokens),
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /** Get document by ID */
  getDocument(id: string): RAGDocument | undefined {
    return this.documents.find(d => d.id === id);
  }

  /** Get all documents with a specific tag */
  getByTag(tag: string): RAGDocument[] {
    return this.documents.filter(d =>
      d.tags.some(t => t.toLowerCase() === tag.toLowerCase())
    );
  }

  /** Get all documents */
  getAllDocuments(): RAGDocument[] {
    return [...this.documents];
  }

  // ── Private ───────────────────────────────────────────

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);
  }

  private extractExcerpt(content: string, queryTokens: string[]): string {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    let bestSentence = sentences[0] || content.slice(0, 200);
    let bestScore = 0;

    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      let score = 0;
      for (const token of queryTokens) {
        if (lower.includes(token)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestSentence = sentence;
      }
    }

    return bestSentence.trim().slice(0, 300);
  }
}
