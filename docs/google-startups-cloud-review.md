# Google for Startups Cloud Program — what the review asked for

Google declined the MAIKNOWLEDGE LLP application on 12 Aug 2026. The reviewer's
reasons, verbatim:

> Currently, your public website is primarily descriptive and does not yet
> contain enough specific, granular information for us to fully determine
> eligibility according to our program standards.

> **Team and Company Information:** Key members and their relevant experience,
> including direct links to their professional social profiles (both team and
> company LinkedIn and founding date).

> **Products:** Clear evidence of what you are building, including a product
> walkthrough, screenshots, or a demo of the product in action, its features,
> and its current stage of development.

> Please note that we are unable to evaluate applications based on documentation
> or pitch decks provided via email; all relevant information must be accessible
> on your public-facing website.

Everything must be on the **public** site. The pitch deck at `/pitch` is
password-gated, so it does not count.

## What is now on the site

| Requirement | Where |
| --- | --- |
| Key members + relevant experience | `#team` — founder card with role and three experience points |
| Direct link to founder's LinkedIn | `#team` — "Founder on LinkedIn" button |
| Direct link to company LinkedIn | `#team` and the footer social button |
| Founding date | `#team` — company facts table, plus `foundingDate` in the JSON-LD |
| Product walkthrough / screenshots | `#product` — six numbered steps, each with a real app screenshot |
| Features | `#product` walkthrough steps and the "Shipping today" column |
| Current stage of development | `#product` — "Where each product actually stands" (shipping / in development / research), plus how it is built, how you get it, and validation timing |

The legal identity (LLPIN ADA-6560, registered office) was already in the
footer and is repeated in the team section's company table.

## Before this goes live

Three facts are not in this repo, so they are committed as placeholders:

```
TODO_FOUNDER_LINKEDIN_URL   the founder's LinkedIn profile URL
TODO_COMPANY_LINKEDIN_URL   the MAIKNOWLEDGE LLP company page URL
TODO_FOUNDING_DATE          founding date as displayed, e.g. "12 March 2026"
TODO_FOUNDING_DATE_ISO      the same date as YYYY-MM-DD, for the JSON-LD
```

Run this to find any that are left:

```sh
bash scripts/check-placeholders.sh
```

If there is no company LinkedIn page yet, create one before replying to Google —
the reviewer asked for both the personal and the company profile by name.

Cloudflare Pages publishes from `main`, so nothing reaches maiknowledge.in until
this branch is merged. Fill in the placeholders first.

## Why the site looked "primarily descriptive"

Worth knowing, because it probably shaped the review. The page markup lives
inside a component element that `support.js` hides
(`display:none !important`) until it has fetched React, ReactDOM and Babel
(~3.2 MB) from unpkg.com and hydrated. Until then the page has **no visible
text at all** — a measured 0 characters. Any visitor whose network blocks or
throttles unpkg saw a blank white page, and the content lists rendered as
literal `{{ l.label }}` placeholders.

Three changes fix that, and they are the reason the walkthrough and team
sections are plain HTML rather than template bindings:

1. The 16 `sc-for` template lists were expanded to static HTML, so the content
   exists in the document as served.
2. A dependency-free guard in `index.html` shows the static markup if the
   runtime has not appeared within 3 seconds, and hands control back if it
   arrives late.
3. `experience.css` carries the `.mk-failsafe` rules that guard uses.

Measured after the change: the page renders 16,001 characters of text and all
images with the CDN reachable **and** with it fully blocked.
