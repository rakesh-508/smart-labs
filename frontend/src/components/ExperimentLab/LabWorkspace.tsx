/* ───────────────────────────────────────────────────────
   Smart Lab – Lab Workspace (Main Experiment View)
   Orchestrates the lab canvas, chat, steps, and metrics
   ─────────────────────────────────────────────────────── */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Experiment, ChatMessage, CircuitState } from '../../types';
import { SimulationState } from '../../engine/SimulationState';
import { LabAgent } from '../../agents/LabAgent';
import LabCanvas from './LabCanvas';
import type { CanvasLabState } from './LabCanvas';
import ChatInterface from './ChatInterface';
import StepsTracker from './StepsTracker';
import MetricsPanel from './MetricsPanel';
import MaterialsPalette from './MaterialsPalette';
import ReactionsPanel from './ReactionsPanel';

interface Props {
  experiment: Experiment;
  onBack: () => void;
}

export default function LabWorkspace({ experiment, onBack }: Props) {
  const simRef = useRef<SimulationState>(new SimulationState());
  const agentRef = useRef<LabAgent>(new LabAgent(experiment, simRef.current));

  const [labState, setLabState] = useState<CanvasLabState>(simRef.current.getLabState());
  const [circuitState, setCircuitState] = useState<CircuitState>(simRef.current.getCircuitState());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Subscribe to simulation state changes
  useEffect(() => {
    const sim = simRef.current;
    const unsubscribe = sim.subscribe(() => {
      setLabState(sim.getLabState());
      setCircuitState(sim.getCircuitState());
    });

    // Send welcome message
    const welcome = agentRef.current.getWelcomeMessage();
    setMessages([welcome]);

    return unsubscribe;
  }, []);

  // Handle student message
  const handleSendMessage = useCallback(async (text: string) => {
    const studentMsg: ChatMessage = {
      id: `student-${Date.now()}`,
      role: 'student',
      content: text,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, studentMsg]);
    setIsProcessing(true);

    try {
      const responses = await agentRef.current.processMessage(text);
      setMessages(prev => [...prev, ...responses]);
      setCurrentStep(agentRef.current.getCurrentStep());
      setCompletedSteps(agentRef.current.getCompletedSteps());
    } catch (err) {
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'agent',
        content: '❌ Something went wrong. Please try again.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // Quick-add material from palette
  const handleAddMaterial = useCallback((materialId: string) => {
    const mat = experiment.materials.find(m => m.id === materialId);
    if (mat) {
      handleSendMessage(`Take the ${mat.name}`);
    }
  }, [experiment, handleSendMessage]);

  const handleReset = useCallback(() => {
    simRef.current.reset();
    const agent = new LabAgent(experiment, simRef.current);
    agentRef.current = agent;
    setMessages([agent.getWelcomeMessage()]);
    setCurrentStep(0);
    setCompletedSteps([]);
  }, [experiment]);

  return (
    <div className="smart-lab">
      {/* Header */}
      <div className="lab-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={onBack}
            style={{
              background: 'none', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', cursor: 'pointer',
              padding: '4px 12px', borderRadius: 6, fontSize: '0.8rem',
            }}
          >
            ← Back
          </button>
          <h1>
            {experiment.emoji} {experiment.name}
            <span className="badge">{experiment.category}</span>
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleReset}
            style={{
              background: 'var(--bg-tertiary)', border: 'none',
              color: 'var(--text-secondary)', cursor: 'pointer',
              padding: '6px 14px', borderRadius: 6, fontSize: '0.8rem',
            }}
          >
            🔄 Reset
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="lab-body">
        {/* Left Panel: Steps + Materials + Metrics */}
        <div className="left-panel">
          <StepsTracker
            steps={experiment.steps}
            currentStep={currentStep}
            completedSteps={completedSteps}
          />
          <MaterialsPalette
            materials={experiment.materials}
            onSelect={handleAddMaterial}
          />
          <MetricsPanel circuitState={circuitState} />
          <ReactionsPanel reactions={experiment.reactions} circuitState={circuitState} />
        </div>

        {/* Center: Lab Canvas */}
        <div className="center-panel">
          <LabCanvas
            labState={labState}
            circuitState={circuitState}
            experiment={experiment}
          />
        </div>

        {/* Right Panel: Chat */}
        <div className="right-panel">
          <ChatInterface
            messages={messages}
            onSend={handleSendMessage}
            isProcessing={isProcessing}
          />
        </div>
      </div>
    </div>
  );
}
