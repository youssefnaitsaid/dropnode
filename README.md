# dropnode

A fast, minimal node graph editor for the browser. Create nodes, wire them together with bezier connections, and share entire graphs as JSON — via file, clipboard, or a single URL.

![dropnode editor with a connected node graph](./assets/readme/dropnode-editor.png)

## Features

- **Nodes** — double-click the canvas to create a node, double-click a node to rename it inline. Nodes auto-size to their label.
- **Connections** — drag from any of a node's four handles to another node. Endpoints snap to nearby handles, with a live dashed preview while dragging.
- **Navigation** — pan by dragging the background, zoom with the mouse wheel (centered on the cursor, 0.1×–5×), or use the toolbar controls.
- **Full undo/redo** — every action (create, move, rename, delete, connect) is an undoable command. `Ctrl+Z` / `Ctrl+Shift+Z`.
- **Import & export** — download the graph as pretty-printed JSON, copy it to the clipboard, or import from a file / pasted JSON with validate-then-replace safety.
- **Shareable URLs** — open the app with `?data=<url-encoded JSON>` and the graph loads instantly. The screenshot above was produced exactly this way.
- **Snappy at scale** — designed for graphs of ~200 nodes and ~100 connections with hybrid DOM/SVG rendering and `OnPush` change detection.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- npm 11+

### Install & run

```bash
npm install
npm start
```

Open [http://localhost:4200](http://localhost:4200) in your browser.

### Build for production

```bash
npm run build
```

Build artifacts are emitted to `dist/`.

## Usage

| Action | How |
| --- | --- |
| Create node | Double-click empty canvas |
| Rename node | Double-click node, type, `Enter` to commit / `Esc` to cancel |
| Move node | Drag node (one undo step per drag) |
| Select node | Click node |
| Delete node | Select, then `Delete` or `Backspace` (removes its connections too) |
| Connect nodes | Drag from a handle to another node's handle (snaps within range) |
| Delete connection | Click the connection curve |
| Pan | Drag empty canvas |
| Zoom | Mouse wheel (cursor-centered) or toolbar `+` / `−` |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Deselect | `Esc` |

## Graph JSON format

Exported and imported graphs share one schema — the complete serializable state:

```json
{
  "nodes": [
    { "id": "n1", "label": "Webhook Trigger", "x": 80, "y": 250, "width": 150, "height": 48 }
  ],
  "connections": [
    {
      "id": "c1",
      "sourceNodeId": "n1",
      "sourceHandle": "right",
      "targetNodeId": "n2",
      "targetHandle": "left"
    }
  ]
}
```

Imports are validated before anything is replaced: duplicate node ids, connections referencing missing nodes, or invalid handle values (`top` / `right` / `bottom` / `left`) reject the payload wholesale and leave the current graph untouched.

To share a graph by URL, append it as a query parameter:

```
http://localhost:4200/?data=<url-encoded graph JSON>
```

## Architecture

- **Hybrid rendering** — nodes are DOM Angular components (easy text editing, accessibility); connections are a single SVG overlay (crisp beziers, cheap redraws). Both layers share one CSS `translate + scale` transform for pan/zoom (ADR-0001).
- **Signals as the single source of truth** — all graph state lives in `GraphService` signals; components mutate it only through the service.
- **Command pattern history** — undoable actions are `Command` objects with `execute()` / `undo()`, recorded by `HistoryService` on undo/redo stacks. Transient updates (mid-drag positions, auto-sizing) bypass history so a whole drag is one undo step.
- **Four handles per node** — one connection anchor per edge, positions derived from the node rect (ADR-0002).
- **Performance budget** — `OnPush` change detection on the hot-path components (canvas, node, connection-layer), targeting 200 nodes / ~100 connections (ADR-0003).

```
src/app/
├── components/    # canvas, node, handle, connection-layer, toolbar, import-dialog, toast, app-shell
├── directives/    # keyboard shortcuts
├── models/        # GraphNode, Connection, GraphState, Command, ViewportState
└── services/      # GraphService, HistoryService, commands, URL loader
```

## Testing

Unit tests run on [Vitest](https://vitest.dev/) with jsdom:

```bash
npm test                                # run the suite
npx vitest run --coverage               # with coverage
```

## Tech stack

| | |
| --- | --- |
| Framework | [Angular 22](https://angular.dev/) (standalone components, signals) |
| Styling | [Tailwind CSS 4](https://tailwindcss.com/) |
| UI primitives | [@spartan-ng/brain](https://spartan.ng/) |
| Testing | [Vitest](https://vitest.dev/) + jsdom, Playwright for browser automation |
| Tooling | Angular CLI, Prettier |
