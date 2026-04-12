   
**GEO Visibility Analyzer**

Product Requirements Document

 

Version 1.0  ·  *Confidential*

# **1\. Product Overview**

**Purpose**

GEO Visibility Analyzer is a web-based tool that measures how visible a company is inside AI-generated responses — across ChatGPT, Claude, Perplexity, and Gemini — and tells them exactly what to do about it.

The product addresses a gap in the current market: tools like Otterly.ai score visibility but stop there. GEO Visibility Analyzer adds a diagnostic and recommendation layer, surfacing the specific levers a company needs to pull and generating ready-to-use assets to pull them.

**The core problem**

As users increasingly ask AI assistants for recommendations — "best project management software," "top CRM for small business" — brand visibility inside those responses has become a new form of competitive exposure. A company can have strong SEO and be nearly invisible in AI-generated answers, or vice versa. Unlike SEO, there is no established toolkit for diagnosing or improving this visibility.

GEO Visibility Analyzer gives companies the equivalent of an SEO audit, applied to AI response presence.

**Primary users**

* Marketing leaders and growth teams at B2B SaaS companies

* SEO and content strategists expanding their remit to AI search

* Digital agencies managing brand presence for clients

* Founders and operators of SMBs with no dedicated marketing function

**Key differentiators**

* Fully automated from URL entry — no manual setup of prompts or competitors

* Four-category diagnostic framework with individual scores, not just an aggregate

* Actionable recommendations with generated, ready-to-use copy assets

* Prioritized by impact and closability, not just severity

 

# **2\. User Flow**

The product has a single linear flow from URL entry to scored results, with a drill-down layer for recommendations.

**Step 1 — URL entry**

User enters a website URL. No account required for MVP, but will be added in next phase. The UI shows a single input with a prominent call to action. No additional configuration is asked for at this stage — the system infers everything it needs from the URL.

**Step 2 — Automated inference (background)**

The system crawls the URL and runs a structured inference pipeline:

* Scrape homepage, /about, and /pricing pages

* Extract: company name, one-sentence description, product category, primary use case, target customer segment

* Generate 15–25 probe prompts across three types: discovery, comparison, and job-to-be-done

* Infer 4–6 likely competitors from the business description and category

All inference is powered by Claude. The user sees a progress state while this runs, with live status updates showing what the system is doing. Typical duration: 30–60 seconds for inference, 2–4 minutes for full probe execution.

**Step 3 — Probe execution (background)**

The system runs each generated prompt against each connected AI platform. Probes run in parallel across platforms. Results are stored per prompt, per platform, with full response text and extracted citation data where available.

**Step 4 — Scoring and assessment**

Once probes complete, the system runs a scoring pass across all four categories and produces a results page. The user sees:

* A summary header: company name, category, inferred competitors, date

* Four category score cards, each with a 0–100 score and a severity label

* A prioritized action queue showing the top 3 highest-priority fixes across all categories

**Step 5 — Category drill-down**

The user clicks any category card to open a detail view. The detail view contains:

* Score breakdown by component, showing where points were lost

* Diagnostic narrative explaining what the score means for this specific company

* Ranked list of recommendations for this category

* For each recommendation: why it matters, specific actions, effort level, affected platforms, and a generated copy asset ready to use

**Step 6 — Export and re-run**

(Non-MVP) Users can export the full report as a PDF. Authenticated users can save a report and schedule automated re-runs to track scores over time.

# **3\. Inference Pipeline**

The inference pipeline transforms a raw URL into the structured inputs the probe engine needs. It runs entirely server-side and the user does not configure any of its outputs, though they can review and edit inferred values before probes run (optional, accessible via an 'Review inputs' panel).

**3.1  Crawl**

Target pages: homepage, /about (or /about-us), /pricing, /product. The crawler fetches rendered HTML using a headless browser to handle JavaScript-rendered content. It extracts the visible text content of each page, stripping navigation, footer boilerplate, and cookie banners.

Output: 3–4 plain-text page extracts, typically 500–2000 words each.

**3.2  Business understanding**

A single Claude call processes all page extracts and returns a structured JSON object:

| Inference output schema company\_name  —  string canonical\_description  —  string, max 30 words, category \+ use case \+ differentiator category  —  string, the product category as a common noun phrase primary\_use\_case  —  string target\_customer  —  string competitors  —  array of 4–6 strings, inferred from positioning and copy confidence  —  low / medium / high, for each field |
| :---- |

 

Low-confidence fields are flagged in the 'Review inputs' panel so users can correct them before probes run.

**3.3  Probe generation**

A second Claude call takes the business understanding output and generates probe prompts across three types:

| Discovery | "Best \[category\] tools" · "Top \[category\] software for \[use case\]" · "What is the best \[category\] for \[target customer\]" |
| :---- | :---- |
| **Comparison** | "\[Company\] vs \[Competitor A\]" · "\[Company\] vs \[Competitor B\]" · "Is \[Company\] better than \[Competitor\]" |
| **Job-to-be-done** | "How do I \[primary use case\]" · "Software to help me \[use case\]" · "Tools for \[target customer\] to \[use case\]" |

 

Target: 5–8 prompts per type, 15–25 total. Prompts are deduplicated and reviewed for relevance before execution.

 

# **4\. Probe Engine**

**4.1  Platform coverage**

| ChatGPT (GPT-4o) | OpenAI API · no web retrieval by default · pure training-based responses |
| :---- | :---- |
| **Claude (Sonnet)** | Anthropic API · no web retrieval · pure training-based responses |
| **Perplexity** | Perplexity API · llama-3.1-sonar-large model · live web retrieval with citations |
| **Gemini** | Google Generative AI API · Gemini 1.5 Pro with Grounding · live web retrieval |

 

**4.2  Probe execution**

Each probe prompt is sent to each platform independently. Requests are parallelized within platform rate limits using a job queue (Inngest or equivalent). A single report run triggers approximately 75–125 API calls total (25 prompts × 4 platforms, with some variation by platform).

Each response is stored in full with metadata: prompt ID, platform, timestamp, raw response text, extracted citations (for retrieval platforms), response latency.

**4.3  Response parsing**

A structured extraction pass runs on each response after collection. A Claude call processes each response and extracts:

* was\_mentioned  —  boolean, was the brand name present in the response

* mention\_positions  —  array of integers, position(s) in any ranked list where brand appeared

* recommendation\_strength  —  none / hedged / confident, qualitative classification

* competitor\_mentions  —  array of competitor names found in the response

* cited\_urls  —  array of URLs cited (retrieval platforms only)

* cited\_domains  —  array of root domains from citations

 

# **5\. Scoring Model**

Each of the four categories is scored independently on a 0–100 scale. Scores are computed from objective measurements where possible and from structured Claude judgments where subjective assessment is required. All Claude judgment calls use a fixed rubric to ensure consistency.

 

## **5.1  Entity Recognition Score**

Measures how consistently and clearly the brand is described across the surfaces an LLM training corpus would encounter. High variance in how a company describes itself creates ambiguity in a model's internal representation.

Data sources: brand's own site, G2, Capterra, Crunchbase, LinkedIn, AngelList, Wikipedia.

 

| Component | Max pts | How to measure |
| :---- | :---- | :---- |
| Description consistency | 40 | Embed all external descriptions using a text embedding model. Compute pairwise cosine similarity and average. 0.90+ \= 40pts · 0.80–0.89 \= 28pts · 0.70–0.79 \= 16pts · below 0.70 \= 0pts |
| Schema markup | 20 | Organization schema present on homepage \= 20pts. Partial or absent \= 0pts |
| Profile completeness | 20 | Check G2, Capterra, Crunchbase, LinkedIn — 5pts each if description exists and matches canonical |
| Wikipedia presence | 10 | Article exists with a product description \= 10pts. No article \= 0pts |
| Description specificity | 10 | Claude judges whether description names a specific category and use case vs vague language. Specific \= 10pts · vague \= 0–5pts |

 

| Severity thresholds 80–100  —  Healthy. Entity coherence is strong. 60–79   —  Moderate. Some profile inconsistency. Low-effort fixes available. 40–59   —  Weak. Significant variance across profiles. Priority fix. 0–39    —  Critical. Model likely has no confident entity representation. |
| :---- |

 

## **5.2  Category Association Score**

Measures how reliably the brand is surfaced when a model generates recommendations for its product category. This is scored relative to the competitive set, not on an absolute scale.

Data sources: discovery probe responses across all platforms.

 

| Component | Max pts | How to measure |
| :---- | :---- | :---- |
| Discovery prompt mention rate | 40 | Percentage of discovery prompts where brand appears. 80%+ \= 40pts, scaled linearly to 0% \= 0pts |
| Position when mentioned | 20 | Average rank position across all mentions in list responses. Position 1 \= 20pts · Position 5 \= 4pts · Not in list \= 0pts. Linear interpolation between. |
| Competitor gap | 20 | Brand mention rate vs median competitor mention rate. At or above median \= 20pts · 50% of median \= 10pts · below 25% of median \= 0pts |
| Cross-platform consistency | 20 | Mentioned on 4 platforms \= 20pts · 3 \= 15pts · 2 \= 8pts · 1 \= 0pts |

 

| Interpretation note The competitor gap component is the most diagnostic. A 40% mention rate looks different if the category median is 35% (competitive) vs 80% (significant gap). The score is always presented alongside the competitive context, not as a standalone number. |
| :---- |

 

## **5.3  Retrieval Score**

Measures visibility on platforms that use live web retrieval to generate responses. Perplexity and Gemini Grounding pull from the current web, so this score is more directly influenced by content and SEO than the other categories.

Data sources: Perplexity and Gemini Grounding probe responses with citation data.

 

| Component | Max pts | How to measure |
| :---- | :---- | :---- |
| Mention rate on retrieval platforms | 30 | Percentage of probes where brand appears, scoped to Perplexity and Gemini only. Same linear scale as category association. |
| Direct URL citation rate | 30 | Percentage of responses where a brand-owned URL is cited as a source. Any direct citation \= strong signal. 50%+ \= 30pts, scaled linearly. |
| Roundup presence | 20 | Web search for top 10 "best \[category\]" results. Count how many include brand vs competitors. Score as percentile within competitive set. |
| Content format match | 20 | Claude reviews domains cited for competitors and judges whether brand has equivalent content types. Full coverage \= 20pts · partial \= 10pts · none \= 0pts |

 

| Why citation rate is the key signal A brand cited by URL in a Perplexity response means the model found that specific page authoritative enough to surface as a source. This is the highest-confidence positive signal in the retrieval score — stronger than a mention alone, because it ties visibility to a specific, actionable content asset. |
| :---- |

 

## **5.4  Social Proof Score**

Measures the density and distribution of third-party signals about the brand. LLMs absorb the texture of how companies are discussed — review volume, community presence, editorial coverage — and this affects both training-based and retrieval-based visibility.

Data sources: G2, Capterra, Product Hunt, Reddit, web search for editorial listicles.

 

| Component | Max pts | How to measure |
| :---- | :---- | :---- |
| G2 review volume (percentile) | 25 | Rank brand within competitive set by G2 review count. Top quartile \= 25pts · median \= 12pts · bottom quartile \= 0pts |
| Capterra review volume (percentile) | 15 | Same method as G2, lower weighting |
| Reddit mention frequency | 20 | Search brand name in relevant subreddits over past 12 months. Score as percentile within competitive set. Weight threads with recommendations higher than mentions. |
| Listicle appearances | 25 | "Best \[category\]" web search, top 20 results. Count appearances for brand vs most-listed competitor. Score \= (brand count / top competitor count) × 25 |
| Product Hunt presence | 15 | Listed with 500+ upvotes \= 15pts · 100–499 \= 10pts · listed under 100 \= 5pts · not listed \= 0pts |

 

| On Reddit as a signal Reddit threads are conversational, opinionated, and crawled heavily by retrieval models. A brand with strong Reddit presence — not just mentions, but threads where users actively recommend it — has a qualitative authority signal that review counts don't capture. Perplexity in particular surfaces Reddit frequently in category discovery responses. |
| :---- |

 

## **5.5  Composite Priority Score**

The priority score is used to rank recommendations across all four categories. It reflects not just the severity of a gap, but how quickly it can be closed.

| Priority formula Priority \= (100 − raw\_score) × closability\_weight Closability weights Entity Recognition  ·  0.9  (fixes take 1–3 days) Retrieval  ·  0.7  (fixes take 2–6 weeks with content production) Category Association  ·  0.4  (takes 2–4 months of consistent presence building) Social Proof  ·  0.2  (takes 6+ months to move meaningfully) |
| :---- |

 

Example: Entity score of 40 → priority (100−40) × 0.9 \= 54\. Social proof score of 20 → priority (100−20) × 0.2 \= 16\. The entity gap surfaces first in the action queue even though the absolute social proof gap is larger.

 

# **6\. Results Interface**

**6.1  Results summary page**

The summary page is the first thing a user sees after analysis completes. It is designed to be scannable in under 30 seconds and actionable without clicking into any detail view.

**Header strip**

* Company name and inferred category

* Detected competitors (chips, each linking to their own report if run)

* Report date and number of probes run

* 'Review inputs' link to inspect and edit inferred values

**Score cards (4 cards in a 2×2 grid)**

* Category name and icon

* Score as a large number (0–100)

* Severity label: Healthy / Moderate / Weak / Critical

* One-sentence plain-English summary of the primary issue

* Click to open detail view

**Priority action queue**

Below the score cards: a ranked list of the top 3 highest-priority recommendations across all categories. Each item shows category tag, recommendation title, effort level, and a 'View' link. This is the entry point for users who want to act immediately without reading the full breakdown.

**6.2  Category detail view**

Opens as a slide-over panel or a dedicated page (mobile/desktop decision deferred to implementation). Contains:

**Score breakdown**

A table showing each scoring component, the points earned, and the maximum. Components where the brand scored zero are highlighted. This is the diagnostic heart of the detail view — users can see exactly where they lost points.

**Diagnostic narrative**

2–3 paragraphs generated by Claude, specific to this company. Explains what the score means in plain language, references the competitive context (e.g. 'Your mention rate of 22% compares to a category median of 61%'), and frames the recommendations that follow.

**Recommendations**

A ranked list of recommendations for this category, ordered by priority score. Each recommendation is an expandable card containing:

* Title — action-oriented, max 8 words

* Effort label — e.g. '1–2 days', '2–4 weeks'

* Affected platforms — which AI platforms this fix impacts

* Why this matters — 2–3 sentences specific to this company

* Actions — numbered list of 3–5 concrete, specific steps

* Copy asset — a generated, ready-to-use artifact the user can immediately apply

**6.3  Copy assets by category**

Each recommendation type produces a different kind of copy asset:

| Entity | Canonical entity description — a standardized one-sentence description optimized for consistency, formatted for immediate use across G2, Crunchbase, LinkedIn, and Capterra profiles |
| :---- | :---- |
| **Category** | Comparison page brief — a content outline for a '\[Brand\] vs \[Competitor\]' page, with suggested H2s, key differentiators to cover, and target word count |
| **Retrieval** | Content brief — a full brief for a high-priority retrieval gap, including target query, recommended structure, specific questions to answer, suggested schema markup, and estimated impact |
| **Social proof** | Review request template — a short, non-pushy email or in-app message template for requesting G2 or Capterra reviews from current customers |

 

# **7\. Technical Architecture**

**7.1  Stack**

| Frontend | Next.js (App Router) · Tailwind CSS · shadcn/ui |
| :---- | :---- |
| **Backend** | Next.js API routes for orchestration · Node.js |
| **Database** | PostgreSQL via Neon or Supabase · stores reports, probe results, scores |
| **Job queue** | Inngest or Trigger.dev · handles async probe execution and retries |
| **Crawler** | Playwright (headless) · handles JS-rendered pages |
| **AI inference** | Anthropic Claude API for all generation and judgment calls |
| **Platform probes** | OpenAI API · Anthropic API · Perplexity API · Google Generative AI API |
| **Auth (v2)** | Clerk or NextAuth · required for saved reports and scheduled re-runs |

 

**7.2  Data model (simplified)**

| reports | id, url, created\_at, status, company\_name, category, competitors\[\], inference\_json |
| :---- | :---- |
| **probes** | id, report\_id, prompt\_text, prompt\_type, platform, response\_text, parsed\_json, citations\[\] |
| **scores** | id, report\_id, category, raw\_score, component\_scores\_json, priority\_score |
| **recommendations** | id, score\_id, title, type, effort, priority, actions\[\], copy\_asset\_text |

 

**7.3  Cost per report**

Estimated API cost for a single full report run at 20 probes × 4 platforms:

| Inference (crawl \+ understanding \+ probe generation) | \~$0.05 — 1–2 Claude calls on long context |
| :---- | :---- |
| **Probe execution — ChatGPT (GPT-4o)** | \~$0.15 — 20 calls at \~$0.008/call average |
| **Probe execution — Claude (Sonnet)** | \~$0.10 — 20 calls |
| **Probe execution — Perplexity** | \~$0.20 — 20 calls at \~$0.01/call |
| **Probe execution — Gemini** | \~$0.08 — 20 calls |
| **Response parsing \+ scoring (Claude)** | \~$0.15 — structured extraction on 80 responses |
| **Recommendation generation (Claude)** | \~$0.10 — 4 category calls |
| **Total per report** | \~$0.80–$1.20 |

 

At a $29/month entry price with 10 reports included, this yields approximately 70–75% gross margin on API costs before infrastructure. Scheduled re-runs can share probe caching where responses are unlikely to change within 24 hours.

 

# **8\. Scope and Phasing**

**V1 — Core product (this document)**

* URL entry → full automated pipeline → 4-category scored report

* Category detail views with ranked recommendations and copy assets

* Priority action queue on summary page

* PDF export of full report

* No auth required for first run; email gate to view full results

**V2 — Tracking and accounts**

* User accounts with saved reports

* Scheduled re-runs (weekly or monthly) with score trend charts

* Alert on significant score change (±10 points in any category)

* Competitor tracking — run reports on competitor URLs and compare

**V3 — Depth and integrations**

* SearchGPT coverage when a stable API or automation path becomes viable

* Slack or email delivery of weekly score summaries

* CMS integration — publish recommended content briefs directly to a connected CMS

* Team workspace — share reports across multiple users

**Out of scope (all versions)**

* Website technical SEO analysis — explicitly excluded; focus is AI visibility only

* Paid placement or 'optimization as a service' — tool is diagnostic and generative only

* Real-time monitoring of individual AI responses in production

 

# **9\. Open Questions**

| Probe count vs cost | Is 20 prompts per platform the right balance? More probes \= more accurate mention rates but higher cost per report. Consider user-selectable depth: Quick (10 probes) vs Full (25 probes). |
| :---- | :---- |
| **Zero-review companies** | How to score social proof for early-stage companies with no G2 presence at all? Null data is meaningful (the recommendation is 'get listed') but shouldn't collapse the score to zero in a misleading way. |
| **Inference confidence** | What is the right UX when crawl confidence is low — e.g. a company whose homepage is mostly marketing imagery with little text? Gate the run or proceed with a warning? |
| **Competitor inference accuracy** | Claude's competitor inference from a homepage is reasonably accurate for established categories but unreliable for new or niche categories. Should users always be given a chance to edit competitors before probes run? |
| **Caching strategy** | Probe responses for common discovery prompts ("best CRM software") are largely the same across reports. Caching these responses for 24–48 hours would reduce cost significantly but introduces staleness risk. |
| **Perplexity API limits** | Perplexity's API is rate-limited more aggressively than OpenAI or Anthropic. Queue management and retry logic for Perplexity calls needs dedicated attention. |
| **Score gaming** | As this tool becomes known, companies will optimize for the score rather than genuine visibility improvement. How do we construct scoring components that are harder to game without actually improving underlying visibility? |

 