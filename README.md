# Lens

**Audit any AI shopping recommendation.** Paste an answer from ChatGPT, Claude, Gemini, or Amazon Rufus. Lens re-solves the problem with live product data, shows you the spec-optimal pick for your stated criteria, flags every attribute claim the AI got wrong, and shows where three other frontier models disagree.

Built with Claude Opus 4.7 for the *Built with Opus 4.7: a Claude Code Hackathon* (Apr 21-26, 2026). Track: **Build From What You Know**.

## Why this exists

A peer-reviewed study of 18 frontier models across 382,000 shopping trials (Affonso et al., submitted to Nature, 2026) found AI shopping assistants recommend a non-optimal product 21% of the time and confabulate the reasons in 86% of cases. Lens is the welfare fix: a tool that audits any AI shopping answer in under 20 seconds with live product data.

## How it works

Four steps in parallel, all running on a Cloudflare Worker calling Claude Opus 4.7:

1. **Extract** — extended thinking decomposes the assistant's reasoning trace into user criteria, the product it picked, and the attribute claims it cited.
2. **Search** — Opus 4.7's web search tool pulls the top 10-20 products matching the user's criteria from live catalog pages.
3. **Verify + rank** — 1M context holds every spec sheet alongside every cited claim. Lens flags every contradiction, derives a utility function from the user's own words, and ranks the candidates. User can tweak weights; ranking re-computes live.
4. **Cross-check** — a Claude Managed Agent runs the same question through three other frontier models in parallel, returns a disagreement map.

## Install (developer, load-unpacked)

```bash
pnpm install
pnpm -w build
# Load apps/extension/dist as an unpacked Chrome extension
# Deploy the Worker:
cd workers/api && pnpm wrangler deploy
```

## Repo layout

See `../BUILD_PLAN.md` in the enclosing planning folder for the full architecture.

## License

MIT. See `LICENSE`.

## Acknowledgments

Claude Opus 4.7 (Anthropic). Claude Managed Agents platform. The paper's 18 cooperating model providers (Anthropic, OpenAI, Google, OpenRouter). The Cerebral Valley + Anthropic team for running the hackathon.
