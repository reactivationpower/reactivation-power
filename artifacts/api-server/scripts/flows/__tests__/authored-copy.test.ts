// flows:lint only reads content/flows/*.json. Script copy is also authored
// in code: the demo seed (call notes, complaints), the provider tokens the
// player merges into every Open, the merge fallbacks, and the web player's
// step fixtures. A retired close or a banned stock phrase in any of those
// reaches a caller (or a reviewer of the demo) without the linter noticing,
// so this test walks the string literals of those files with the same
// phrase lists the linter uses.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { BANNED_PHRASES, RETIRED_PHRASES, normalisePhraseText } from '../lint.ts'

const ROOT = resolve(fileURLToPath(new URL('../../../../..', import.meta.url)))

/**
 * Every non-flow-file place spoken or caller-facing copy is authored in
 * code. When a new seed, fixture or inline default is added, list it here.
 */
export const AUTHORED_COPY_SOURCES: string[] = [
  // demo account: seeded contacts, complaints, call notes and outcome notes
  'artifacts/api-server/src/lib/demo/seed.ts',
  'artifacts/api-server/src/lib/demo/config.ts',
  'artifacts/api-server/src/lib/demo/sample-csv.ts',
  'artifacts/reactivation-power/src/lib/demo/config.ts',
  'artifacts/reactivation-power/src/lib/demo/sample-csv.ts',
  // tokens and fallbacks the player merges into every script
  'artifacts/reactivation-power/src/lib/provider-name.ts',
  'artifacts/reactivation-power/src/lib/script-merge.ts',
  // step fixtures the web player and practice mode render in tests
  'artifacts/reactivation-power/src/lib/script-merge.test.ts',
  'artifacts/reactivation-power/src/components/reactivation/practice-log-preview.test.tsx',
  'artifacts/reactivation-power/src/components/reactivation/script-flow-player.test.tsx',
  'artifacts/reactivation-power/src/components/reactivation/script-flow-player-other-concern.test.tsx',
  'artifacts/reactivation-power/src/components/reactivation/script-flow-player-parent-mode.test.tsx',
  'artifacts/reactivation-power/src/components/reactivation/script-flow-player-tokens.test.ts',
]

interface Literal {
  line: number
  text: string
}

/** String, template and JSX text literals of a TS/TSX file, comments excluded. */
export function stringLiteralsOf(relPath: string): Literal[] {
  const abs = resolve(ROOT, relPath)
  const source = readFileSync(abs, 'utf8')
  const sf = ts.createSourceFile(abs, source, ts.ScriptTarget.Latest, true, relPath.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out: Literal[] = []
  const add = (node: ts.Node, text: string) => {
    if (!text.trim()) return
    out.push({ line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text })
  }
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node, node.text)
    else if (ts.isTemplateExpression(node)) {
      // Join the literal pieces so a phrase split around `${x}` still matches
      // when the interpolation sits inside it.
      add(node, [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(' '))
    } else if (ts.isJsxText(node)) add(node, node.text)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

export function findPhrases(relPath: string): string[] {
  const hits: string[] = []
  for (const { line, text } of stringLiteralsOf(relPath)) {
    const normalised = normalisePhraseText(text)
    for (const phrase of RETIRED_PHRASES) {
      if (normalised.includes(phrase)) hits.push(`${relPath}:${line} retired close "${phrase}"`)
    }
    for (const phrase of BANNED_PHRASES) {
      if (normalised.includes(phrase)) hits.push(`${relPath}:${line} banned phrase "${phrase}"`)
    }
  }
  return hits
}

describe('authored script copy outside content/flows', () => {
  it('lists only files that exist (update the list when a source moves)', () => {
    const missing = AUTHORED_COPY_SOURCES.filter((p) => !existsSync(resolve(ROOT, p)))
    expect(missing).toEqual([])
  })

  it('extracts literals and normalises typography the way the linter does', () => {
    const hit = findPhrases(AUTHORED_COPY_SOURCES[0])
    expect(Array.isArray(hit)).toBe(true)
    // Curly apostrophes must not hide a phrase.
    expect(normalisePhraseText('I\u2019d be honored\u2026')).toBe("i'd be honored...")
  })

  for (const relPath of AUTHORED_COPY_SOURCES) {
    it(`${relPath} has no banned or retired phrase`, () => {
      expect(findPhrases(relPath)).toEqual([])
    })
  }
})
