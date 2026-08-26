# Wikidata draft — West Peek Productions and Scooter Taylor

> **DRAFT ONLY. A HUMAN SUBMITS THIS. Nothing here has been submitted to Wikidata,
> and nothing here may be described publicly as submitted.**
> `sprylabs-hpc-site/data/authority/wikidata_wikipedia_readiness.json` records the
> portfolio status as `not_submitted_defensibility_review_required` with
> `public_claim_allowed: false`. That still holds.

**Prepared:** 2026-08-24 · **Re-verified and expanded:** 2026-08-26

---

## Read this first: this item will probably be deleted

Honest assessment, stated up front because the rest of the document is only worth
reading if you accept it.

West Peek Productions is a small private company whose available references are its
own website, its own Crunchbase profile, its own LinkedIn page, a vendor-directory
listing it submitted to The Vendry, and a marketing portfolio page written by a
copywriter it hired. On Wikidata's Requests for Deletion, that reference profile —
self-published site plus company-submitted database entries plus a supplier's
promotional page — is the routine deletion pattern for new company items,
especially when the item is created by an account with an obvious connection to the
subject.

**A deleted item is worse than no item.** It burns the Q-ID, it leaves a permanent
public deletion discussion recording that the subject was judged not to qualify,
and it makes a later attempt harder rather than easier. The deletion log is exactly
the kind of durable negative signal this entire entity programme exists to avoid.

The full analysis is in "Will this survive?" below. The short version: this is
**borderline, leaning delete**, and the one thing that would decisively change it
is independent, non-trivial coverage in a source with editorial oversight. If you
have such coverage that is not in this document, add it and re-run the assessment.
If you do not, the defensible sequence is to get that coverage first and file
afterwards.

---

## Why Wikidata and not Wikipedia

**Wikipedia** requires *notability*: significant coverage in independent, reliable,
secondary sources. A West Peek Productions article would very likely be deleted
under WP:NCORP. Creating an article about your own company also falls under WP:COI
and WP:AUTOBIO, and undisclosed paid/COI editing violates the Wikimedia Terms of
Use. **Recommendation: do not attempt a Wikipedia article.**

**Wikidata** uses a different and genuinely lower bar (see below). It is also the
higher-leverage target: it is a primary grounding source for entity resolution in
most LLM pipelines, so an item gives the entity a stable machine-readable
identifier that answer engines resolve against. That leverage cuts both ways — a
wrong statement here propagates into every downstream consumer — which is why every
row in this file is marked with what it actually rests on.

---

## Reference sources — verified 2026-08-26

Every statement below cites one of these. All were checked directly on 2026-08-26.
None is invented.

| # | Source | URL | Check | Independent? |
|---|---|---|---|---|
| S1 | Official website | `https://www.westpeekproductions.com/` | HTTP 200. Title "West Peek Productions \| Community-as-a-Service & Creative Agency". Body states the company **"began in 2020"**. | No — self-published |
| S2 | Founder's site | `https://scootertaylor.com/` | HTTP 200. Links out to S3, S4, Instagram, and a YouTube playlist. | No — self-published |
| S3 | Crunchbase — person | `https://www.crunchbase.com/person/scooter-taylor` | Linked from S2. Direct fetch 403 (Crunchbase blocks non-browser clients). Indexed title: "Scooter Taylor - **Co-Founder** @ West Peek Productions". | No — largely company-submitted |
| S4 | LinkedIn — person | `https://www.linkedin.com/in/scootertaylor/` | HTTP 200. Also the only `sameAs` on the Person node this repo emits site-wide. | No — self-published |
| S5 | Crunchbase — organization | `https://www.crunchbase.com/organization/west-peek-productions` | HTTP 403 to direct fetch (bot block). Indexed title "West Peek Productions - Crunchbase Company Profile & Funding". **Confirm in a browser before citing.** | No — largely company-submitted |
| S6 | LinkedIn — company | `https://www.linkedin.com/company/west-peek-productions` | HTTP 200. | No — self-published |
| S7 | The Vendry listing | `https://thevendry.com/pro/153051/west-peek-productions-atlanta-ga` | HTTP 200. Title: "West Peek Productions - Planning & Production in **Atlanta, GA** \| The Vendry". Atlanta appears throughout; **no** mention of Memphis, effectively none of New York. | No — vendor-submitted directory |
| S8 | Third-party agency case study | `https://www.susangreenecopywriter.com/portfolio/west-peek-productions` | HTTP 200. Susan Greene Copywriter's client portfolio. Names the client "West Peek Productions, **Atlanta, Georgia**", describes it as "Founded in response to the COVID-19 pandemic", refers to "the **owners**" (plural), names Inovo Studios as the web agency. | Partly — written by a paid supplier as its own marketing |
| S9 | Better Events Podcast, Episode #51 | `https://www.youtube.com/watch?v=HFt6vG9J-XY` | HTTP 200. Channel "Better Events Podcast". Title: "Episode #51 - How to Scale an Event Business with West Peek Productions". Description names **"West Peek Production co-founders Scooter Taylor and Tre'von Hill"** and describes a pandemic pivot to virtual and hybrid event production. | **Yes** — third-party channel, but an interview, so primary in character |
| S10 | This repo's canonical entity graph | `scripts/lib/entity.mjs` | Asserts `foundingDate: '2020'`, `founder: Scooter Taylor`, and three `Place` nodes: New York NY **(headquarters)**, Atlanta GA, Memphis TN. | No — self-published, and see the emission finding below |

S10 is not a citable Wikidata reference. It is listed because it is what the
portfolio asserts, and because two of its statements conflict with the independent
sources.

---

## Will this survive?

Wikidata's notability policy (**WD:N**) admits an item that satisfies **any one** of
three criteria. Assessed honestly against each:

### Criterion 1 — a valid sitelink to a page on Wikipedia, Wikivoyage, Wikisource, etc.

**FAILS.** No Wikipedia article about West Peek Productions exists, and per the
section above one should not be attempted. There is nothing to link to.

### Criterion 2 — a "clearly identifiable conceptual or material entity" that "can be described using serious and publicly available references"

**BORDERLINE — this is where the item lives or dies.**

The entity half is easy: West Peek Productions is a real, operating, clearly
identifiable company. Nobody will argue otherwise.

The references half is the problem. Sort the sources by what a deletion discussion
would actually accept:

| Source | How a deletion discussion treats it |
|---|---|
| S1, S2, S4, S6, S10 — own site, founder's site, LinkedIn | Self-published. Fine for uncontroversial self-descriptive facts, worth nothing toward notability. |
| S5, S3 — Crunchbase | Company-submitted database entries. Routinely dismissed as non-independent. Crunchbase profiles are created and edited by the companies themselves. |
| S7 — The Vendry | A vendor directory the company listed itself in. Trivial and non-independent — the same category as a Yelp or Alignable page. |
| S8 — Susan Greene Copywriter portfolio | Written by a supplier West Peek paid, published as that supplier's own marketing. It is independent of West Peek in authorship but it is promotional in purpose and has no editorial oversight. Weak. |
| S9 — Better Events Podcast #51 | The only genuinely third-party source here. But it is an interview on a niche industry podcast: the subjects supply the content, so it is primary in character, and a podcast episode is thin evidence on its own. |

A literal reading of criterion 2 arguably passes: these references are publicly
available, and several are "serious" in the sense of being real databases rather
than blog spam. That is the strongest honest argument for the item.

The practical reading does not. New items about small private companies, created by
COI-connected accounts, referenced entirely to the company's own site plus database
listings it populated itself, are a recognised pattern at Wikidata's Requests for
Deletion and are frequently deleted as promotional or as failing to demonstrate a
serious reference base. One podcast interview does not carry that weight.

**Verdict: borderline, leaning delete.**

### Criterion 3 — it fulfils a structural need

**FAILS today, but this is the most achievable path.** Structural need means some
other Wikidata item genuinely needs this one as the value of a statement — an
employer for a notable person, the producer of a notable event, the parent or
subsidiary of an existing organization. No Wikidata item currently references West
Peek Productions in any way, so there is no structural need to point at.

### What would change the assessment

In rough order of how decisively each one settles it:

1. **Independent, non-trivial coverage in a source with editorial oversight.** Event
   and meetings trade press, a city business journal, a national outlet, a
   published book. Two or three such pieces move this from "leaning delete" to
   "comfortably fine". *This is the single highest-value thing to go get.*
2. **An award from a notable body** — one that itself has a Wikidata item or would
   plausibly qualify for one.
3. **Structural need created honestly.** If West Peek Productions produced an event
   or worked with an organization that has its own Wikidata item, that item can
   legitimately reference West Peek, and criterion 3 starts to apply.
4. **A Wikipedia sitelink.** Settles it outright, and is not achievable here.

Note what is *not* on that list: more directory listings. Adding Alignable, a
Google Business Profile, or another vendor marketplace does not improve the
notability case at all, because each is the same non-independent category as the
ones already counted. They are worth doing for entity-consistency reasons — see
`docs/entity-consistency-copy.md` — but they will not save this item.

### The recommendation

**Do not file yet.** Go and get item 1 above first. If the decision is to file
anyway, file the *minimum* defensible item — accurate label, neutral description,
`P31`, `P17`, `P856`, `P571`, sourced references on every statement, no
promotional language, and a COI disclosure on the user page. A small, boring,
well-sourced item has a materially better survival rate than a rich one, because
richness reads as promotion.

---

## Status of every fact you were asked to include

| Fact | Verdict | Basis |
|---|---|---|
| Founded 2020 | **SUPPORTED** | S1 ("began in 2020"), S10 (`foundingDate: '2020'`), S8 and S9 (founded in the COVID-19 pandemic pivot — consistent with 2020). |
| Founder: Scooter Taylor | **SUPPORTED, but he is a CO-founder** | S3's indexed title says *Co-Founder*; S8 refers to "the owners" (plural); S9 names **"co-founders Scooter Taylor and Tre'von Hill"**. See conflict C1. |
| NYC headquarters | **NOT SUPPORTED — do not submit** | Only S10 (self-published) says New York. Both independent sources that state a location say **Atlanta, GA** (S7, S8). See conflict C2. |
| Atlanta office | **SUPPORTED** | S7, S8, S10. The only independently corroborated locality. |
| Memphis office | **UNSUPPORTED — repo-only** | S10 only. Appears in no external source checked. |
| Official website | **VERIFIED** | S1. |
| `sameAs` → Crunchbase | **URL FOUND** | S5 (org), S3 (person). Both bot-blocked; confirm in a browser. |
| `sameAs` → LinkedIn | **VERIFIED** | S6 (org), S4 (person). |
| `sameAs` → The Vendry | **VERIFIED** | S7. |
| Notability support: third-party agency case study | **VERIFIED, but weak** | S8. See the notability assessment — it is a paid supplier's marketing page. |
| "400+ events produced since 2020" | **DO NOT SUBMIT** | Unverified figure from the v11 packet; `docs/entity-consistency-copy.md` already rules it out. |
| Named clients | **DO NOT SUBMIT** | The approved formulation is "Fortune 500 companies and top business schools" (C3). Not a citable Wikidata statement. |

### Conflict C1 — a second co-founder exists

`P112 (founded by)` is a multi-value property, and filing Scooter Taylor as the sole
value asserts something three sources contradict. S9 names the second co-founder as
**Tre'von Hill**.

Confirm the spelling of that name and his role before filing — a misspelled name on
a `P112` statement is exactly the kind of error that propagates. Then either file
both founders or file neither. An incomplete `P112` is worse than an absent one,
because it reads as complete.

### Conflict C2 — Atlanta vs New York headquarters

This is the most important factual problem in this file.
`docs/entity-consistency-copy.md` already flagged that The Vendry says Atlanta while
the site implies New York, and called it "exactly the kind of disagreement" that
makes an answer engine drop an entity. Verification confirms it and makes it worse:
**no independent source places West Peek Productions in New York.** Both that state
a location say Atlanta.

Do not file `P159 → New York City`. Options, best first:

1. Establish which city is genuinely the headquarters, make it consistent across the
   site, Crunchbase, LinkedIn and The Vendry *first*, then file `P159` once.
2. File `P159 → Atlanta` — the only sourced locality — and add others later.
3. Omit `P159` entirely. An item with no headquarters statement is perfectly fine.

---

## Item 1 — West Peek Productions (organization)

**Label (en):** `West Peek Productions`
**Description (en):** `American event production and creative agency`
**Aliases (en):** `West Peek`

Descriptions are short, neutral and non-promotional.
"Community-as-a-Service & Creative Agency" is marketing copy and will be reverted.

| # | Property | Value | Reference | Status |
|---|---|---|---|---|
| 1 | `P31` instance of | `Q4830453` (business) | — | file |
| 2 | `P17` country | `Q30` (United States) | S1, S7 | file |
| 3 | `P856` official website | `https://www.westpeekproductions.com/` | S1 | file |
| 4 | `P571` inception | `2020` (precision: year) | S1, S8, S9 | file |
| 5 | `P112` founded by | Scooter Taylor → Item 2 | S3, S9 | **hold — see C1** |
| 6 | `P112` founded by | Tre'von Hill | S9 | **hold — confirm name spelling** |
| 7 | `P159` headquarters location | — | — | **hold — see C2** |
| 8 | `P452` industry | closest existing item for event management / event production | S7 | look the Q-ID up at submission; do not invent one |
| 9 | `P973` described at URL | `https://thevendry.com/pro/153051/west-peek-productions-atlanta-ga` | S7 | file |
| 10 | `P973` described at URL | `https://www.susangreenecopywriter.com/portfolio/west-peek-productions` | S8 | file |
| 11 | LinkedIn company page ID | `west-peek-productions` | S6 | check the current property (**P4264**) is live before filing |
| 12 | Crunchbase organization ID | `west-peek-productions` | S5 | see the property cautions below |

`Q4830453` and `Q30` were both checked against `Special:EntityData` and exist.

### "sameAs" in Wikidata terms

Wikidata has no `sameAs` property. External identity is expressed two ways, and
confusing them is the commonest first-time mistake:

- **As an external identifier** where a dedicated property exists (LinkedIn,
  Crunchbase). These store the *slug*, not the full URL — the property's formatter
  URL rebuilds the link.
- **As `P973` (described at URL)** where no dedicated property exists. That is the
  right home for The Vendry and for the Susan Greene case study.

The repo's own Organization node declares this `sameAs` set, emitted on `index.html`:

```
https://www.westpeekproductions.com/
https://www.linkedin.com/company/west-peek-productions/posts/?feedView=all
https://westpeek.live/
https://westpeek.ventures/
https://joinwestpeek.com/
```

Two notes. The LinkedIn URL carries a `?feedView=all` UI query string; the clean
profile URL `https://www.linkedin.com/company/west-peek-productions` returns 200
and is what belongs in an identifier statement. And the set contains neither
Crunchbase nor The Vendry even though both listings exist — closing that gap is a
prerequisite for the site corroborating the Wikidata item.

### Property-ID cautions

- **Crunchbase.** The Crunchbase organization and person properties have been
  created, deprecated and deleted more than once on Wikidata. **Look the current
  property up at submission time.** If none is live, cite Crunchbase with `P973`
  instead. Do not copy a P-number from this file.
- **`P2427` (GRID ID) does not apply.** GRID identifies research and academic
  organizations, and GRID itself has been superseded by ROR (`P6782`). Neither
  belongs on a private event-production company. It was on the input list for this
  draft and is being dropped deliberately, not overlooked.
- **`P2013` (Facebook ID) is not usable** — no Facebook property for West Peek
  Productions was found in the repos or verified live. Omit it.
- `P31`, `P17`, `P856`, `P571`, `P112`, `P159`, `P452`, `P973`, `P106`, `P6634`,
  `P2003`, `P854`, `P813`, `P1476` and `P248` are stable and safe as written.

---

## Item 2 — Scooter Taylor (person)

**Label (en):** `Scooter Taylor`
**Description (en):** `American entrepreneur, co-founder of West Peek Productions`

No honorifics, no adjectives.

| # | Property | Value | Reference | Status |
|---|---|---|---|---|
| 1 | `P31` instance of | `Q5` (human) | — | file |
| 2 | `P106` occupation | `Q131524` (entrepreneur) | S2 | file |
| 3 | `P856` official website | `https://scootertaylor.com/` | S2 | file |
| 4 | `P6634` LinkedIn personal profile ID | `scootertaylor` | S2, S4 | file |
| 5 | `P2003` Instagram username | `scootertaylor` | S2 | file |
| 6 | employer / owner of | West Peek Productions → Item 1 | S2, S3, S9 | file after C1 resolves |
| 7 | Crunchbase person ID | `scooter-taylor` | S3 | same property caution as above |
| — | `P2397` YouTube channel ID | **omit** | — | Only a *playlist* URL (`PLTccIqf7KQ4eLE0rJ74ia5VPmwyAnzDck`) is linked from S2, and `P2397` takes a channel, not a playlist. |

`Q5` and `Q131524` were both checked against `Special:EntityData` and exist.

A separate item for Tre'von Hill is **not** drafted here. Nothing has been verified
about him beyond a single mention in S9, and a person item built on one podcast
description would not survive.

---

## How to submit this

Written for someone who has never edited Wikidata. Follow it in order. Where you
must supply something that could not be verified from here, the step says so.

### Before you touch Wikidata

1. **Decide whether to file at all.** Re-read "Will this survive?" above. The honest
   recommendation is to obtain independent coverage first. If you file anyway, you
   are accepting a real chance of deletion and a public deletion log.
2. **Create an account.** Go to `wikidata.org`, click "Create account" (top right),
   pick a username and password. Use a username that is *not* a company name —
   "WestPeekProductions" as an account name is treated as a promotional username and
   can be blocked on sight. A personal username is correct.
3. **Write your conflict-of-interest disclosure before your first edit.** Wikidata
   expects contributors with a personal or financial stake to declare it, and the
   Wikimedia Terms of Use make disclosure mandatory for paid contributions. Go to
   `https://www.wikidata.org/wiki/User:YOUR_USERNAME`, click "Create", and paste
   something like:

   > I am connected to West Peek Productions and edit items relating to it. I
   > disclose this connection in line with the Wikimedia Terms of Use and will keep
   > my edits to sourced, neutral, factual statements.

   Save it. This one paragraph is the difference between "COI editor who disclosed"
   and "undisclosed promotional account", and the second gets reverted and blocked.
4. **Make some unrelated edits first, then wait.** A brand-new account whose very
   first action is creating an item about a company is the exact pattern patrollers
   look for. Spend an hour making ten to twenty small, genuine, unrelated
   improvements — add a missing date of birth with a source, fix a wrong country,
   add a label in a language you speak — then leave it a few days. This also gets
   you *autoconfirmed*, which removes some editing restrictions. Do not make
   nonsense edits to inflate the count; that is worse than a new account.

### Creating the item

5. **Go to `https://www.wikidata.org/wiki/Special:NewItem`.**
6. **Fill the three fields:**
   - Language: `en`
   - Label: `West Peek Productions`
   - Description: `American event production and creative agency`

   Then save. Do not put a website, a slogan, or the word "leading" anywhere in the
   description. Descriptions are not sentences and never start with "A" or "The".
7. **Add the alias.** On the new item's page, next to the label, click "Also known
   as" and add `West Peek`. Save.
8. **Write down the Q-ID.** It appears at the top of the page, like `Q123456789`.
   You will need it for Item 2 and for the follow-up work in this repo.

### Adding statements

9. Click **"+ Add statement"** at the bottom of the statements list. Type the
   property name or its P-number into the property box, pick it from the dropdown,
   then enter the value. Save each statement before starting the next.
10. **Add them in this order**, taking values verbatim from the Item 1 table:
    1. `P31` instance of → `business` (`Q4830453`)
    2. `P17` country → `United States` (`Q30`)
    3. `P856` official website → `https://www.westpeekproductions.com/`
    4. `P571` inception → `2020`. When you type `2020` the date field will offer a
       precision; choose **year**, not a specific day. Do not invent a month.
    5. `P452` industry → search the property's value box for "event management" or
       "event production" and pick an item that already exists. **If nothing fits,
       skip this statement.** Never create a new item just to have a value.
    6. `P973` described at URL → the Vendry URL, then a second `P973` statement with
       the Susan Greene URL.
    7. LinkedIn company ID → value `west-peek-productions`. Search the property box
       for "LinkedIn company"; if a live property appears, use it. If not, add the
       clean LinkedIn URL as another `P973` instead.
    8. Crunchbase organization ID → value `west-peek-productions`. Same rule: use a
       live property if one exists, otherwise `P973` with the full URL.
11. **Do not add `P112` (founded by) or `P159` (headquarters location) yet.** Both
    are blocked on the conflicts above. Filing them wrong is the most likely way to
    get this item challenged.

### Adding a reference to every statement — this is the part that decides survival

12. **An unsourced statement is a deletion argument.** Reference every single one.
13. Under a saved statement, click the small **"0 references"** / **"add reference"**
    link to expand it.
14. Add these three reference properties for a web source:
    - `P854` **reference URL** → the exact URL from the source table above
    - `P1476` **title** → the page title as it actually appears
    - `P813` **retrieved** → the date you checked it, at day precision
15. Then click **"save"** *inside the reference block*. A reference that is typed but
    not saved does not exist.
16. **Match the reference to the claim.** Cite S1 for the website and the founding
    year, S7 for the Vendry URL, S8 for the case-study URL, S5 for the Crunchbase
    identifier. Citing the company's own site for a claim about the company's own
    site is fine. Citing it as evidence the company is notable is not.
17. When you are done, click through every statement once more and confirm each one
    shows "1 reference" rather than "0 references".

### Item 2 and linking

18. Repeat steps 5 to 17 for **Scooter Taylor**, using the Item 2 table. Label
    `Scooter Taylor`, description `American entrepreneur, co-founder of West Peek
    Productions`.
19. Link the two items in both directions once C1 is resolved: `P112` on the company
    pointing at the person, and employer/owner-of on the person pointing at the
    company. A one-directional link leaves an orphan.

### Edit summaries

20. Every edit box has a summary field at the bottom. Use it, and mention the
    connection: `Adding sourced statement; I am connected to this company — see my
    user page.` Repeating the disclosure in summaries is what makes it visible to
    the patroller who actually looks at the edit.

### If it gets nominated for deletion

21. You will see a notice on the item and a thread at **Wikidata:Requests for
    deletion**. It is a discussion, not an instant removal, and it usually runs for
    at least a week.
22. **Respond once, calmly, in the thread.** Say which WD:N criterion you believe is
    met and why, and link the specific sources. Do not argue that the company is
    important, well-known, or growing — none of that is the standard.
23. **Add any genuinely independent source you have** directly to the item as a
    reference, and mention it in the thread. New sourcing during a deletion
    discussion is the thing most likely to change the outcome.
24. **Do not** create additional accounts, ask colleagues to comment, or re-create a
    deleted item. Sockpuppetry and re-creation convert a deleted item into a blocked
    account and a protected title.
25. **If it is deleted, accept it and stop.** Go and get the independent coverage.
    A second attempt with real sources, from a disclosed account with a clean
    history, is a normal and acceptable thing to do later. A second attempt without
    new sources is not.

### After submission

26. Add the resulting Q-IDs back into `scripts/lib/entity.mjs` as `sameAs` so the
    site points at Wikidata and Wikidata points at the site. Until the Q-IDs exist
    there is nothing to add, so this step is blocked, not deferred.
27. Update `sprylabs-hpc-site/data/authority/wikidata_wikipedia_readiness.json`,
    which currently records `not_submitted_defensibility_review_required` and
    `public_claim_allowed: false`. Until it is updated, nothing may be claimed
    publicly about a Wikidata presence.

---

## A finding the submitter should know: the site barely corroborates these facts

A Wikidata reviewer — and an answer engine — checks the subject's own site for
corroboration. Measured in this repo on 2026-08-26:

| Measurement | Count |
|---|---|
| HTML files in the repo | 3,242 |
| Pages whose JSON-LD references `#organization` | 3,150 |
| Pages that actually *define* the Organization with that `@id` | 2,916 |
| Pages emitting **`foundingDate`** | **2** |
| Pages emitting the New York / Atlanta / Memphis `Place` nodes | **2** |

`scripts/lib/entity.mjs` defines `foundingDate`, `founder` and all three office
locations, but the site-wide emitter writes only a stub — `@type`, `@id`, `name`,
`url`. The founding year and the offices reach two programmatic pages and nowhere
else. On `index.html` the Organization node carries no `@id` at all, so that page's
Person `worksFor` reference points at a node the page never defines, and a second
Organization node on the same page declares a `sameAs` of only itself.

None of this is fixed here — that is a content change, out of scope for a docs
deliverable — but it is why several "confirm first" rows cannot be confirmed from
the live site. Emitting the full entity node site-wide would convert them into
self-published-but-checkable facts, and would also let the site carry the Crunchbase
and Vendry links it currently omits.

## Related

- `docs/entity-consistency-copy.md` — the canonical fact block to paste identically
  into Crunchbase, LinkedIn, The Vendry and Google Business Profile. Making those
  four agree is the highest-value follow-on, and it resolves C2 at the source
  rather than papering over it on Wikidata.
