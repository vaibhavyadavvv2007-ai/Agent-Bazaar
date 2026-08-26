---
name: The Agent Bazaar Gazette
description: The official record of autonomous spending — agent commerce as a live government gazette
colors:
  paper: "#f4eeda"
  paper-deep: "#ece4cb"
  paper-edge: "#d8cdb0"
  inner-page: "#faf6ea"
  ink: "#1c1a17"
  ink-soft: "#57503f"
  ink-faint: "#6f6552"
  seal: "#b3282d"
  seal-soft: "#c9564f"
  thread: "#b98a2f"
  rule-blue: "#2c4a7c"
  henna: "#1f6f43"
typography:
  masthead:
    fontFamily: "Spectral, Georgia, serif"
    fontWeight: 700
    letterSpacing: "0.04em"
    textTransform: "uppercase"
  body:
    fontFamily: "Spectral, Georgia, serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  clause:
    fontFamily: "Courier Prime, Courier New, monospace"
    fontSize: "11px"
    fontWeight: 400
  clause-lg:
    fontFamily: "Courier Prime, Courier New, monospace"
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: "Courier Prime, Courier New, monospace"
    fontSize: "11px"
    fontWeight: 400
    letterSpacing: "0.14em"
    textTransform: "uppercase"
  fig:
    fontFamily: "Courier Prime, Courier New, monospace"
    fontSize: "10.5px"
    fontWeight: 400
    lineHeight: 1.3
  digits:
    fontFamily: "Courier Prime, Courier New, monospace"
    fontWeight: 700
    letterSpacing: "0.06em"
    fontVariantNumeric: "tabular-nums"
rounded:
  sharp: "0px"
  seal: "3px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "20px"
components:
  rule-box:
    backgroundColor: "#faf6ea"
    textColor: "{colors.ink}"
    rounded: "{rounded.sharp}"
    padding: "16px"
  seal-approved:
    backgroundColor: "transparent"
    textColor: "{colors.henna}"
    rounded: "{rounded.seal}"
  seal-denied:
    backgroundColor: "transparent"
    textColor: "{colors.seal}"
    rounded: "{rounded.seal}"
  summons-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sharp}"
---

# Design System: The Agent Bazaar Gazette

## Overview

**Creative North Star: "The Gazette of Autonomous Spending"**

This system renders live AI-agent commerce as an official government gazette: aged paper, ink, seal red, security-thread gold. Every money action is *published* — a numbered notification, clause-set in typewriter serials, sealed with a rubber stamp. The category default it refuses is the dark neon operations dashboard. The paper is picked from the use scene: a record read at a desk, under office light, printed on paper that has aged slightly.

Density is high (a gazette is dense by nature), variance is low (official print is symmetric and ruled), and motion is restrained to the world's own physics: paper prints, seals thunk, digits roll, a bell swings when a human is summoned.

**Key Characteristics:**
- Everything is ink on paper; color is reserved for authority marks (seal red, thread gold, rule blue, henna green).
- Status is stamped, never pill-ed: seals carry a word, rotated slightly, in Courier Prime.
- The permanent record is visible before anything live happens (notifications seed from the ledger on load).

## Colors

One paper family, one ink family, four authority accents used sparingly.

### Primary
- **Seal Red** (#b3282d): the authority color. Rubber stamps, the Summons card border, prices on stalls, the caret. If seal red appears on a screen more than ~10% of its area, the page has stopped being a gazette.

### Secondary
- **Security-Thread Gold** (#b98a2f): the anti-forgery band above and below the Notifications column, and the "summonses answered" tile. Decorative only in the thread; never for text below 11px.

### Tertiary
- **Ledger-Rule Blue** (#2c4a7c): links and filing references, always underlined. Never for buttons.
- **Henna Green** (#1f6f43): approval ink. ALLOWED / IN FORCE / captured states, always as a stamped word.

### Neutral
- **Gazette Paper** (#f4eeda): the page ground, with a faint two-direction weave.
- **Inner Page** (#faf6ea): rule-box and clause-card fills.
- **Folded Paper** (#ece4cb) and **Rule Edge** (#d8cdb0): inner fills and hairlines.
- **Ink** (#1c1a17): primary text and all line-art strokes.
- **Ink Soft** (#57503f): secondary text, ≥4.5:1 on paper.
- **Ink Faint** (#6f6552): marginal Fig. annotations, 10.5px Courier Prime.

### Named Rules
**The Published-Record Rule.** Nothing is rendered as live state that is not also in the ledger; the Notifications column seeds from the append-only record on load.
**The Ink-and-Seal Rule.** Status is a stamped word (SEALED, REFUSED, IN FORCE), never a colored pill; seals pair word with color so status never rides color alone.

## Typography

**Display/Masthead Font:** Spectral (700, uppercase, +0.04em tracking)
**Body Font:** Spectral (400/500)
**Serial Font:** Courier Prime (400/700) with tabular numerals

**Character:** an official print publication set on a bookish serif, with typewriter serials for anything the ledger produced — hashes, clause numbers, amounts, timestamps.

### Hierarchy
- **Masthead** (700, text-4xl→5xl, uppercase): the gazette name only, once per page.
- **Section head** (700, 13–14px, uppercase, +0.08em): NOTIFICATIONS, STANDING ORDERS.
- **Body** (400, 15px, 1.5): prose, max 65ch.
- **Clause** (Courier Prime, 11–13px): numbered notifications, order text, receipts, hashes.
- **Label** (Courier Prime, 10–11px, uppercase, +0.14em): tile labels and status furniture.

### Named Rules
**The Typewriter Rule.** Courier Prime carries only what the machine or ledger produced — serials, clauses, hashes, amounts, stamps. Spectral carries everything a person would have written.

## Layout

A centered gazette sheet, max-width 1440px. The masthead is symmetric and centered (official print is symmetric; the anti-center bias of landing pages does not apply to this world). Below the double rule: a full-width settlement-summary strip, then a two-column grid (1.6fr / 1fr): the notice board and standing orders on the left, the notifications column on the right. Sections separate with 20px gaps; boxes pad 16px. The notice board's SVG scrolls horizontally under 720px; the grid collapses to one column under 1280px.

## Elevation & Depth

Print has no elevation. Depth is conveyed by paper layering (inner-page fills on ground), rule weight (double rules above single), and one sanctioned soft shadow on the Summons card (`0 10px 28px rgba(28,26,23,0.22)`) — a card physically handed to you, lifted off the desk. No other drop shadows.

### Named Rules
**The Lifted-Hand Rule.** Only an element presented to the reader (the Summons) may cast a shadow, and it must be soft, ink-tinted, and offset downward.

## Shapes

Corners are square (0px) with one exception: seals and notification cards round at 3px, the radius of a paper edge. Borders are 1.5px ink for primary boxes, 1px paper-edge for inner cards. The form language is the ruled box, the double rule, the security-thread band, and the rotated seal.

## Components

### Rule Box
- **Shape:** square, 1.5px ink border, inner-page fill (#faf6ea), 16px padding.
- **Used by:** the notice board, standing orders, settlement summary.

### Seal (signature component)
- **Shape:** 3px radius, 2px current-color border, rotated -7deg.
- **Ink:** henna for approval, seal red for refusal, thread gold for held.
- **Behavior:** stamps in once at 320ms ease-out (scale 1.7→1, no bounce); disabled under reduced motion.
- **Words:** ALLOWED, REFUSED, IN FORCE, REPEALED, SEALED, CAPTURED, RECOVERED, HELD.

### Instrument Digits
- **Shape:** each digit a bordered cell (1px paper-edge), tabular Courier Prime 700.
- **Behavior:** rolls up into place on value change (280ms); aria-label carries the full value.

### Notifications (clause card)
- **Shape:** 1px paper-edge border on inner-page fill, numbered "No. NNN" header, Courier Prime body, timestamp right-aligned, seal at foot.
- **Behavior:** typesets in on arrival (260ms); the column scrolls with a thin paper-toned scrollbar.

### Standing Orders (clause + control)
- **Shape:** clause paragraph with bold Courier Prime values, an In force/Repealed seal-button, a native range slider in seal red beneath.
- **Behavior:** the clause text re-typesets live as the slider drags; commit on release.

### Summons
- **Shape:** 2px seal-red border, paper fill, drawn SVG bell (swings twice), soft lifted shadow.
- **Behavior:** appears when the policy engine gates a transaction; Allow entry / Refuse buttons carry press feedback; decision latency is recorded.

## Do's and Don'ts

### Do:
- **Do** set every money figure in Courier Prime with tabular numerals.
- **Do** pair every seal word with its color (never color-alone status).
- **Do** keep the notifications column seeded from the ledger on load.
- **Do** use marginal Fig. annotations (10.5px Courier Prime, pointer line) to explain live mechanics.
- **Do** theme browser surfaces: seal-red caret, seal-tinted selection, paper-toned thin scrollbars.

### Don't:
- **Don't** introduce rounded corners beyond the 3px paper edge; the Square Rule holds everywhere.
- **Don't** use em-dashes in any rendered string; the gazette uses periods, colons and semicolons.
- **Don't** add a second shadow style; only the Summons lifts.
- **Don't** replace the drawn bell with an emoji or glyph icon; icons in this world are drawn ink strokes.
- **Don't** let seal red exceed ~10% of any screen; its rarity is its authority.
