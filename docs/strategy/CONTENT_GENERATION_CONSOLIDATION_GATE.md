# Content Generation Consolidation Gate — WPP LLM

Status: ACTIVE / REQUIRED
Date: 2026-06-25

## Decision

This repo now has one canonical content engine: `scripts/citation_intelligence/*`.

The old draft queue and loose scheduled publishing model are not allowed to publish public routes. Existing stable pages remain live, but all new programmatic content must flow through:

1. query universe;
2. source/claim registry;
3. atom registry;
4. page family contract;
5. page admission registry;
6. release plan;
7. controlled release cap;
8. self-heal and validation.

## Cutover

Cutover date: 2026-06-25

## Cadence

The 6-month cadence starts now in controlled release mode:

- 5 new pages/day max;
- 10 repairs/day max;
- 900 route opportunity backlog;
- GSC as primary signal source because credentials already exist;
- Gemini prompt-panel collector enabled when `GEMINI_API_KEY` exists;
- no paid providers required.

## Anti-loop routing law

Clean URLs are canonical. The repo must not generate clean URL → `.html` redirects because that can conflict with host-level `.html` stripping and cause redirect loops.
