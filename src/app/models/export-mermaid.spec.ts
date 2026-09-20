import { buildMermaidExport } from './export-mermaid';
import { textFromString } from './text';

const node = (id: string, text: string) => ({
  id,
  text: textFromString(text),
  x: 0,
  y: 0,
  width: 160,
  height: 48,
});

describe('buildMermaidExport', () => {
  it('emits frontmatter title and an empty flowchart for an empty graph', () => {
    expect(buildMermaidExport([], [], 'dropnode-graph')).toBe(
      '---\ntitle: "dropnode-graph"\n---\nflowchart LR\n',
    );
  });

  it('emits flat node definitions in nodes-array order with no grouping', () => {
    const nodes = [
      { id: 'group_1', label: 'Cluster', x: 0, y: 0, width: 320, height: 200, kind: 'group' as const },
      { ...node('node_2', 'Child'), parentId: 'group_1' },
      node('node_3', 'Loose'),
      { ...node('node_4', 'Note'), kind: 'annotation' as const },
      node('node_5', ''),
    ];

    expect(buildMermaidExport(nodes, [], 'My Project')).toBe(
      '---\ntitle: "My Project"\n---\nflowchart LR\nn_node_2["Child"]\nn_node_3["Loose"]\nn_node_4["Note (Text)"]\nn_node_5["(untitled)"]\n',
    );
  });

  it('emits one directed line per Connection in Connection order, with Connection Text as labels', () => {
    const nodes = [node('node_1', 'API'), node('node_2', 'Web'), node('node_3', 'DB')];
    const connections = [
      { id: 'conn_1', sourceNodeId: 'node_1', sourceHandle: 'right' as const, targetNodeId: 'node_2', targetHandle: 'left' as const },
      {
        id: 'conn_2', sourceNodeId: 'node_2', sourceHandle: 'right' as const, targetNodeId: 'node_3', targetHandle: 'left' as const,
        text: textFromString('reads'),
      },
    ];

    expect(buildMermaidExport(nodes, connections, 'dropnode-graph')).toBe(
      '---\ntitle: "dropnode-graph"\n---\nflowchart LR\nn_node_1["API"]\nn_node_2["Web"]\nn_node_3["DB"]\nn_node_1-->n_node_2\nn_node_2-->|reads|n_node_3\n',
    );
  });

  it('flattens Formatting to collapsed text, prefixes Emoji, and sanitizes labels', () => {
    const formatted = {
      ...node('node_1', ''),
      text: [
        { kind: 'paragraph' as const, runs: [{ text: 'Hello', bold: true as const }, { text: ' world', link: 'https://example.com' }] },
        { kind: 'bullets' as const, items: [[{ text: 'second line' }]] },
      ],
      emoji: '🟢',
    };
    const tricky = node('node-9', 'Say "hi" [now] |soon|');
    const long = node('node_10', '1234567890123456789012345678901234567890EXTRA');
    const colliding = node('node_9', 'Other');

    expect(buildMermaidExport([formatted, tricky, long, colliding], [], 'dropnode-graph')).toBe(
      '---\ntitle: "dropnode-graph"\n---\nflowchart LR\nn_node_1["🟢 Hello world second line"]\nn_node_u45_9["Say \'hi\' now soon"]\nn_node_10["1234567890123456789012345678901234567890…"]\nn_node_9["Other"]\n',
    );
  });

  it('pins the title to one quoted line', () => {
    expect(buildMermaidExport([], [], 'Meeting: "notes"\nSecond line')).toBe(
      '---\ntitle: "Meeting: \\"notes\\" Second line"\n---\nflowchart LR\n',
    );
  });
});
