# Canvas Card Merger

A small, local Obsidian plugin that turns a **Canvas** into a single structured **Markdown note** — one command, no manual copy‑pasting.

Canvas is great for spreading ideas out spatially. But when you want that thinking back as a normal linear note, you end up copying every card by hand. This plugin does it for you.

---

## What it does

Run the command **“Merge canvas to note”** while a canvas is open, and it creates a new note next to it that contains the canvas content as Markdown:

- **Cards** become text blocks, in reading order:
  - if cards are connected by arrows, the order follows the arrows (topological order);
  - otherwise, top‑to‑bottom, then left‑to‑right.
- **Groups** (the boxes you draw around cards) become headings (`##`). Cards inside a group are nested under it, and any headings *inside* a card are pushed down a level so they never outrank the group heading.
- **File/image nodes** become embeds (`![[file]]`); **link nodes** become plain URLs.
- It **never overwrites** an existing note — if `X (merged).md` already exists, it writes `X (merged 2).md`, and so on.

### Example

A canvas with a group “Project” containing a card `# Goal` / `Ship MVP`, a plain card `Details`, an image node, and a link node produces:

```markdown
## Project

### Goal
Ship MVP

Details

![[diagram.png]]

https://obsidian.md
```

---

## Install

This plugin is not (yet) in the community store. Two options:

**Manual**
1. Create a folder `<your vault>/.obsidian/plugins/canvas-card-merger/`.
2. Copy `main.js` and `manifest.json` into it.
3. Reload Obsidian → Settings → Community plugins → enable **Canvas Card Merger**.

**Via BRAT** (Beta Reviewers Auto‑update Tool)
1. Install the BRAT plugin.
2. BRAT → “Add beta plugin” → paste this repository’s URL.

---

## Usage

1. Open a canvas.
2. Command palette (`Ctrl/Cmd+P`) → **Merge canvas to note**.
3. A new `… (merged).md` note appears in the same folder.

---

## What it does NOT do (please read)

This is a v1 of a small tool. Be honest with yourself about its limits:

- **It flattens spatial meaning.** A canvas is non‑linear; a note is linear. Positions, colours, arrow *types*, and the visual layout are **not** preserved beyond the ordering described above. If the spatial arrangement *is* the meaning, the merged note will lose it.
- **It only adds a file.** It never edits or deletes your existing notes or the canvas. The worst it can do is leave extra `(merged)` notes you can delete.
- **No network. No telemetry.** It runs 100% locally and sends nothing anywhere.

## Safety notes

- **Back up your vault before first use**, and try it on a throwaway canvas first.
- **External content is passed through verbatim — images, links, and embedded HTML alike.** If a card contains something like `![x](https://example.com/...)` (or raw `<img>`/`<iframe>` HTML, or CSS with an external `url()`), the merged note keeps it exactly as-is. The plugin does **not** alter or sanitize your content. When you *open* the merged note in reading view, Obsidian fetches any such external reference — exactly as it already does on the canvas itself, so this adds no new exposure. Still, be cautious merging canvases that contain external references you don’t trust.
- **When reporting a bug, desensitise first.** Don’t paste private vault content, full canvas JSON, or screenshots of confidential notes into a public issue.

---

## How ordering is decided (details)

- Within a set of sibling cards: if there are arrows among them, a topological sort is used (A→B means A comes first); cycles fall back to geometric order, and no card is ever dropped.
- Groups and ungrouped nodes at the same level are interleaved by position.
- Nested groups increase the heading level (`##` → `###` → …), capped at `######`.

---

## License

MIT. See `LICENSE`.
