# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Anyone diagramming privately: knowledge workers, students, and consultants who
want to sketch flowcharts, system maps, and process diagrams without signing
up, being tracked, or installing anything. They arrive cold (often via a
shared link), work in single sessions, and leave with a URL, a JSON file, or a
PNG. Secondary audience today: the builder's own thinking canvas.

## Product Purpose

Dropnode is a fast, minimal, local-first node graph editor for the browser.
It exists so a person can go from opening a URL to a structured, presentable
node diagram — with zero accounts, zero servers, and zero data collection.
Success: a first-time visitor creates, tidies, and shares or presents a graph
in one sitting without friction, and trusts that their diagram never left
their device unless they chose to send it.

## Positioning

Four claims, held together — each is architectural, not marketing:

1. **Private by architecture** — no account, no backend, no analytics; graphs
   live in the browser's localStorage and leave only via explicit export.
2. **The URL is the product** — an entire graph travels inside one compressed
   link (ADR-0026) that opens instantly, with no signup on either end.
3. **Fast & minimal** — keyboard-first, minimal chrome, snappy at the ~200
   node / ~100 connection budget (ADR-0003).
4. **Diagrams that present** — Tidy up, Present Mode, and themed PNG Export
   turn a working graph into a communication artifact.

## Operating Context

- Single browser session; Scratch Canvas for new arrivals and shared-link
  data; saving creates a Project inside a flat Collection (localStorage).
- Import paths: file upload, pasted JSON, URL `?data=` parameter — all
  validated wholesale before replacing the current graph.
- Export paths: JSON (file/clipboard/link), PNG (whole graph or Export
  Scope, dark/light Export Theme); a Google Drive destination ships disabled.
- Every user action on Graph State is an undoable Command (Ctrl+Z /
  Ctrl+Shift+Z); keyboard-first operation with a Ctrl+K Command Palette.

## Capabilities and Constraints

Confirmed functionality (behavioral truth lives in `dropnode/.facts`; decisions
in `docs/adr/`): Nodes with formatted Text (ProseMirror engine) and Shapes
(rectangle/pill/diamond/ellipse); Connections with Arrowheads, Stroke
Pattern/Weight, Reroute Points, and anchored Text; flat one-level Groups;
the fixed eight-color Palette; multi-element Selection with Marquee;
Align/Distribute; Tidy up layered layout; Minimap; Present Mode (Groups as
Steps); Pins; Projects/Collections; Command Palette; Import/Export as above.

Constraints and durable rules:

- **Local-first is a v1 posture, not a permanent vow** — cross-device sync
  (Google Drive is the hinted vehicle) and/or collaboration are genuinely
  wanted later; real-time multiplayer remains a product pivot to decide, not
  a commitment (see IDEAS drafts).
- The editor is **dark-only**; the token contract in `dropnode/DESIGN.md`
  (enforced by `design-tokens.spec.ts`) governs all on-screen color.
- Palette hexes are product data stored in Graph State — never re-mapped,
  reordered casually, or restyled (ADR-0006).
- Canonical vocabulary (`CONTEXT.md`) binds all user-facing copy: Connection
  not "edge", Handle not "port", Canvas not "board", Palette Entry labels in
  Dropnode terms.
- Import validates the entire payload and rejects it wholesale on any error.

Open decisions (recorded, undecided): sync/collab vehicle and timing; named
local snapshots (draft); QR-code export/import (idea); AI text-to-graph
generation via the Import path (idea).

## Brand Commitments

- Name: **Dropnode** (repo and UI may render it lowercase `dropnode`).
- The blurple-dark identity defined in `dropnode/DESIGN.md` (Discord-derived,
  2026-08 redesign) is the committed visual contract; changing it is a
  deliberate redesign decision, never a side effect.
- The "no data collection" claim is architectural and must stay verifiable
  by the codebase — never weaken it silently.

## Evidence on Hand

- Working product: `dropnode/` (Angular 22 app, test suite on Vitest).
- Behavioral spec: `dropnode/.facts` (atomic, current); 27 ADRs in
  `docs/adr/`.
- Real screenshot for landing/README use: `dropnode/assets/readme/dropnode-editor.png`.
- Backlog with per-idea conflict analysis: `IDEAS.md`, `IN-PROGRESS-IDEAS.md`.
- Absences that must not be fabricated: no customers, testimonials, usage
  analytics, benchmarks, or pricing exist; the product is free and unlaunched.

## Product Principles

1. **Private by architecture.** Every feature must work with no account and
   no server; data leaves the device only when the user exports it.
2. **The graph is the portable artifact.** One URL, JSON file, or PNG carries
   the whole graph — round-trip losslessly through Import.
3. **Nothing between the user and the Canvas.** Minimal chrome, keyboard
   first, one undo step per intent, fast at the 200-node budget.
4. **Built to be shown.** Editing, tidying, presenting, and exporting are one
   continuous story, not separate modes.
5. **The vocabulary is the contract.** Canonical Dropnode terms govern code,
   copy, History descriptions, and Palette Entry labels alike.
