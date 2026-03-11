/* ───────────────────────────────────────────────────────
   Smart Lab – Experiment Selector (Landing Page)
   ─────────────────────────────────────────────────────── */

import type { Experiment } from '../../types';

interface Props {
  experiments: Experiment[];
  onSelect: (exp: Experiment) => void;
}

export default function ExperimentSelector({ experiments, onSelect }: Props) {
  return (
    <div className="experiment-selector">
      <h1>🔬 Smart Lab</h1>
      <p>
        Welcome to Smart Lab — an AI-powered virtual science laboratory!
        Choose an experiment to begin your hands-on learning journey.
      </p>

      <div className="experiment-cards">
        {experiments.map(exp => (
          <div
            key={exp.id}
            className="experiment-card"
            onClick={() => onSelect(exp)}
          >
            <div className="card-emoji">{exp.emoji}</div>
            <h3>{exp.name}</h3>
            <p>{exp.description}</p>
            <span className={`difficulty ${exp.difficulty}`}>
              {exp.difficulty}
            </span>
          </div>
        ))}

        {/* Placeholder cards for future experiments */}
        <div className="experiment-card" style={{ opacity: 0.4, cursor: 'not-allowed' }}>
          <div className="card-emoji">🌋</div>
          <h3>Baking Soda Volcano</h3>
          <p>Coming soon — Acid-base reactions and gas production</p>
          <span className="difficulty beginner">beginner</span>
        </div>

        <div className="experiment-card" style={{ opacity: 0.4, cursor: 'not-allowed' }}>
          <div className="card-emoji">🧲</div>
          <h3>Electromagnet</h3>
          <p>Coming soon — Build an electromagnet from a nail and wire</p>
          <span className="difficulty intermediate">intermediate</span>
        </div>
      </div>
    </div>
  );
}
