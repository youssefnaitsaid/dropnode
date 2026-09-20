import { GraphNode } from './node';
import { Connection } from './connection';
import { isTextEmpty, textToPlainString } from './text';
import { isTextBlock } from './node';

/** Mermaid-safe node id: identity-derived, never raw Text. Invalid characters
 *  encode as their code point so distinct ids can never collide. */
function safeId(id: string): string {
  return `n_${id.replace(/[^A-Za-z0-9_]/g, char => `_u${char.charCodeAt(0)}_`) || 'untitled'}`;
}

/** Single-line document text: titles and Labels never break the frontmatter. */
function singleLine(value: string, fallback: string): string {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  return collapsed === '' ? fallback : collapsed;
}

/** Flattened Text collapsed to one line; empty renders as untitled. */
function plainCollapsedLine(node: GraphNode): string {
  const plain = node.text ? textToPlainString(node.text) : '';
  const collapsed = plain.replace(/\s+/g, ' ').trim();
  return collapsed === '' ? '(untitled)' : collapsed;
}

/** Diagram label: collapsed Text with Emoji prefixed and Text Blocks badged. */
function displayText(node: GraphNode): string {
  const collapsed = plainCollapsedLine(node);
  const words = collapsed === '(untitled)' ? ['(untitled)'] : [collapsed];
  if (isTextBlock(node)) words.push('(Text)');
  if (node.emoji) words.unshift(node.emoji);
  return words.join(' ');
}

/** Mermaid-unsafe characters break the quoted label or the graph syntax — normalize them away. */
function sanitizeMermaidLabel(value: string): string {
  const quoted = value.replace(/"/g, "'");
  const stripped = quoted.replace(/[[|\]#]/g, '');
  const trimmed = stripped.trim();
  if (trimmed === '') return '(untitled)';
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
}

/** Mermaid Export payload: YAML frontmatter title plus a flat left-to-right
 *  flowchart — one node definition per Node, one directed line per
 *  Connection. Whole-graph and lossy; Groups contribute no structure. */
export function buildMermaidExport(
  nodes: readonly GraphNode[],
  connections: readonly Connection[] = [],
  title = 'dropnode-graph',
): string {
  const lines: string[] = [
    '---',
    `title: ${JSON.stringify(singleLine(title, 'dropnode-graph'))}`,
    '---',
    'flowchart LR',
  ];
  for (const node of nodes) {
    if (node.kind === 'group') continue;
    lines.push(`${safeId(node.id)}["${sanitizeMermaidLabel(displayText(node))}"]`);
  }
  // Groups export no definition, so a Connection touching a Group would point
  // at an undefined node — drop it, the both-endpoints-inside rule.
  const groupIds = new Set(nodes.filter(node => node.kind === 'group').map(node => node.id));
  for (const connection of connections) {
    if (groupIds.has(connection.sourceNodeId) || groupIds.has(connection.targetNodeId)) continue;
    const from = safeId(connection.sourceNodeId);
    const to = safeId(connection.targetNodeId);
    if (connection.text && !isTextEmpty(connection.text)) {
      const label = sanitizeMermaidLabel(textToPlainString(connection.text));
      lines.push(label === '(untitled)' ? `${from}-->${to}` : `${from}-->|${label}|${to}`);
    } else {
      lines.push(`${from}-->${to}`);
    }
  }
  return lines.join('\n') + '\n';
}
