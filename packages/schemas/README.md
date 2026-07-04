# Shared schemas

Single source of truth for the data contract, in three mirrored forms:

| Form | Location | Used by |
|---|---|---|
| JSON Schema (this folder) | `packages/schemas/*.schema.json` | external integrations, validation in scripts |
| Pydantic | `apps/api/app/schemas/` | backend runtime validation |
| TypeScript | `apps/web/lib/types.ts` | frontend type safety |

**Rule: change one → change all three.** The backend also exposes the live
contract as OpenAPI at `http://localhost:8000/docs` (auto-generated from the
Pydantic models), which is the fastest way to check the current truth.

`reaction.schema.json` (minus server-filled fields) is also handed to vLLM
guided decoding / Fireworks `response_format` so real models are constrained
to schema-valid output — see `apps/api/app/services/inference/prompts.py`.
