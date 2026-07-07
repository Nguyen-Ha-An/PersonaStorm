import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Read the canonical JSON Schema from the monorepo package (vitest cwd = apps/web).
const schema = JSON.parse(
  readFileSync(
    join(process.cwd(), '..', '..', 'packages', 'schemas', 'report.schema.json'),
    'utf8',
  ),
) as { title: string; required: string[]; properties: Record<string, any> }

describe('report.schema.json — verdict / top_actions additions', () => {
  it('declares an optional verdict object with the four derived fields', () => {
    const v = schema.properties.verdict
    expect(v).toBeTruthy()
    expect(v.required).toEqual(['level', 'headline', 'rationale', 'caveated'])
    expect(v.properties.level.enum).toEqual(['strong', 'conditional', 'weak'])
    // additive + optional — never added to the top-level required list
    expect(schema.required).not.toContain('verdict')
  })

  it('declares top_actions as an array capped at 3 with anchor-linked items', () => {
    const ta = schema.properties.top_actions
    expect(ta.type).toBe('array')
    expect(ta.maxItems).toBe(3)
    expect(ta.items.required).toContain('anchorId')
    expect(schema.required).not.toContain('top_actions')
  })

  it('remains the StormReport schema (additive change only)', () => {
    expect(schema.title).toBe('StormReport')
    expect(schema.properties.overall).toBeTruthy()
  })
})
