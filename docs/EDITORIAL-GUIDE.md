# americawhat — Editorial Guide

The concept, the voice, and above all the rejection rules. This is the part of the
project that cannot be regenerated from the code. If you only read one file, read
this one.

---

## 1. The concept

A curated feed of **absurd, only-in-America** news. Three conditions, all required:

1. **Real.** A genuine news story from a real outlet, with a source link.
2. **American.** The story happens in the United States.
3. **Absurd, and funny without a victim.** The humour comes from bureaucratic
   insanity, petty neighbour warfare, or a person making a spectacularly poor
   decision — never from somebody's suffering.

A story that fails any one of these is rejected, no matter how well it would
perform.

## 2. Categories

Defined in `src/data/categories.js`:

| key | label | blurb |
|---|---|---|
| `florida-man` | Florida Man | The state that keeps giving. |
| `hoa-housing` | HOA & Housing | Boards, bylaws, and doormats. |
| `bureaucracy` | Bureaucracy | Forms, offices, and the runaround. |
| `crime-weird` | Crime & Weird | The police report writes itself. |
| `only-in-america` | Only in America | You can't make this up. |
| `food-crime` | Food Crime | Crimes against the plate. |
| `fine-print` | Fine Print | The fee beneath the fee. |

Notes on assignment:
- `florida-man` is for a *person* doing something absurd, usually in Florida.
  A loose animal or a freak event in Florida is `crime-weird` or `only-in-america`.
- `crime-weird` fits anything where the police report itself is the joke, in any state.
- `only-in-america` takes the wholesome and the surreal: record attempts, viral
  animals, five generations with one birthday, a town turning out to hunt Bigfoot.
- `fine-print` is for hidden fees, junk fees, and deceptive subscription terms —
  usually a class action or an AG lawsuit.
- `food-crime` is thin and `fine-print` is thinner. Favour them when a legitimate
  candidate fits, to keep the category filter on the homepage useful.

Reactions are fixed: **WAT / LOL / SAME / DEAD**.

## 3. The voice

Exactly **two sentences**. First sentence lays out the facts flatly. Second
sentence lands a dry, understated observation — the twist, the reframe, or the
deadpan restatement of what the facts already imply.

Rules:
- Deadpan. No exclamation marks, no emoji, no "you won't believe".
- Never explain the joke. Never say the story is absurd; let it be absurd.
- Punch at institutions, bylaws, and bad decisions. Never at victims.
- Specifics are the comedy. "60 miles away", "63 Lego boxes", "$750 then another
  $500" — concrete detail beats adjectives every time.
- British/American spelling: American.
- Keep the person anonymous. Use "a Florida man", "a Chino man", "a Richmond
  doctor". Do not name private individuals even when the source does.

Calibration examples (all shipped):

> A deputy clocked him at 117 in a 70 on I-95, and he explained he was racing to
> the bathroom at Buc-ee's — 60 miles away. The sheriff allowed that the bathrooms
> are exceptionally clean, but suggested picking one closer than an hour out.

> A Chino man turned his front lawn into a working food garden — sweet potatoes,
> sugar cane, bananas, passion fruit — and the city declared it a nuisance. The
> first fine was $750, with another $500 queued up if the dandelions stay.

> Neighbors keep dumping on the brothers' land, and it's the brothers collecting
> the fines. The system found the victim first and stopped looking.

> Damariscotta police fielded an unusual volume of calls about a Sasquatch on Main
> Street, including one sighting at school drop-off. The case closed when an
> officer walked up and had a word with the man in the very convincing costume.

## 4. Hard rejects — never publish

These are not judgement calls. If any of the following is in the story, reject it
even if the headline is hilarious:

- Anything sexual involving a minor; child abuse, neglect, or endangerment
- Sexual assault, rape, indecent exposure, voyeurism, hidden cameras, grooming,
  sting operations targeting predators
- Animal cruelty, neglect, starvation, hoarding
- Domestic violence, strangulation, assault on a partner
- Serious violence or injury to a person; shootings; stabbings; weapons used
  against people; murder-for-hire; explosives; bomb or death threats
- Hate crimes and attacks on houses of worship
- Fraud with an identifiable vulnerable victim (elderly scam victims in particular)
- Suicide, human remains, missing-persons cases
- Partisan political content, and real named public figures

### The lesson that cost us the most

**Read the source before approving. A comedic headline routinely hides an ugly
case.** Three real examples from this project:

- *"Florida man dressed in G-string and sneakers arrested at Target"* — 71
  syndicated copies, looked like the perfect item. The source said he was touching
  himself, had women's underwear and sex toys in his car, and had a prior
  indecent-exposure conviction. **Rejected.**
- *"Bizarre 'Cat in the Hat' trend prompts police warning"* — sounded whimsical.
  It was an AI-generated image trend used to make violent threats against named
  schools. **Rejected.**
- *"Florida man dumped bag of urine, feces and hot sauce on ex"* — reads as
  classic absurd. The actual charge was domestic battery by strangulation.
  **Rejected after it had already been drafted.**

## 5. Soft rejects — usually not worth it

- **Not American.** The fetcher pulls a lot of UK, India, Nepal, Australia,
  Canada, Ireland and Ukraine "man fined for parking" stories. All out.
- **Already published.** Check `published.json` before curating. The same story
  re-enters `pending.json` for weeks.
- **Routine municipal business.** "City council sends food truck ordinance back to
  planning" is not absurd, it is Tuesday. A bureaucracy item needs a genuine
  absurdity: a 72-year-old loophole, a permit for goats, a fine for feeding
  vultures, AI that made the permit backlog worse.
- **Listicles, roundups, trend columns, history pieces, blotters.** "Five times
  sharks swam into Odd News headlines" is not an item.
- **Ordinary crime.** Moving-company scams, insurance fraud, DUI, speeding,
  shoplifting. Needs a hook, not just a charge.
- **Reddit-aggregator sites** (twistedsifter and similar) are anonymized and
  unverifiable. Usable occasionally for a pure HOA-absurdity story, but prefer a
  real outlet.

## 6. Deduplication — the single biggest time sink

The fetcher has no syndication filter, so one wire story arrives dozens of times.
Real counts from recent batches:

| Batch | Items | Distinct stories | Worst offender |
|---|---|---|---|
| 190 | 190 | 103 | G-string/Target ×71 |
| 142 | 142 | ~40 | England Airpark lease ×70 |
| 121 | 121 | ~45 | lobster diver air supply ×15 |
| 89 | 89 | 61 | G-string/Target ×9 |

**Always group by normalized title before reading anything.** Working one-liner:

```bash
git show origin/main:src/data/pending.json | python3 -c "
import json,sys
from collections import Counter
d=json.load(sys.stdin)
def norm(t): return ' '.join(t.lower().split())[:46]
c=Counter(norm(x.get('title','')) for x in d)
print('items',len(d),'distinct',len(c))
for t,n in c.most_common():
    ex=[x for x in d if norm(x.get('title',''))==t][0]
    print(f\"x{n:2d} |{ex['id'][-6:]}|{ex.get('category'):12s}|{ex.get('source_domain'):20s}|{ex.get('title','')[:64]}\")
"
```

When a story has many copies, keep **one**, and pick the best outlet: a real local
or national newsroom over an aggregator, SEO farm, or foreign reprint. Prefer the
outlet closest to the event (the local station that covered it).

## 7. Filling the fields

- **`comment`** — two sentences, per §3. The deliverable.
- **`city` / `state`** — look them up in the source. The detail page renders them
  as a "City, State" line. **Leave blank rather than guess.** When the source only
  establishes the state, fill the state and leave the city empty. Watch out: the
  outlet's city is often not the story's city (Boca Raton Tribune covering a Lake
  Worth Beach arrest; a Gray TV station in Montana reprinting a Florida story).
- **`status`** — `REAL`.
- **`source_url`** — the fetcher leaves this **empty** and puts the real link in
  `external_url`. Copy it across or the card renders "Source: X · unverified".
- **`category`** — fix the fetcher's guess. It assigns a default per RSS source
  and is frequently wrong (a viral raccoon arrived as `crime-weird`).
- **`body` / `whyAmericaWhat`** — leave empty.

## 8. Target yield

Roughly **5–10 approved items per batch**, whatever the batch size. A 190-item
batch yielded 10; a 142-item batch yielded 6. Low yield is the system working.
Do not pad the list to hit a number.
