/**
 * Ladder Logic Model
 *
 * Turns a rung's boolean condition string into a tree that can be DRAWN as
 * ladder logic, evaluated, power-flow highlighted, and edited by the player on
 * the laptop — then serialised straight back to the same condition-string
 * dialect `scanCycle.evaluateCondition` runs.
 *
 * This module is PURE TypeScript — no React, no Three.js (architecture rule 1).
 *
 * Grammar (exactly what scanCycle.evaluateCondition accepts):
 *   Or   := And ('OR' And)*
 *   And  := Not ('AND' Not)*
 *   Not  := 'NOT'? Prim
 *   Prim := '(' Or ')' | TAG
 *
 * A TAG is any whitespace-delimited token that is not a keyword or a paren, so
 * both the S01 dialect (`I0.0`, `M0.0`) and the Allen-Bradley dialect
 * (`I:1/00`, `O:2/02`) tokenize without special-casing.
 */

// --- Tree ---------------------------------------------------------------

/** A single examine-on/examine-off contact. `negated` renders as `-|/|-`. */
export interface ContactNode {
  kind: 'contact'
  tag: string
  negated: boolean
}

/** Elements wired end to end on one rung line — all must conduct. */
export interface SeriesNode {
  kind: 'series'
  children: LadderNode[]
}

/** A branch: parallel legs, any one of which can carry power. */
export interface ParallelNode {
  kind: 'parallel'
  children: LadderNode[]
}

/**
 * Any rung, as drawable ladder.
 *
 * There is deliberately NO 'not' node. `parseCondition` pushes every NOT down
 * to the contacts with De Morgan, so the only things that survive are the three
 * shapes a ladder editor knows how to render: a contact, a run of elements in
 * series, and a branch. That is why an undrawable rung is IMPOSSIBLE here
 * rather than merely unlikely — the renderer's switch over `kind` is total, and
 * no condition string, however parenthesised or however deeply negated, can
 * produce a fourth case for it to fall through.
 */
export type LadderNode = ContactNode | SeriesNode | ParallelNode

/** Child indices from the root. `[]` addresses the root itself. */
export type LadderPath = number[]

type GroupKind = 'series' | 'parallel'

// --- Construction helpers ----------------------------------------------

export function contact(tag: string, negated = false): ContactNode {
  return { kind: 'contact', tag, negated }
}

/**
 * Build a series/parallel node in canonical form:
 *  - same-kind children are spliced in, so series(series(a,b),c) => series(a,b,c)
 *  - a single child collapses to itself (no one-element branches)
 * Both invariants are what make serialisation round-trip exactly.
 */
function group(kind: GroupKind, children: LadderNode[]): LadderNode {
  const flat: LadderNode[] = []
  for (const child of children) {
    if (child.kind === kind) flat.push(...child.children)
    else flat.push(child)
  }
  if (flat.length === 0) {
    throw new Error(`ladder: cannot build an empty ${kind} group`)
  }
  if (flat.length === 1) return flat[0]
  return kind === 'series'
    ? { kind: 'series', children: flat }
    : { kind: 'parallel', children: flat }
}

export function series(...children: LadderNode[]): LadderNode {
  return group('series', children)
}

export function parallel(...children: LadderNode[]): LadderNode {
  return group('parallel', children)
}

/** Deep copy. Node identity is meaningful (see `evaluateFlow`), so inserts clone. */
export function cloneNode(node: LadderNode): LadderNode {
  if (node.kind === 'contact') {
    return { kind: 'contact', tag: node.tag, negated: node.negated }
  }
  const kids = node.children.map(cloneNode)
  return node.kind === 'series'
    ? { kind: 'series', children: kids }
    : { kind: 'parallel', children: kids }
}

/** Re-apply the flattening/collapsing invariants bottom-up after an edit. */
function canon(node: LadderNode): LadderNode {
  if (node.kind === 'contact') {
    return { kind: 'contact', tag: node.tag, negated: node.negated }
  }
  return group(node.kind, node.children.map(canon))
}

// --- Parsing ------------------------------------------------------------

const KEYWORDS = new Set(['AND', 'OR', 'NOT', '(', ')'])

/** Raw AST — the shape the grammar produces, before NOT is pushed down. */
type RawNode =
  | { kind: 'tag'; tag: string }
  | { kind: 'not'; child: RawNode }
  | { kind: 'and'; children: RawNode[] }
  | { kind: 'or'; children: RawNode[] }

/**
 * Parse a condition string into normalised, drawable ladder.
 *
 * Throws on malformed input (unbalanced parens, dangling operator, a keyword
 * where a tag belongs). scanCycle's evaluator silently coerces those cases to
 * `false`; here they must be loud, because the laptop editor hands the player's
 * own text to this function and needs to refuse to save a broken rung.
 */
export function parseCondition(input: string): LadderNode {
  // Same tokenizer as scanCycle.evaluateCondition: pad parens, split on runs
  // of whitespace.
  const tokens = input
    .replace(/\(/g, ' ( ')
    .replace(/\)/g, ' ) ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)

  if (tokens.length === 0) {
    throw new Error('ladder: empty condition')
  }

  let pos = 0

  function parseOr(): RawNode {
    const children: RawNode[] = [parseAnd()]
    while (tokens[pos] === 'OR') {
      pos++
      children.push(parseAnd())
    }
    return children.length === 1 ? children[0] : { kind: 'or', children }
  }

  function parseAnd(): RawNode {
    const children: RawNode[] = [parseNot()]
    while (tokens[pos] === 'AND') {
      pos++
      children.push(parseNot())
    }
    return children.length === 1 ? children[0] : { kind: 'and', children }
  }

  function parseNot(): RawNode {
    if (tokens[pos] === 'NOT') {
      pos++
      return { kind: 'not', child: parsePrim() }
    }
    return parsePrim()
  }

  function parsePrim(): RawNode {
    const token = tokens[pos]
    if (token === undefined) {
      throw new Error('ladder: unexpected end of condition')
    }
    if (token === '(') {
      pos++
      const inner = parseOr()
      if (tokens[pos] !== ')') {
        throw new Error('ladder: missing closing parenthesis')
      }
      pos++
      return inner
    }
    if (KEYWORDS.has(token)) {
      throw new Error(`ladder: expected a tag but found "${token}"`)
    }
    pos++
    return { kind: 'tag', tag: token }
  }

  const raw = parseOr()
  if (pos < tokens.length) {
    throw new Error(`ladder: unexpected token "${tokens[pos]}"`)
  }
  return normalise(raw, false)
}

/**
 * Push NOT down to the contacts (De Morgan), producing contact/series/parallel
 * only.
 *   NOT(a AND b) -> parallel(NOT a, NOT b)
 *   NOT(a OR  b) -> series(NOT a, NOT b)
 *   NOT(NOT a)   -> a                      (the flag flips twice)
 *   NOT(contact) -> the contact, negated
 */
function normalise(raw: RawNode, negated: boolean): LadderNode {
  switch (raw.kind) {
    case 'tag':
      return contact(raw.tag, negated)
    case 'not':
      return normalise(raw.child, !negated)
    case 'and':
      return group(
        negated ? 'parallel' : 'series',
        raw.children.map((c) => normalise(c, negated)),
      )
    case 'or':
      return group(
        negated ? 'series' : 'parallel',
        raw.children.map((c) => normalise(c, negated)),
      )
  }
}

// --- Serialisation ------------------------------------------------------

/**
 * Render a tree back to a condition string with the MINIMUM parentheses.
 *
 * AND binds tighter than OR, so the only thing that ever needs wrapping is a
 * parallel (OR) node sitting inside a series (AND) node. Canonical trees have
 * no same-kind nesting and no one-child groups, so this is stable:
 * `serializeCondition(parseCondition(s))` is idempotent, and that is exactly
 * the predicate the laptop uses to decide whether the player has EDITED a rung.
 */
export function serializeCondition(node: LadderNode): string {
  switch (node.kind) {
    case 'contact':
      return node.negated ? `NOT ${node.tag}` : node.tag
    case 'series':
      return node.children
        .map((c) =>
          c.kind === 'parallel'
            ? `(${serializeCondition(c)})`
            : serializeCondition(c),
        )
        .join(' AND ')
    case 'parallel':
      return node.children.map(serializeCondition).join(' OR ')
  }
}

/** True when a condition string is already in the canonical spelling. */
export function isCanonical(condition: string): boolean {
  try {
    return serializeCondition(parseCondition(condition)) === condition.trim()
  } catch {
    return false
  }
}

// --- Evaluation ---------------------------------------------------------

export function evaluateNode(
  node: LadderNode,
  get: (tag: string) => boolean,
): boolean {
  switch (node.kind) {
    case 'contact': {
      const v = get(node.tag)
      return node.negated ? !v : v
    }
    case 'series':
      return node.children.every((c) => evaluateNode(c, get))
    case 'parallel':
      return node.children.some((c) => evaluateNode(c, get))
  }
}

export interface LadderFlow {
  /** Power reached this element's LEFT edge. */
  fed: Map<LadderNode, boolean>
  /** Power leaves this element's RIGHT edge. */
  hot: Map<LadderNode, boolean>
}

/**
 * Power-flow analysis for highlighting.
 *
 * A closed contact on a branch that never gets power must NOT light up — that
 * distinction is the whole point of animating the rung, because the player
 * reads "this contact is made but the rung is still dead" straight off it.
 *
 * Keyed by node identity, so the tree must be a tree (no shared sub-nodes).
 * Every constructor and edit op here clones, so that holds by construction.
 */
export function evaluateFlow(
  node: LadderNode,
  get: (tag: string) => boolean,
): LadderFlow {
  const fed = new Map<LadderNode, boolean>()
  const hot = new Map<LadderNode, boolean>()

  function walk(n: LadderNode, feed: boolean): boolean {
    fed.set(n, feed)
    let out: boolean
    if (n.kind === 'contact') {
      const v = get(n.tag)
      out = feed && (n.negated ? !v : v)
    } else if (n.kind === 'series') {
      let carry = feed
      // Deliberately NOT short-circuiting: every child still gets walked so it
      // lands in the maps with fed=false rather than going missing.
      for (const child of n.children) carry = walk(child, carry)
      out = carry
    } else {
      let any = false
      for (const child of n.children) {
        if (walk(child, feed)) any = true
      }
      out = any
    }
    hot.set(n, out)
    return out
  }

  walk(node, true)
  return { fed, hot }
}

// --- Addressing ---------------------------------------------------------

/** Resolve a path to its node. Throws if the path leaves the tree. */
export function nodeAt(root: LadderNode, path: LadderPath): LadderNode {
  let node = root
  for (let depth = 0; depth < path.length; depth++) {
    if (node.kind === 'contact') {
      throw new Error('ladder: path descends into a contact')
    }
    const index = path[depth]
    const child = node.children[index]
    if (child === undefined) {
      throw new Error(`ladder: path index ${index} out of range`)
    }
    node = child
  }
  return node
}

function withChildren(node: SeriesNode | ParallelNode, children: LadderNode[]): LadderNode {
  return node.kind === 'series'
    ? { kind: 'series', children }
    : { kind: 'parallel', children }
}

/**
 * Rebuild the spine down to `path`, replacing the node there with `fn`'s result.
 * `null` deletes it; a group left with no children deletes itself in turn.
 */
function rebuild(
  node: LadderNode,
  path: LadderPath,
  depth: number,
  fn: (n: LadderNode) => LadderNode | null,
): LadderNode | null {
  if (depth === path.length) return fn(node)
  if (node.kind === 'contact') {
    throw new Error('ladder: path descends into a contact')
  }
  const index = path[depth]
  if (index < 0 || index >= node.children.length) {
    throw new Error(`ladder: path index ${index} out of range`)
  }
  const replaced = rebuild(node.children[index], path, depth + 1, fn)
  const children = node.children.slice()
  if (replaced === null) children.splice(index, 1)
  else children[index] = replaced
  if (children.length === 0) return null
  return withChildren(node, children)
}

/** Apply an edit and re-canonicalise. Never mutates `root`. */
function edit(
  root: LadderNode,
  path: LadderPath,
  fn: (n: LadderNode) => LadderNode | null,
): LadderNode {
  const next = rebuild(root, path, 0, fn)
  if (next === null) {
    throw new Error('ladder: a rung must keep at least one contact')
  }
  return canon(next)
}

// --- Edit operations (pure; every one returns a NEW tree) ---------------

/** Retag the contact at `path`. */
export function setContactTag(
  root: LadderNode,
  path: LadderPath,
  tag: string,
): LadderNode {
  return edit(root, path, (n) => {
    if (n.kind !== 'contact') {
      throw new Error('ladder: setContactTag target is not a contact')
    }
    return contact(tag, n.negated)
  })
}

/** Flip the contact at `path` between examine-on and examine-off. */
export function toggleContactType(
  root: LadderNode,
  path: LadderPath,
): LadderNode {
  return edit(root, path, (n) => {
    if (n.kind !== 'contact') {
      throw new Error('ladder: toggleContactType target is not a contact')
    }
    return contact(n.tag, !n.negated)
  })
}

/** Wire `node` in series immediately after the element at `path`. */
export function insertSeries(
  root: LadderNode,
  path: LadderPath,
  node: LadderNode,
): LadderNode {
  return edit(root, path, (n) => series(n, cloneNode(node)))
}

/** Branch `node` in parallel around the element at `path`. */
export function insertParallel(
  root: LadderNode,
  path: LadderPath,
  node: LadderNode,
): LadderNode {
  return edit(root, path, (n) => parallel(n, cloneNode(node)))
}

/** Delete the element at `path`, collapsing any group it leaves behind. */
export function removeAt(root: LadderNode, path: LadderPath): LadderNode {
  return edit(root, path, () => null)
}

// --- Equivalence --------------------------------------------------------

/** Every tag referenced by the tree, de-duplicated and sorted. */
export function collectTags(node: LadderNode): string[] {
  const seen = new Set<string>()
  const walk = (n: LadderNode): void => {
    if (n.kind === 'contact') seen.add(n.tag)
    else n.children.forEach(walk)
  }
  walk(node)
  return [...seen].sort()
}

/** Above this the truth table stops being free; bail rather than hang. */
export const EQUIVALENCE_TAG_LIMIT = 12

function asNode(x: LadderNode | string): LadderNode {
  return typeof x === 'string' ? parseCondition(x) : x
}

/**
 * Do two rungs compute the same function? Exhaustive truth table over the union
 * of their tags — the player can rewrite a rung any way they like, and this is
 * what says whether they restored the original behaviour or merely something
 * that looks similar.
 *
 * Returns false (never hangs) once the union exceeds EQUIVALENCE_TAG_LIMIT.
 */
export function equivalent(
  a: LadderNode | string,
  b: LadderNode | string,
): boolean {
  const nodeA = asNode(a)
  const nodeB = asNode(b)
  const tags = [...new Set([...collectTags(nodeA), ...collectTags(nodeB)])].sort()
  if (tags.length > EQUIVALENCE_TAG_LIMIT) return false

  const index = new Map(tags.map((t, i) => [t, i]))
  const rows = 1 << tags.length
  for (let mask = 0; mask < rows; mask++) {
    const get = (tag: string): boolean => {
      const i = index.get(tag)
      return i === undefined ? false : (mask & (1 << i)) !== 0
    }
    if (evaluateNode(nodeA, get) !== evaluateNode(nodeB, get)) return false
  }
  return true
}

// --- Layout -------------------------------------------------------------

export interface LadderCell {
  row: number
  col: number
  node: ContactNode
  path: LadderPath
}

export interface LadderLayout {
  cells: LadderCell[]
  rows: number
  cols: number
}

/**
 * Place every contact on a grid the UI can draw directly: series advances the
 * column, parallel branches occupy consecutive rows. Row 0 is the main rung
 * line, so a branch always hangs below the elements it parallels.
 */
export function layout(root: LadderNode): LadderLayout {
  const cells: LadderCell[] = []

  function place(
    node: LadderNode,
    path: LadderPath,
    row: number,
    col: number,
  ): { rows: number; cols: number } {
    if (node.kind === 'contact') {
      cells.push({ row, col, node, path })
      return { rows: 1, cols: 1 }
    }
    if (node.kind === 'series') {
      let cursor = col
      let height = 1
      node.children.forEach((child, i) => {
        const size = place(child, [...path, i], row, cursor)
        cursor += size.cols
        height = Math.max(height, size.rows)
      })
      return { rows: height, cols: cursor - col }
    }
    let cursor = row
    let width = 1
    node.children.forEach((child, i) => {
      const size = place(child, [...path, i], cursor, col)
      cursor += size.rows
      width = Math.max(width, size.cols)
    })
    return { rows: cursor - row, cols: width }
  }

  const size = place(root, [], 0, 0)
  return { cells, rows: size.rows, cols: size.cols }
}
