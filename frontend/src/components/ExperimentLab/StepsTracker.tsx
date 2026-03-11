/* ───────────────────────────────────────────────────────
   Smart Lab – Steps Tracker Panel
   Shows experiment progress through steps with full
   instructions, required materials, and next-action hints
   ─────────────────────────────────────────────────────── */

import { useState } from 'react';
import type { ExperimentStep } from '../../types';

interface Props {
  steps: ExperimentStep[];
  currentStep: number;
  completedSteps: number[];
}

export default function StepsTracker({ steps, currentStep, completedSteps }: Props) {
  const [expandedCompleted, setExpandedCompleted] = useState<Set<number>>(new Set());

  const toggleCompleted = (id: number) => {
    setExpandedCompleted(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const completedCount = completedSteps.length;
  const totalSteps = steps.length;
  const progressPct = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;

  return (
    <div className="panel-section steps-tracker">
      {/* Header with progress */}
      <h3>📋 Experiment Steps</h3>
      <div className="steps-progress-bar">
        <div className="steps-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>
      <div className="steps-progress-label">
        {completedCount} of {totalSteps} steps completed
      </div>

      {/* Step list */}
      <div className="steps-list">
        {steps.map((step, i) => {
          const isCompleted = completedSteps.includes(step.id);
          const isActive = i === currentStep && !isCompleted;
          const isUpcoming = i > currentStep && !isCompleted;
          const showDetails = expandedCompleted.has(step.id);

          return (
            <div
              key={step.id}
              className={`step-card ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''} ${isUpcoming ? 'upcoming' : ''}`}
            >
              {/* Connector line */}
              {i < steps.length - 1 && (
                <div className={`step-connector ${isCompleted ? 'completed' : ''}`} />
              )}

              {/* Indicator + title row */}
              <div
                className="step-card-header"
                onClick={() => isCompleted ? toggleCompleted(step.id) : undefined}
                style={{ cursor: isCompleted ? 'pointer' : 'default' }}
              >
                <div className={`step-indicator ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}`}>
                  {isCompleted ? '✓' : step.id}
                </div>
                <div className="step-header-text">
                  <div className={`step-title ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}`}>
                    {step.title}
                  </div>
                  {isCompleted && (
                    <span className="step-expand-hint">{showDetails ? '▾ hide' : '▸ details'}</span>
                  )}
                </div>
              </div>

              {/* Active step — full instructions + required materials + hint */}
              {isActive && (
                <div className="step-active-body">
                  {/* "What to do" box */}
                  <div className="step-next-action-box">
                    <div className="step-next-action-label">👉 What to do now</div>
                    <ol className="step-instructions-list">
                      {step.instructions.map((instr, idx) => (
                        <li key={idx}>{instr}</li>
                      ))}
                    </ol>
                  </div>

                  {/* Required materials */}
                  {step.requiredMaterials.length > 0 && (
                    <div className="step-materials-needed">
                      <span className="step-materials-label">🧪 Materials needed:</span>
                      <div className="step-materials-chips">
                        {step.requiredMaterials.map(matId => (
                          <span key={matId} className="step-mat-chip">{matId}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Chat hint */}
                  <div className="step-chat-hint">
                    💬 Try saying: <em>"{getHintForStep(step)}"</em>
                  </div>
                </div>
              )}

              {/* Completed step — expandable explanation */}
              {isCompleted && showDetails && (
                <div className="step-completed-details">
                  <div className="step-explanation">{step.explanation}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Generate a natural-language chat hint for each step */
function getHintForStep(step: ExperimentStep): string {
  const actions = step.expectedActions;
  if (!actions || actions.length === 0) return 'What should I do next?';

  const first = actions[0];
  if (first.startsWith('ADD_MATERIAL:')) {
    const mat = first.split(':')[1];
    return `Take the ${mat.replace('-', ' ')}`;
  }
  if (first === 'ROLL_LEMON') return 'Roll the lemon';
  if (first.startsWith('INSERT_INTO:')) {
    const parts = first.split(':');
    return `Insert the ${parts[1].replace('-', ' ')} into the ${parts[2].replace('-', ' ')}`;
  }
  if (first.startsWith('CONNECT_WIRE:')) {
    const parts = first.split(':');
    return `Connect ${parts[1].replace('-', ' ')} to ${parts[2].replace('-', ' ')}`;
  }
  if (first === 'COMPLETE_CIRCUIT') return 'Complete the circuit';
  if (first === 'ADD_SERIES_CELL') return 'Add another lemon';
  if (first === 'SHOW_REACTION') return 'Show me the reaction';

  return 'What should I do next?';
}
