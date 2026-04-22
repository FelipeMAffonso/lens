# Knowledge Packs

This directory contains all Lens Knowledge Packs. Packs are the versioned, typed, community-contributable knowledge modules that give Lens category expertise, dark-pattern detection rules, jurisdictional regulation awareness, fee taxonomy, and intervention templates.

See [`SCHEMA.md`](./SCHEMA.md) for the pack schema, [`docs/KNOWLEDGE_ARCHITECTURE.md`](../docs/KNOWLEDGE_ARCHITECTURE.md) for the design rationale, and [`docs/JOURNEY_INTEGRATION.md`](../docs/JOURNEY_INTEGRATION.md) for how packs flow through the nine customer-journey stages.

## Current pack inventory

| Type | Count | Path |
|---|---|---|
| Category | 5 | `packs/category/*.json` |
| Dark pattern | 5 | `packs/dark-pattern/*.json` |
| Regulation | 4 | `packs/regulation/*.json` |
| Fee | 3 | `packs/fee/*.json` |
| Intervention | 3 | `packs/intervention/*.json` |
| **Total** | **20** | |

This is the hackathon-week starter set. The long-term target is hundreds of packs across jurisdictions and categories, community-authored.

## Contributing a new pack

1. Choose the type and read the corresponding schema section in `SCHEMA.md`.
2. Copy an existing pack of the same type as a starting template.
3. Fill in the fields. Every factual claim in the body must cite an entry in the `evidence` array with a primary URL and retrieval date.
4. Run the validator: `npm run packs:validate` (from the repo root).
5. Open a PR. Reviewers check the schema, the evidence trail, and the applicability filters.
6. On merge, the pack is published with a new semver version and becomes available in the next Worker deployment.

## Pack status lifecycle

- `draft` — authored but not reviewed
- `reviewed` — reviewer signatures attached
- `published` — live in Worker (shipped to clients)
- `deprecated` — superseded by a newer version; old version kept for audit
- `retired` — no longer applicable (e.g. regulation vacated); not selected by runtime

Retired packs remain queryable for historical audits. Lens never deletes pack history.

## Versioning

Packs use semver. A pack's `slug` is stable across versions; the version number increments on any change:

- **Major** — schema change or substantive field removal
- **Minor** — new optional fields or additional evidence entries
- **Patch** — typo fixes, clarifications that do not change semantics

Once published, a pack version is immutable. Edits create a new version.
