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
  // Custom Palette extension (ADR-0037): the Project's own hues alongside
  // the eight curated ones. Absent means no customs — the canonical export
  // omits the key when the list is empty, and legacy payloads without it
  // import unchanged.
  customPalette?: string[];
}
