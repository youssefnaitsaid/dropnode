import { NodeRect } from './node-shape';

export interface Command {
  execute(): void;
  undo(): void;
  description: string;
  /** Optional hook for DOM-measured, center-preserving shape growth. */
  recordAutoResize?(nodeId: string, rect: NodeRect): void;
}
