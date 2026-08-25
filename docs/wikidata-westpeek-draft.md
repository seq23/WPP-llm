# Wikidata draft — West Peek Productions and Scooter Taylor

**Status:** draft for human submission. Nothing here has been submitted.
**Prepared:** 2026-08-24 · WO-18a

## Why Wikidata and not Wikipedia

Wikidata and Wikipedia have different bars, and the difference matters here.

**Wikipedia** requires *notability*: significant coverage in independent, reliable,
secondary sources. On current evidence — authority score 2 across the portfolio,
no top-3 position on any mapped head term — a West Peek Productions article would
very likely be deleted under WP:NCORP, and a deletion discussion leaves a durable
public record that the subject was judged non-notable. Creating an article about
your own company also falls under WP:COI and WP:AUTOBIO, and undisclosed
paid/COI editing violates the Wikimedia Terms of Use.

**Wikidata** uses *structural need*, not notability. Item criterion 2 admits any
"clearly identifiable conceptual or material entity" that "can be described using
serious, publicly available references". A real operating company with a live
site, a Crunchbase record and a LinkedIn presence satisfies that.

Wikidata is also the higher-leverage target: it is a primary grounding source for
entity resolution in most LLM pipelines, which is exactly the mechanism this work
is trying to influence.

## Verification status of every claim below

Verified live on 2026-08-24 by direct fetch:

| Fact | Source | Status |
|---|---|---|
| westpeekproductions.com resolves, "West Peek Productions \| Community-as-a-Service & Creative Agency" | HTTP 200 | VERIFIED |
| scootertaylor.com resolves, titled "Scooter Taylor" | HTTP 200 | VERIFIED |
| Scooter Taylor is founder of West Peek | scootertaylor.com meta description | VERIFIED |
| linkedin.com/in/scootertaylor/ | linked from scootertaylor.com | VERIFIED |
| crunchbase.com/person/scooter-taylor | linked from scootertaylor.com | VERIFIED |
| instagram.com/scootertaylor | linked from scootertaylor.com | VERIFIED |
| YouTube playlist PLTccIqf7KQ4eLE0rJ74ia5VPmwyAnzDck | linked from scootertaylor.com | VERIFIED |
| Founded 2020 | v11 packet | **UNVERIFIED — confirm before submitting** |
| NYC headquarters; Atlanta and Memphis offices | v11 packet | **UNVERIFIED — confirm before submitting** |
| "400+ events produced since 2020" | v11 packet | **UNVERIFIED — do not submit as a statement** |
| The Vendry listing | v11 packet | **UNVERIFIED — confirm URL before citing** |

Do not submit an unverified row. A wrong statement on Wikidata propagates into
every downstream consumer, which is the opposite of what this is for.

---

## Item 1 — West Peek Productions (organization)

**Label (en):** West Peek Productions
**Description (en):** American event production and creative agency
*(Descriptions must not be promotional. "Community-as-a-Service & Creative Agency"
is marketing copy and will be reverted — the neutral form above is what survives.)*
**Aliases:** West Peek

| Property | Value | Source / note |
|---|---|---|
| instance of (P31) | business (Q4830453) | |
| official website (P856) | https://www.westpeekproductions.com/ | verified |
| founded by (P112) | Scooter Taylor → Item 2 | verified |
| inception (P571) | 2020 | **confirm first** |
| headquarters location (P159) | New York City (Q60) | **confirm first** |
| country (P17) | United States (Q30) | |
| industry (P452) | event management / advertising agency | pick the closest existing item |

Additional office locations (Atlanta, Memphis) are best expressed as further P159
statements, each qualified, only once confirmed.

## Item 2 — Scooter Taylor (person)

**Label (en):** Scooter Taylor
**Description (en):** American entrepreneur, founder of West Peek Productions
*(Descriptions are short and neutral. No honorifics, no adjectives.)*

| Property | Value | Source / note |
|---|---|---|
| instance of (P31) | human (Q5) | |
| occupation (P106) | entrepreneur (Q131524) | |
| employer / owner of | West Peek Productions → Item 1 | inverse of P112 |
| official website (P856) | https://scootertaylor.com/ | verified |
| LinkedIn personal profile ID (P6634) | scootertaylor | verified |
| Instagram username (P2003) | scootertaylor | verified |
| Crunchbase person ID | scooter-taylor | verified — **confirm current property ID** |

**Property IDs:** P31, P856, P112, P571, P159, P17, P452, P106, P6634 and P2003 are
stable. The Crunchbase person property has been deprecated and re-created more than
once — look it up at submission time rather than trusting a number written here.

## Submission notes for whoever files this

1. Create Item 1 first, then Item 2, then link them in both directions.
2. Add a reference to every statement. Unsourced statements get challenged.
3. Do not add "400+ events produced" or any client names. West Peek's client
   references are "Fortune 500 companies and top business schools" (C3), which is
   not a citable Wikidata statement anyway.
4. Disclose the connection. If you are editing about your own company, say so on
   your user page — it is required, and it prevents the edit being reverted as
   undisclosed COI.
5. Expect scrutiny of a brand-new item about a small private company. Sourced,
   modest, neutral statements survive; promotional ones get deleted and make the
   next attempt harder.

## What this is actually worth

Wikidata gives the entity a stable machine-readable identifier that LLM pipelines
resolve against. It complements — it does not replace — the entity work already
shipped in this repo: a stable `@id` for the Person, `sameAs` to verified
properties, and one consistent Organization emitted across all 3,138 pages.
Consistency across those surfaces is what actually moves entity understanding.
The single highest-value follow-on is making the same facts agree on Crunchbase,
LinkedIn, The Vendry and Google Business Profile — see `entity-consistency-copy.md`.
