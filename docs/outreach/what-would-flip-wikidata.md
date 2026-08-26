# What would actually flip the Wikidata verdict

**Prepared:** 2026-08-26 · Companion to `docs/wikidata-westpeek-draft.md`

Blunt version. Read this before spending money or time on anything else in this folder.

---

## The current verdict, restated

The draft assesses the item as **borderline, leaning delete**. The reason is not that
West Peek Productions is unreal or unimportant. It is that every reference available
today falls into one of three disqualifying buckets:

| Bucket | Sources in it | Why it fails |
|---|---|---|
| Self-published | westpeekproductions.com, scootertaylor.com, LinkedIn company + person | The subject wrote it |
| Company-submitted database entries | Crunchbase org, Crunchbase person, The Vendry | The subject typed it into someone else's form |
| Paid-supplier marketing | susangreenecopywriter.com portfolio page | Written by a vendor West Peek hired, published as that vendor's own sales material, no editor between writer and publish button |

One source sits outside those buckets: **Better Events Podcast Episode #51**. It is
genuinely third-party. It is also an interview, which means the subject supplied the
content, and it is one episode of a niche show. It is real, and it is not enough.

---

## The standard, precisely

Wikidata's notability policy (WD:N) admits an item on **any one** of three criteria.
Verbatim, from `https://www.wikidata.org/wiki/Wikidata:Notability`:

1. "It contains at least one valid sitelink to a page on Wikipedia, Wikivoyage,
   Wikisource, Wikiquote, Wikinews, Wikibooks, Wikidata, Wikispecies, Wikiversity,
   or Wikimedia Commons."
2. "It refers to an instance of a clearly identifiable conceptual or material entity
   that can be described using serious and publicly available references."
3. "It fulfills a structural need, for example: it is needed to make statements made
   in other items more useful."

Criterion 1 is out (no Wikipedia article, and one should not be attempted — WP:NCORP,
WP:COI). Criterion 3 is achievable later but not today. **Criterion 2 is the whole
game**, and the phrase that decides it is *serious and publicly available references*.

The policy page does not define "serious". Deletion discussions do, in practice, and
they converge on three tests. A reference has to clear **all three**:

- **Independent of the subject.** Not written, commissioned, paid for, or submitted by
  West Peek Productions or anyone West Peek Productions pays. A press release that an
  outlet republished verbatim fails this even though the outlet is independent, because
  the *text* is not.
- **Non-trivial.** The company is the subject of the piece, or at minimum is discussed
  substantively in it. A one-line vendor credit, a directory row, a "companies to watch"
  listicle entry with no reporting behind it — all trivial.
- **Under editorial oversight.** A named masthead, staff bylines, someone who can and
  does say no. This is the test that kills contributed-content mills, "as seen in"
  syndication networks, and pay-to-publish placements, all of which look like press and
  none of which count.

Three tests, all three required. Most things that *feel* like coverage fail at least one.

---

## What flips it

In descending order of how decisively each one settles the question.

### 1. Two or three pieces of reported trade-press coverage — decisive

An article in an event-industry or B2B trade publication where **a staff journalist
reported on West Peek Productions** — interviewed the founder, checked something,
wrote it under their own byline, and published it under a masthead. Two or three of
these move the item from "leaning delete" to "nobody bothers to nominate it".

From `docs/outreach/targets.md`, the entries that produce exactly this if they land:

- **BizBash** — staff-bylined event industry coverage (Michele Laufik, Bruce Starr,
  Sarah Kloepple were all bylined on the homepage on 2026-08-26). Its /get-featured
  route is an explicit invitation to pitch post-event stories to editors. Highest
  fit-to-effort ratio on the whole list.
- **Chief Marketer** — has a named Content Director taking editorial pitches at a
  published address. Access Intelligence masthead. Covers experiential and event
  marketing directly.
- **PCMA Convene** — five named editors with published addresses, and the strongest
  thematic fit for the community-as-a-service story.
- **Skift Meetings**, **Smart Meetings**, **Meetings Today**, **Event Marketer** — same
  category: reported trade press with real mastheads. (MeetingsNet and Corporate Event
  News no longer exist independently; both now redirect into BizBash.)
- **Sports Video Group** and **NewscastStudio** — the only outlets whose beat is
  literally executive broadcast production.
- **The AJC business desk** and **Atlanta Business Chronicle** — a staff piece on an
  Atlanta company expanding to New York is a textbook independent secondary source, and
  it also fixes the location problem below.

### 2. A city business-journal profile — decisive, and fixes a second problem

The Atlanta and NYC business press are the outlets most likely to write *about the
company as a company* rather than about an event it produced. That is precisely the
"non-trivial coverage of the subject" a deletion discussion wants to see.

It also solves something `docs/wikidata-westpeek-draft.md` flags separately: **no
independent published source currently states that New York is a West Peek location.**
Every independent source that names a location says Atlanta. Filing `P159 (headquarters
location)` as New York today means filing it on a self-published reference. A business-
journal piece on the NYC expansion converts that from an unsourced claim into a sourced
statement, in one move.

### 3. An award from a body that is itself notable — strong, and slower

Criterion 2 is satisfied by references; an award helps mainly because notable awarding
bodies generate independent write-ups and because `P166 (award received)` is a
sourceable statement pointing at another item. See `docs/outreach/award-programmes.md` for which
programmes are real bodies and which are trophy shops. The distinction matters enormously
here: an award from a pay-to-enter vanity programme adds **nothing** and, if it shows up
in a promotional-looking item, actively hurts.

### 4. Structural need, created honestly — real but indirect

If West Peek Productions produced an event for, or worked with, an organization that
already has a Wikidata item, that item can legitimately carry a statement referencing
West Peek, and criterion 3 starts to apply. This cannot be manufactured — it has to be
a true relationship that a source documents. Worth watching for; not worth chasing.

---

## What does not flip it

Stated plainly because these are the things that feel productive and are not:

- **More directory listings.** Alignable, G2, Clutch, Yelp, Google Business Profile,
  another vendor marketplace. Every one is the same non-independent bucket as The Vendry
  and Crunchbase. They may be worth doing for entity-consistency reasons
  (`docs/entity-consistency-copy.md`), but they contribute exactly zero to notability.
- **More podcast interviews, on their own.** Useful, real, worth doing — see
  `docs/outreach/podcast-followup.md`. But interviews are primary in character no matter how many
  there are. Ten podcast appearances do not equal one reported article.
- **Contributed articles, guest posts, and bylined columns by Scooter Taylor.** These are
  excellent for reach and for the entity's subject-matter footprint. They are **not**
  independent coverage — the subject wrote them. Do not count them toward notability and
  do not cite them as if they were.
- **Paid placements, sponsored content, and "as featured in" syndication.** Fails the
  editorial-oversight test and the independence test simultaneously. Worse than useless:
  a reference list full of these is the single clearest signal to a deletion patroller
  that an item is promotional.
- **Anything ghost-written to look independent.** Beyond being wrong, it is the specific
  pattern that gets a domain and an entity flagged rather than cited.

---

## The sequence

1. Pitch the trade press and the Atlanta/NYC business press now (`docs/outreach/pitches/`).
2. Enter only the award programmes marked as run by real industry bodies
   (`docs/outreach/award-programmes.md`).
3. Build on the one genuine third-party source that already exists
   (`docs/outreach/podcast-followup.md`) — but count it as reach, not as notability.
4. **Do not file the Wikidata item until at least two references clear all three tests
   above.** Re-run the assessment in `docs/wikidata-westpeek-draft.md` when they do.

A deleted item is worse than no item. Nothing in this folder changes that; it just
shortens the wait.
