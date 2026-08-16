import { GraphNode } from './node';
import { Connection } from './connection';
import { Pin } from './pin';

export interface GraphState {
  nodes: GraphNode[];
  connections: Connection[];
  // Third Graph State collection (ADR-0025). Absent means pin-less — the
  // canonical export omits the key when there are no Pins, and legacy
  // payloads without it import unchanged.
  pins?: Pin[];
}
