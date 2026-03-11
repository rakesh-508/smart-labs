/* ───────────────────────────────────────────────────────
   Smart Lab – Lab Agent
   NLP-powered agent that interprets student commands,
   queries the RAG, performs actions on the simulation,
   and provides educational explanations.

   Intent resolution order:
   1. Backend LLM (Gemini + RAG) via /api/intent
   2. Local IntentEngine (scoring-based fuzzy NLP)
   3. RAG-only answer (knowledge retrieval)
   ─────────────────────────────────────────────────────── */

import type {
  ChatMessage,
  AgentAction,
  AgentActionType,
  Experiment,
  MessageAttachment,
} from '../types';
import { ExperimentRAG } from '../rag/ExperimentRAG';
import { SimulationState } from '../engine/SimulationState';
import { ChemistryEngine } from '../engine/ChemistryEngine';
import { IntentEngine, type ScoredIntent } from './IntentEngine';
import { classifyIntent, type LLMIntentResult } from './BackendAPI';

let msgCounter = 0;

type ParsedIntent = ScoredIntent;

export class LabAgent {
  private rag: ExperimentRAG;
  private sim: SimulationState;
  private experiment: Experiment;
  private intentEngine: IntentEngine;
  private currentStep: number = 0;
  private completedSteps: Set<number> = new Set();

  constructor(experiment: Experiment, sim: SimulationState) {
    this.experiment = experiment;
    this.sim = sim;
    this.rag = new ExperimentRAG(experiment.ragDocuments);
    this.intentEngine = new IntentEngine(this.rag, this.sim);
  }

  /** Process a student message and return agent response(s) */
  async processMessage(studentMessage: string): Promise<ChatMessage[]> {
    const responses: ChatMessage[] = [];

    // ── 1. Try backend LLM (Gemini + RAG) ──────────────
    const llmResult = await this.tryLLMClassify(studentMessage);

    let intents: ParsedIntent[];

    if (llmResult) {
      // LLM returned a high-confidence action
      intents = [{
        action: llmResult.action as AgentActionType | 'REMOVE_MATERIAL',
        targets: llmResult.targets,
        quantity: llmResult.quantity,
        score: llmResult.confidence * 100,
        raw: studentMessage,
      }];
    } else {
      // ── 2. Fall back to local IntentEngine ───────────
      intents = this.parseIntents(studentMessage);
    }

    if (intents.length === 0) {
      // ── 3. No action intent — treat as a question → RAG
      const ragResults = this.rag.query(studentMessage, 3);
      let answer = '';

      if (ragResults.length > 0) {
        answer = this.generateAnswer(studentMessage, ragResults.map(r => r.document.content));
      } else {
        answer = "I'm not sure about that. Could you rephrase your question, or ask about a specific material or step in the experiment?";
      }

      responses.push(this.createMessage('agent', answer));
      return responses;
    }

    // Process each intent
    for (const intent of intents) {
      const result = await this.executeIntent(intent);
      responses.push(...result);
    }

    // After every action, dynamically recompute step progress
    this.recalcStepProgress(responses);

    return responses;
  }

  /** Try the backend Gemini LLM for intent classification */
  private async tryLLMClassify(message: string): Promise<LLMIntentResult | null> {
    try {
      const labState = this.sim.getLabState();
      const result = await classifyIntent(
        message,
        this.experiment.id,
        labState as unknown as Record<string, unknown>,
      );

      // Only trust LLM if confidence ≥ 0.6
      if (result && result.action && result.confidence >= 0.6) {
        console.log(
          `[LLM] Action: ${result.action} | Targets: [${result.targets}] | ` +
          `Confidence: ${(result.confidence * 100).toFixed(0)}% | ${result.reasoning}`,
        );
        return result;
      }
      return null;
    } catch {
      // Backend unreachable — silently fall back
      return null;
    }
  }

  /** Provide a welcome message */
  getWelcomeMessage(): ChatMessage {
    return this.createMessage(
      'agent',
      `🔬 Welcome to the **${this.experiment.name}** experiment!\n\n` +
      `${this.experiment.description}\n\n` +
      `**Materials available:**\n` +
      this.experiment.materials.map(m => `  ${m.emoji} ${m.name}`).join('\n') +
      `\n\n**How to interact:**\n` +
      `• Say "take a lemon" or "get the lemon" to add materials\n` +
      `• Say "roll the lemon" to perform actions\n` +
      `• Say "insert the nail into the lemon" to combine materials\n` +
      `• Say "connect the LED" to wire things up\n` +
      `• Say "add another lemon" for more voltage\n` +
      `• Say "remove a lemon" to take one away\n` +
      `• Ask any question like "what is oxidation?" and I'll explain!\n\n` +
      `Let's start with **Step 1: ${this.experiment.steps[0].title}** 🚀`,
      undefined,
      [{
        type: 'data',
        label: 'Experiment Info',
        content: JSON.stringify({
          difficulty: this.experiment.difficulty,
          steps: this.experiment.steps.length,
          materials: this.experiment.materials.length,
        }),
      }]
    );
  }

  // ── Intent Parsing (Smart NLP Engine) ───────────────
  // Delegates to IntentEngine for scoring-based fuzzy
  // matching with RAG context and synonym expansion.

  private parseIntents(text: string): ParsedIntent[] {
    return this.intentEngine.parse(text);
  }

  // ── Intent Execution ────────────────────────────────

  private async executeIntent(intent: ParsedIntent): Promise<ChatMessage[]> {
    const messages: ChatMessage[] = [];

    switch (intent.action) {
      case 'ADD_MATERIAL': {
        const materialDef = this.experiment.materials.find(m => m.id === intent.targets[0]);
        if (!materialDef) {
          messages.push(this.createMessage('agent', `I couldn't find that material. Available materials: ${this.experiment.materials.map(m => m.name).join(', ')}`));
          break;
        }

        const matId = intent.targets[0];

        // High-level actions based on material type
        if (matId === 'lemon') {
          const result = this.sim.addLemon();
          messages.push(this.createMessage('agent', result.message, {
            type: 'ADD_MATERIAL',
            payload: { materialId: matId },
            description: `Added lemon`,
          }));
        } else if (matId === 'zinc-nail') {
          this.sim.setHasNail(true);
          const ragResults = this.rag.query('zinc galvanized nail electrode', 1);
          messages.push(this.createMessage(
            'agent',
            `🔩 **Galvanized Nail** added to the workspace!\n\n` +
            `• **Metal**: Zinc-coated iron\n` +
            `• **Role**: Anode (negative electrode)\n` +
            `• **Reaction**: Zn → Zn²⁺ + 2e⁻\n\n` +
            `📖 ${ragResults[0]?.excerpt || 'The zinc coating dissolves in acid, releasing electrons.'}`,
            { type: 'ADD_MATERIAL', payload: { materialId: matId }, description: 'Added zinc nail' }
          ));
        } else if (matId === 'copper-wire') {
          this.sim.setHasCopper(true);
          const ragResults = this.rag.query('copper electrode cathode reduction', 1);
          messages.push(this.createMessage(
            'agent',
            `🔶 **Copper Wire** added to the workspace!\n\n` +
            `• **Metal**: Pure copper (Cu)\n` +
            `• **Role**: Cathode (positive electrode)\n` +
            `• **Reaction**: 2H⁺ + 2e⁻ → H₂\n\n` +
            `📖 ${ragResults[0]?.excerpt || 'Copper acts as the cathode where hydrogen ions gain electrons.'}`,
            { type: 'ADD_MATERIAL', payload: { materialId: matId }, description: 'Added copper wire' }
          ));
        } else if (matId === 'led') {
          this.sim.setHasLED(true);
          messages.push(this.createMessage(
            'agent',
            `💡 **LED Light** added to the workspace!\n\n` +
            `• **Forward Voltage**: ~1.8V (red LED)\n` +
            `• **Max Current**: 20mA\n` +
            `• You'll need enough voltage to light it — a single lemon produces ~0.9V.\n` +
            `• Try saying "connect the LED" once electrodes are inserted!`,
            { type: 'ADD_MATERIAL', payload: { materialId: matId }, description: 'Added LED' }
          ));
        } else {
          // Generic material add
          this.sim.addMaterial(materialDef);
          const propsText = materialDef.properties
            .map(p => `  • **${p.name}**: ${p.value} ${p.unit}`)
            .join('\n');
          messages.push(this.createMessage(
            'agent',
            `${materialDef.emoji} **${materialDef.name}** added to the workspace!\n\n**Properties:**\n${propsText}`,
            { type: 'ADD_MATERIAL', payload: { materialId: matId }, description: `Added ${materialDef.name}` }
          ));
        }
        break;
      }

      case 'REMOVE_MATERIAL': {
        const matId = intent.targets[0];
        if (matId === 'lemon') {
          const result = this.sim.removeLemon();
          messages.push(this.createMessage('agent', result.message, {
            type: 'ADD_MATERIAL',
            payload: { materialId: matId },
            description: 'Removed lemon',
          }));
        } else {
          messages.push(this.createMessage('agent', `Removing ${matId} is not supported yet. Try removing a lemon.`));
        }
        break;
      }

      case 'ROLL_LEMON': {
        const result = this.sim.rollLemon();
        const ragResults = this.rag.query('rolling lemon vesicles conductivity', 1);

        messages.push(this.createMessage(
          'agent',
          `${result.message}\n\n` +
          `📖 **Why we roll:** ${ragResults[0]?.excerpt || 'Rolling breaks juice vesicles, releasing more electrolyte.'}`,
          { type: 'ROLL_LEMON', payload: {}, description: 'Rolling the lemon' }
        ));
        break;
      }

      case 'INSERT_INTO': {
        const materialType = intent.targets[0];
        const hostType = intent.targets[1];

        if (hostType !== 'lemon') {
          messages.push(this.createMessage('agent', `You can only insert electrodes into a lemon!`));
          break;
        }

        if (materialType === 'zinc-nail') {
          const result = this.sim.insertNail();
          if (!result.success) {
            messages.push(this.createMessage('agent', result.message));
          } else {
            const ragResults = this.rag.query('inserting zinc electrode technique', 1);
            messages.push(this.createMessage(
              'agent',
              `${result.message}\n\n📖 ${ragResults[0]?.excerpt || ''}`,
              { type: 'INSERT_INTO', payload: { material: materialType, host: hostType }, description: `Inserted nail into lemon` }
            ));
          }
        } else if (materialType === 'copper-wire') {
          const result = this.sim.insertCopper();
          if (!result.success) {
            messages.push(this.createMessage('agent', result.message));
          } else {
            const ragResults = this.rag.query('inserting copper electrode technique', 1);
            messages.push(this.createMessage(
              'agent',
              `${result.message}\n\n📖 ${ragResults[0]?.excerpt || ''}`,
              { type: 'INSERT_INTO', payload: { material: materialType, host: hostType }, description: `Inserted copper into lemon` }
            ));
          }
        } else {
          messages.push(this.createMessage('agent', `Cannot insert ${materialType} into ${hostType}.`));
        }
        break;
      }

      case 'CONNECT_WIRE': {
        const target = intent.targets[0];

        // "connect the LED" — connects LED to the circuit
        if (target === 'led' || intent.targets.includes('led')) {
          const result = this.sim.connectLED();
          if (!result.success) {
            messages.push(this.createMessage('agent', result.message));
          } else {
            messages.push(this.createMessage(
              'agent',
              result.message,
              { type: 'CONNECT_WIRE', payload: {}, description: 'Connected LED to circuit' },
              [{
                type: 'data',
                label: 'Circuit Metrics',
                content: JSON.stringify(this.sim.getCircuitState()),
              }]
            ));
          }
          break;
        }

        // Generic connect — try to connect LED if we have one
        const labState = this.sim.getLabState();
        if (labState.hasLED && !labState.ledConnected && labState.nailInserted && labState.copperInserted) {
          const result = this.sim.connectLED();
          messages.push(this.createMessage('agent', result.message, {
            type: 'CONNECT_WIRE', payload: {}, description: 'Connected LED'
          }));
        } else {
          messages.push(this.createMessage('agent',
            `🔌 Make sure you have both electrodes inserted and an LED on the workspace. Then say "connect the LED".`
          ));
        }
        break;
      }

      case 'COMPLETE_CIRCUIT': {
        // Try connecting LED first if it's not connected
        const labState = this.sim.getLabState();
        if (labState.hasLED && !labState.ledConnected) {
          this.sim.connectLED();
        }
        const result = this.sim.completeCircuit();
        const attachments: MessageAttachment[] = [{
          type: 'data',
          label: 'Circuit Metrics',
          content: JSON.stringify(result.circuitState),
        }];

        if (result.success) {
          const reactions = ChemistryEngine.getLemonBatteryReactions();
          const reactionText = reactions.map(r =>
            `**${r.type.toUpperCase()}**: ${r.equation}\n  _${r.description}_`
          ).join('\n\n');

          messages.push(this.createMessage(
            'agent',
            `${result.message}\n\n**⚗️ Chemical Reactions:**\n${reactionText}`,
            { type: 'COMPLETE_CIRCUIT', payload: { circuitState: result.circuitState }, description: 'Circuit completed' },
            attachments
          ));
        } else {
          messages.push(this.createMessage('agent', result.message));
        }
        break;
      }

      case 'ADD_SERIES_CELL': {
        const result = this.sim.addSeriesCell();
        messages.push(this.createMessage(
          'agent',
          result.message,
          {
            type: 'ADD_SERIES_CELL',
            payload: { cellCount: this.sim.getCells().length },
            description: 'Added lemon cell in series',
          },
          [{
            type: 'data',
            label: 'Updated Circuit',
            content: JSON.stringify(this.sim.getCircuitState()),
          }]
        ));
        break;
      }

      case 'SHOW_REACTION': {
        const reactions = ChemistryEngine.getLemonBatteryReactions();
        const reactionText = reactions.map(r => {
          const emoji = r.type === 'oxidation' ? '🔴' : r.type === 'reduction' ? '🔵' : '🟢';
          return `${emoji} **${r.type.charAt(0).toUpperCase() + r.type.slice(1)}**:\n` +
            `  \`${r.equation}\`\n` +
            `  ${r.description}\n` +
            `  ΔG = ${r.deltaG?.toFixed(1)} kJ/mol`;
        }).join('\n\n');

        messages.push(this.createMessage(
          'agent',
          `**⚗️ Lemon Battery Chemical Reactions:**\n\n${reactionText}\n\n` +
          `**Key concept:** Electrons flow from zinc (where they are released) through the external wire to copper (where hydrogen ions pick them up). This electron flow IS the electric current!`,
          {
            type: 'SHOW_REACTION',
            payload: { reactions },
            description: 'Showing chemical reactions',
          },
          [{
            type: 'formula',
            label: 'Cell EMF',
            content: 'E°cell = E°cathode - E°anode = 0.00V - (-0.76V) = +0.76V (practical: ~1.0-1.1V)',
          }]
        ));
        break;
      }

      case 'CALCULATE': {
        const cs = this.sim.getCircuitState();
        const cells = this.sim.getCells();

        if (cells.length === 0) {
          messages.push(this.createMessage('agent',
            "No circuit has been built yet! Complete the experiment first, then I can show you the calculations."
          ));
          break;
        }

        let calcText = `**📊 Circuit Calculations:**\n\n`;
        calcText += `| Metric | Value |\n|--------|-------|\n`;
        calcText += `| Cell Count | ${cells.length} |\n`;
        calcText += `| Total EMF | ${cs.totalVoltage.toFixed(4)} V |\n`;
        calcText += `| Current | ${(cs.current * 1000).toFixed(4)} mA |\n`;
        calcText += `| Total Resistance | ${cs.resistance.toFixed(1)} Ω |\n`;
        calcText += `| Power | ${(cs.power * 1000).toFixed(4)} mW |\n`;
        calcText += `| LED Brightness | ${(cs.ledBrightness * 100).toFixed(1)}% |\n\n`;

        // Runtime calculation
        if (cells.length > 0) {
          const runtime = ChemistryEngine.calculateRuntime(cells[0], cs.current);
          calcText += `**⏱️ Theoretical Runtime:** ${ChemistryEngine.formatRuntime(runtime)}\n`;
          calcText += `_(Based on Faraday's law: t = mₐnF/MI)_`;
        }

        messages.push(this.createMessage('agent', calcText, {
          type: 'CALCULATE',
          payload: { circuitState: cs },
          description: 'Circuit calculations',
        }));
        break;
      }

      case 'REVERSE_LED': {
        const result = this.sim.reverseLEDPolarity();
        const ragResults = this.rag.query('LED polarity anode cathode forward bias reverse', 2);
        const ragExcerpt = ragResults[0]?.excerpt || 'LEDs are polarity-sensitive diodes that only conduct in one direction.';

        messages.push(this.createMessage(
          'agent',
          `${result.message}\n\n📖 **Science note:** ${ragExcerpt}`,
          {
            type: 'REVERSE_LED' as AgentActionType,
            payload: { reversed: this.sim.getLabState().ledReversed },
            description: 'Reversed LED polarity',
          },
        ));
        break;
      }

      default:
        messages.push(this.createMessage('agent',
          "I'm not sure what you want me to do. Try saying things like:\n" +
          "• 'Take a lemon'\n• 'Roll the lemon'\n• 'Insert the nail into the lemon'\n• 'Connect the LED'\n• 'Add another lemon'\n• 'Remove a lemon'\n• 'Reverse the LED polarity'"
        ));
    }

    return messages;
  }

  // ── Dynamic Step Tracking ───────────────────────────
  // Recalculates step progress based on actual lab state

  private recalcStepProgress(messages: ChatMessage[]) {
    const ls = this.sim.getLabState();
    const cs = this.sim.getCircuitState();

    // Determine which steps are now complete based on actual state
    const stepChecks: Record<number, boolean> = {
      1: ls.lemons > 0,                              // Prepare lemon
      2: ls.nailInserted && ls.copperInserted,        // Insert metals
      3: ls.hasLED && ls.ledConnected,                // Connect LED / wires
      4: cs.isComplete,                                // Complete circuit
      5: cs.isComplete && cs.ledBrightness > 0,       // Observe LED
    };

    let newCompletions = false;

    for (const [stepIdStr, isComplete] of Object.entries(stepChecks)) {
      const stepId = parseInt(stepIdStr);
      const step = this.experiment.steps.find(s => s.id === stepId);
      if (!step) continue;

      if (isComplete && !this.completedSteps.has(stepId)) {
        this.completedSteps.add(stepId);
        step.completed = true;
        newCompletions = true;

        messages.push(this.createMessage(
          'system',
          `✅ **Step ${step.id} Complete: ${step.title}**\n\n📖 ${step.explanation}`,
          { type: 'STEP_COMPLETE', payload: { stepId: step.id }, description: `Step ${step.id} completed` }
        ));
      } else if (!isComplete && this.completedSteps.has(stepId)) {
        // Step was un-done (e.g., removed lemon)
        this.completedSteps.delete(stepId);
        step.completed = false;
      }
    }

    // Update current step to the highest incomplete step
    let highest = 0;
    for (let i = 0; i < this.experiment.steps.length; i++) {
      if (this.completedSteps.has(this.experiment.steps[i].id)) {
        highest = i + 1;
      } else {
        break;
      }
    }
    this.currentStep = Math.min(highest, this.experiment.steps.length - 1);

    // Only show "next step" hint if we just completed something new
    if (newCompletions && this.currentStep < this.experiment.steps.length) {
      const allDone = this.completedSteps.size >= this.experiment.steps.length;
      if (allDone) {
        messages.push(this.createMessage(
          'agent',
          `🎉 **Congratulations!** You've completed the ${this.experiment.name} experiment!\n\n` +
          `You can now:\n• Add more lemons to increase voltage\n• Remove lemons to see the effect\n` +
          `• Ask about the chemistry behind the reaction\n• Calculate circuit metrics\n• Try different configurations!`
        ));
      } else {
        const nextStep = this.experiment.steps[this.currentStep];
        if (nextStep && !this.completedSteps.has(nextStep.id)) {
          messages.push(this.createMessage(
            'agent',
            `\n➡️ **Next: Step ${nextStep.id} — ${nextStep.title}**\n` +
            nextStep.instructions.map(i => `  • ${i}`).join('\n')
          ));
        }
      }
    }
  }

  // ── Answer Generation ──────────────────────────────

  private generateAnswer(question: string, contexts: string[]): string {
    const contextStr = contexts.join('\n\n');
    const lower = question.toLowerCase();

    if (lower.includes('what') && lower.includes('happen')) {
      return `Based on the experiment knowledge:\n\n${contextStr.slice(0, 500)}`;
    }
    if (lower.includes('why')) {
      return `Great question! Here's the explanation:\n\n${contextStr.slice(0, 500)}`;
    }
    if (lower.includes('how')) {
      return `Here's how it works:\n\n${contextStr.slice(0, 500)}`;
    }

    return `📖 Here's what I found:\n\n${contextStr.slice(0, 600)}`;
  }

  // ── Helpers ─────────────────────────────────────────

  private createMessage(
    role: 'student' | 'agent' | 'system',
    content: string,
    action?: AgentAction,
    attachments?: MessageAttachment[]
  ): ChatMessage {
    return {
      id: `msg-${++msgCounter}`,
      role,
      content,
      timestamp: new Date(),
      action,
      attachments,
    };
  }

  getCurrentStep(): number {
    return this.currentStep;
  }

  getCompletedSteps(): number[] {
    return [...this.completedSteps];
  }
}
