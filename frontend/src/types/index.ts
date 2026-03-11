/* ───────────────────────────────────────────────────────
   Smart Lab – Core Type Definitions
   ─────────────────────────────────────────────────────── */

// ── Material / Ingredient ───────────────────────────────
export interface MaterialProperty {
  name: string;
  value: number | string;
  unit: string;
  description: string;
}

export interface Material {
  id: string;
  name: string;
  emoji: string;
  category: 'organic' | 'metal' | 'electrical' | 'tool' | 'other';
  description: string;
  properties: MaterialProperty[];
  // visual
  color: string;
  secondaryColor?: string;
  shape: 'ellipse' | 'rect' | 'line' | 'custom';
  width: number;   // px for SVG
  height: number;
  svgPath?: string; // custom SVG path data
}

// ── Placed item on the workspace ────────────────────────
export interface PlacedMaterial extends Material {
  instanceId: string;
  x: number;
  y: number;
  rotation: number;
  state: MaterialState;
  insertedInto?: string; // instanceId of host (e.g. lemon)
  connectedTo?: string[];
  animationClass?: string;
}

export type MaterialState =
  | 'idle'
  | 'rolling'
  | 'inserted'
  | 'connected'
  | 'reacting'
  | 'glowing'
  | 'depleted';

// ── Chemistry / Physics ─────────────────────────────────
export interface ElectrodeData {
  material: string;
  standardPotential: number; // volts
  massGrams: number;
  molarMass: number;
  electronsTransferred: number;
}

export interface ElectrolyteData {
  name: string;
  concentration: number; // mol/L
  pH: number;
  conductivity: number; // S/m
  volume: number; // mL
}

export interface CircuitState {
  isComplete: boolean;
  totalVoltage: number;  // V
  current: number;       // A
  resistance: number;    // Ohm
  power: number;         // W
  ledBrightness: number; // 0-1
  cells: CellData[];
}

export interface CellData {
  anode: ElectrodeData;
  cathode: ElectrodeData;
  electrolyte: ElectrolyteData;
  cellVoltage: number;
  cellCurrent: number;
}

export interface ReactionStep {
  equation: string;
  description: string;
  type: 'oxidation' | 'reduction' | 'overall';
  deltaG?: number; // Gibbs free energy kJ/mol
}

// ── Experiment ──────────────────────────────────────────
export interface ExperimentStep {
  id: number;
  title: string;
  instructions: string[];
  requiredMaterials: string[]; // material ids
  expectedActions: string[];
  explanation: string;
  completed: boolean;
}

export interface Experiment {
  id: string;
  name: string;
  emoji: string;
  description: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  materials: Material[];
  steps: ExperimentStep[];
  reactions: ReactionStep[];
  ragDocuments: RAGDocument[];
  scientificBackground: string;
}

// ── RAG ─────────────────────────────────────────────────
export interface RAGDocument {
  id: string;
  title: string;
  content: string;
  metadata: Record<string, string | number>;
  embedding?: number[];
  tags: string[];
}

export interface RAGQueryResult {
  document: RAGDocument;
  score: number;
  excerpt: string;
}

// ── Chat / Agent ────────────────────────────────────────
export interface ChatMessage {
  id: string;
  role: 'student' | 'agent' | 'system';
  content: string;
  timestamp: Date;
  action?: AgentAction;
  attachments?: MessageAttachment[];
}

export interface MessageAttachment {
  type: 'image' | 'data' | 'formula' | 'metric';
  content: string;
  label: string;
}

export interface AgentAction {
  type: AgentActionType;
  payload: Record<string, any>;
  description: string;
}

export type AgentActionType =
  | 'ADD_MATERIAL'
  | 'REMOVE_MATERIAL'
  | 'MOVE_MATERIAL'
  | 'INSERT_INTO'
  | 'CONNECT_WIRE'
  | 'ANIMATE'
  | 'ROLL_LEMON'
  | 'COMPLETE_CIRCUIT'
  | 'CALCULATE'
  | 'SHOW_REACTION'
  | 'ADD_SERIES_CELL'
  | 'REVERSE_LED'
  | 'EXPLAIN'
  | 'STEP_COMPLETE';

// ── Lab Session State ───────────────────────────────────
export interface LabSession {
  experimentId: string;
  placedMaterials: PlacedMaterial[];
  circuitState: CircuitState;
  currentStep: number;
  completedSteps: number[];
  chatHistory: ChatMessage[];
  metrics: MetricSnapshot[];
  startTime: Date;
}

export interface MetricSnapshot {
  timestamp: Date;
  voltage: number;
  current: number;
  resistance: number;
  ledBrightness: number;
  cellCount: number;
  notes: string;
}
