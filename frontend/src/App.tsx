/* ───────────────────────────────────────────────────────
   Smart Lab – Main App Component
   ─────────────────────────────────────────────────────── */

import { useState } from 'react';
import ExperimentSelector from './components/ExperimentSelector/ExperimentSelector';
import LabWorkspace from './components/ExperimentLab/LabWorkspace';
import { LEMON_BATTERY_EXPERIMENT } from './data/experiments/lemon-battery';
import type { Experiment } from './types';

const EXPERIMENTS: Experiment[] = [LEMON_BATTERY_EXPERIMENT];

export default function App() {
  const [selectedExperiment, setSelectedExperiment] = useState<Experiment | null>(null);

  if (!selectedExperiment) {
    return (
      <ExperimentSelector
        experiments={EXPERIMENTS}
        onSelect={setSelectedExperiment}
      />
    );
  }

  return (
    <LabWorkspace
      experiment={selectedExperiment}
      onBack={() => setSelectedExperiment(null)}
    />
  );
}
