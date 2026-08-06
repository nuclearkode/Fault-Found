'use client'

/**
 * ReferenceBook — the works manual for the cell, opened on the bench.
 *
 * Mounted OUTSIDE the Canvas, in page.tsx, and that is not a preference. drei's
 * PointerLockControls binds click-to-lock to `selector="canvas"`, so anything
 * drawn through <Html> inside the Canvas re-captures the pointer the instant the
 * player clicks a page-turn button, and the manual becomes unusable in the most
 * confusing way possible. A plain DOM overlay is the only safe surface.
 *
 * It renders only while `overlay === 'book'`. Opening and closing belong to
 * src/input/keymap.ts (B and Escape) and the pointer belongs to
 * PointerLockWarden; nothing here touches either. The world is frozen the whole
 * time it is open — SIMULATES.book is false — which is the deliberate difference
 * between this and the laptop: reading the manual is off the clock, reading the
 * ladder is not.
 *
 * Arrow keys are handled here rather than in the keymap because they are the
 * only binding in the game that means something in exactly one focus and nothing
 * anywhere else. KEYS.forward/back/left/right list the arrows for movement, but
 * PlayerController gates every one of them behind worldInputEnabled(), which is
 * false while the book is open — so there is no conflict to resolve.
 */

import { useEffect } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useBookStore } from '@/stores/bookStore'
import { BOOK_SPREADS } from '@/content/bookPages'

// ── Print furniture, matched to bookPages ───────────────────────────────────
const SLAB = '"Rockwell", "Roboto Slab", "Bookman Old Style", Georgia, serif'
const BODY = 'Georgia, "Iowan Old Style", "Times New Roman", serif'
const MONO = '"JetBrains Mono", ui-monospace, "SFMono-Regular", monospace'
const INK = '#33291d'
const SOFT = '#6b5f4a'
const RED = '#a3352c'
const PAPER = '#f3ead6'

/**
 * Warm paper against the dark bay. Two gradients: a broad one that makes the
 * outer edge of each page brighter than the gutter, and a fine speckle so a
 * whole page of body text does not read as a flat web panel.
 */
const paper = (side: 'left' | 'right') => ({
  background: `
    radial-gradient(120% 90% at ${side === 'left' ? '10%' : '90%'} 12%, #fdf7e7 0%, ${PAPER} 55%, #e7dcc2 100%),
    repeating-linear-gradient(94deg, rgba(120,96,52,0.028) 0 1px, transparent 1px 4px)
  `,
  backgroundBlendMode: 'multiply' as const,
})

export function ReferenceBook() {
  const open = useSettingsStore((s) => s.overlay === 'book')

  const spread = useBookStore((s) => s.spread)
  const spreadCount = useBookStore((s) => s.spreadCount)
  const setSpreadCount = useBookStore((s) => s.setSpreadCount)
  const goTo = useBookStore((s) => s.goTo)
  const turn = useBookStore((s) => s.turn)

  // Front matter + one spread per chapter. Told to the store rather than read
  // from it, so the clamp in the store always knows the real length.
  const total = BOOK_SPREADS.length + 1
  useEffect(() => { setSpreadCount(total) }, [setSpreadCount, total])

  // Page turning. Bound only while the book is up, so nothing else in the game
  // ever sees an arrow key handled here.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      if (e.code === 'ArrowLeft') { e.preventDefault(); turn(-1) }
      else if (e.code === 'ArrowRight') { e.preventDefault(); turn(1) }
      else if (e.code === 'Home') { e.preventDefault(); goTo(0) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, turn, goTo])

  if (!open) return null

  const chapter = spread === 0 ? null : BOOK_SPREADS[spread - 1]
  const atStart = spread === 0
  const atEnd = spread >= spreadCount - 1
  // Folios run as a real book does: the front matter is i and ii, then 1 up.
  const folioL = spread === 0 ? 'i' : String(spread * 2 - 1)
  const folioR = spread === 0 ? 'ii' : String(spread * 2)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 190,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '0.7rem',
        background: 'radial-gradient(120% 100% at 50% 40%, rgba(14,11,8,0.82) 0%, rgba(3,3,5,0.94) 100%)',
        backdropFilter: 'blur(6px)',
        pointerEvents: 'auto',
      }}
      // Same defence as the pause menu: nothing here may reach the canvas.
      onClick={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation() }}
      onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation() }}
      onPointerDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation() }}
    >
      {/* ── The book ───────────────────────────────────────────────────── */}
      <div style={{
        position: 'relative',
        width: 'min(1200px, 95vw)',
        height: 'min(900px, 88vh)',
        display: 'flex',
        // The boards: a dark cloth binding a couple of millimetres proud of the
        // block, which is what stops the paper reading as two white divs.
        padding: '10px',
        background: 'linear-gradient(160deg, #3a2a20 0%, #241a14 45%, #2f221a 100%)',
        borderRadius: '5px',
        boxShadow: `
          0 40px 90px rgba(0,0,0,0.7),
          0 0 0 1px rgba(0,0,0,0.6),
          inset 0 1px 0 rgba(255,225,180,0.09)
        `,
      }}>
        {/* Stacked page edges, left and right */}
        <div style={{
          position: 'absolute', left: '2px', top: '18px', bottom: '18px', width: '8px',
          background: 'repeating-linear-gradient(180deg, #e6dcc4 0 2px, #cfc2a2 2px 3px)',
          borderRadius: '2px 0 0 2px', opacity: 0.8,
        }} />
        <div style={{
          position: 'absolute', right: '2px', top: '18px', bottom: '18px', width: '8px',
          background: 'repeating-linear-gradient(180deg, #e6dcc4 0 2px, #cfc2a2 2px 3px)',
          borderRadius: '0 2px 2px 0', opacity: 0.8,
        }} />

        {/* LEFT PAGE */}
        <Page
          key={`L${spread}`}
          side="left"
          running={chapter ? 'SILO FILL CELL — WEST BAY' : ''}
          folio={folioL}
        >
          {chapter ? chapter.left : <TitlePage />}
        </Page>

        {/* The gutter itself — a real one, with the block shadow either side */}
        <div style={{
          width: '2px', flex: '0 0 2px',
          background: 'linear-gradient(180deg, #1d150f 0%, #3b2b1f 50%, #1d150f 100%)',
          boxShadow: '0 0 16px 6px rgba(40,26,12,0.55)',
          zIndex: 2,
        }} />

        {/* RIGHT PAGE */}
        <Page
          key={`R${spread}`}
          side="right"
          running={chapter ? chapter.title.toUpperCase() : ''}
          folio={folioR}
        >
          {chapter ? chapter.right : <Contents onJump={goTo} />}
        </Page>
      </div>

      {/*
        ── Controls, on the desk rather than on the paper ─────────────────

        Centred, and that is the entire point of the arrangement. These used to
        run as one left-weighted row — PREV, CONTENTS, counter, NEXT, then the
        key hints trailing off to the right — and the first player to open the
        manual could not find the way to turn the page. Strung out beside a line
        of grey hint text the buttons read as a status bar, and nobody clicks a
        status bar. Turning forward is the only thing anyone does in here nine
        times out of ten, so it now sits on the centre line, which is where the
        eye already is when it comes off the bottom of the right-hand page.

        The row is a `1fr auto 1fr` grid rather than a flex row because NEXT is
        deliberately wider than PREV, and a flex row would hang the whole group
        off to the left of true centre by half that difference. Equal side
        columns keep the spread counter on the middle of the book and let the two
        buttons flank it symmetrically however wide their labels get.

        `flex: '0 0 auto'` is load-bearing rather than tidiness. The book above
        is `min(900px, 88vh)` and is left shrinkable on purpose: on a viewport
        too short for both, the paper gives up height and the controls stay
        exactly where they are. The alternative — the footer shrinking, or the
        column overflowing past `justify-content: center` — is what would push
        this block off the bottom of the screen, and neither the book nor this
        overlay may ever scroll.
      */}
      <div style={{
        flex: '0 0 auto',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: '0.4rem',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          columnGap: '1.2rem',
          width: 'min(34rem, 92vw)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <TurnButton tone="secondary" label="◀  PREV" onClick={() => turn(-1)} disabled={atStart} />
          </div>

          {/* Counter over contents: the label the reader checks, then the escape
              hatch back to the list. Both belong on the centre line, and a fixed
              minimum stops the flanking buttons twitching as the number grows. */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: '0.25rem', minWidth: '9rem',
          }}>
            <div style={{
              fontFamily: MONO, fontSize: '0.68rem', letterSpacing: '0.1em',
              lineHeight: 1.2, color: '#cfc2a2', whiteSpace: 'nowrap',
            }}>
              SPREAD <span style={{ color: RED, fontWeight: 700 }}>{spread + 1}</span> OF {spreadCount}
            </div>

            <button
              onClick={() => goTo(0)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                // A dotted rule under it, because a bare grey word between two
                // framed buttons does not read as something you can press.
                borderBottom: '1px dotted rgba(138, 129, 114, 0.55)',
                color: '#8a8172', fontFamily: MONO, fontSize: '0.6rem',
                letterSpacing: '0.16em', lineHeight: 1.2, padding: '0 0.15rem 1px',
              }}
            >
              CONTENTS
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <TurnButton tone="primary" label="NEXT  ▶" onClick={() => turn(1)} disabled={atEnd} />
          </div>
        </div>

        {/* The hints stay — they are how anyone learns the arrows work at all —
            but a line below the buttons and dimmer than everything above it. */}
        <div style={{
          fontFamily: MONO, fontSize: '0.6rem', letterSpacing: '0.14em',
          lineHeight: 1.2, color: '#6a6357',
        }}>
          ← → TURN PAGE · B OR ESC TO CLOSE
        </div>
      </div>
    </div>
  )
}

// ── A single page ───────────────────────────────────────────────────────────
function Page({
  side, running, folio, children,
}: {
  side: 'left' | 'right'
  running: string
  folio: string
  children: React.ReactNode
}) {
  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      ...paper(side),
      // The curve into the gutter. A page is not flat where it is sewn.
      boxShadow: side === 'left'
        ? 'inset -26px 0 34px -24px rgba(70,48,18,0.55), inset 1px 1px 0 rgba(255,255,255,0.35)'
        : 'inset 26px 0 34px -24px rgba(70,48,18,0.55), inset -1px 1px 0 rgba(255,255,255,0.35)',
      borderRadius: side === 'left' ? '2px 0 0 2px' : '0 2px 2px 0',
      padding: side === 'left'
        ? '1.1rem 1.7rem 0.75rem 2.1rem'
        : '1.1rem 2.1rem 0.75rem 1.7rem',
    }}>
      {/* Running head */}
      <div style={{
        display: 'flex', justifyContent: side === 'left' ? 'flex-start' : 'flex-end',
        fontFamily: MONO, fontSize: '0.55rem', letterSpacing: '0.2em',
        color: 'rgba(90, 76, 52, 0.6)', marginBottom: '0.5rem',
        borderBottom: '1px solid rgba(140, 116, 74, 0.22)', paddingBottom: '0.35rem',
        minHeight: '0.9rem',
      }}>
        {running}
      </div>

      {/*
        A page does not scroll. Books do not scroll — you turn them, and a
        scrollbar inside a drawn paper page breaks the one illusion this whole
        component exists to create. It also hides content: a reader who does not
        notice the bar simply never sees the bottom of the page.

        `minHeight: 0` is what makes that safe rather than merely hidden. Without
        it a flex child refuses to shrink below its content and the text pushes
        the folio off the bottom instead of the page clipping. With it, the page
        is a fixed box and anything that does not fit is a content problem to fix
        by splitting the spread — which is the correct fix, not a scrollbar.
      */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', paddingRight: '0.2rem' }}>
        {children}
      </div>

      {/* Folio */}
      <div style={{
        marginTop: '0.4rem', paddingTop: '0.3rem',
        borderTop: '1px solid rgba(140, 116, 74, 0.18)',
        display: 'flex', justifyContent: side === 'left' ? 'flex-start' : 'flex-end',
        fontFamily: MONO, fontSize: '0.6rem', color: 'rgba(90, 76, 52, 0.65)',
      }}>
        {folio}
      </div>
    </div>
  )
}

// ── Front matter ────────────────────────────────────────────────────────────
function TitlePage() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{
        fontFamily: MONO, fontSize: '0.6rem', letterSpacing: '0.28em',
        color: RED, fontWeight: 700, marginBottom: '1.1rem',
      }}>
        WORKS REFERENCE
      </div>

      <h1 style={{
        fontFamily: SLAB, fontSize: '2.05rem', lineHeight: 1.08, color: INK,
        margin: '0 0 0.5rem', fontWeight: 700, letterSpacing: '-0.02em',
      }}>
        SILO FILL CELL
      </h1>
      <div style={{
        fontFamily: SLAB, fontSize: '1.05rem', color: SOFT, marginBottom: '1.1rem',
      }}>
        West bay · PLC-01
      </div>

      <div style={{ height: 3, background: INK, opacity: 0.8, marginBottom: '1.1rem' }} />

      <p style={{
        fontFamily: BODY, fontSize: '0.86rem', lineHeight: 1.6, color: INK, margin: '0 0 1.2rem',
      }}>
        Operation, devices and isolation for the carton filling cell. Written for
        the fitter standing in front of it, not for the office. Nothing in here
        describes a fault: everything in here is what the cell does when it is
        working, which is the only thing worth comparing a broken one against.
      </p>

      <div style={{
        fontFamily: MONO, fontSize: '0.62rem', lineHeight: 1.9, color: SOFT,
        borderTop: '1px solid rgba(140, 116, 74, 0.35)', paddingTop: '0.7rem',
      }}>
        <div>ISSUE 4 · REV C</div>
        <div>KEEP THIS COPY AT THE PANEL</div>
        <div style={{ color: RED, marginTop: '0.5rem' }}>DO NOT REMOVE FROM THE BAY</div>
      </div>
    </div>
  )
}

function Contents({ onJump }: { onJump: (i: number) => void }) {
  return (
    <div>
      <h2 style={{
        fontFamily: SLAB, fontSize: '1.28rem', color: INK, margin: '0 0 0.2rem',
        fontWeight: 700,
      }}>
        Contents
      </h2>
      <div style={{ height: 2, background: INK, opacity: 0.75, margin: '0 0 1rem' }} />

      {BOOK_SPREADS.map((s, i) => (
        <button
          key={s.id}
          onClick={() => onJump(i + 1)}
          style={{
            display: 'flex', alignItems: 'baseline', gap: '0.6rem',
            width: '100%', textAlign: 'left', background: 'none', border: 'none',
            borderBottom: '1px solid rgba(140, 116, 74, 0.2)',
            padding: '0.55rem 0.1rem', cursor: 'pointer', color: INK,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(163, 53, 44, 0.06)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
        >
          <span style={{
            fontFamily: MONO, fontSize: '0.66rem', color: RED, fontWeight: 700,
            minWidth: '1.6rem',
          }}>
            {String(i + 1).padStart(2, '0')}
          </span>
          <span style={{ fontFamily: BODY, fontSize: '0.9rem', flex: 1 }}>
            {s.title}
          </span>
          <span style={{
            fontFamily: MONO, fontSize: '0.6rem', color: SOFT, letterSpacing: '0.1em',
          }}>
            {String((i + 1) * 2 - 1).padStart(2, '0')}
          </span>
        </button>
      ))}

      <p style={{
        fontFamily: BODY, fontSize: '0.78rem', lineHeight: 1.55, color: SOFT,
        marginTop: '1.1rem', fontStyle: 'italic',
      }}>
        Figures are numbered straight through. Every one of them is drawn to the
        cell as fitted; where a drawing and the machine disagree, the machine is
        right and the drawing wants marking up.
      </p>
    </div>
  )
}

// ── Page-turn button ────────────────────────────────────────────────────────
/**
 * The two buttons are the same control at different weights, not two controls.
 *
 * `primary` is NEXT and only ever NEXT: the filled ground, the larger type and
 * the one warm glow on the desk, because forward is the move. `secondary` is
 * PREV, which has to be findable without being offered — an outline on the bay
 * behind it and nothing else. Both are drawn from the same red the manual uses
 * for its own headings, so the desk furniture still belongs to the book.
 *
 * Disabled reads identically in both tones. A dead control at the front or back
 * cover should look unavailable, not like a third, quieter kind of button.
 *
 * The `lineHeight: 1` is not cosmetic. It pins the button height to type size
 * plus padding, so the footer's total height is arithmetic rather than a
 * function of whichever mono font the player's machine actually resolved — the
 * whole no-scroll budget below the book depends on that number being knowable.
 */
function TurnButton({
  label, onClick, disabled, tone,
}: {
  label: string
  onClick: () => void
  disabled: boolean
  tone: 'primary' | 'secondary'
}) {
  const primary = tone === 'primary'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.filter = 'brightness(1.22)' }}
      onMouseLeave={(e) => { e.currentTarget.style.filter = 'none' }}
      style={{
        background: disabled
          ? 'rgba(255,255,255,0.02)'
          : primary ? 'rgba(163, 53, 44, 0.32)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${
          disabled ? 'rgba(255,255,255,0.06)'
            : primary ? 'rgba(163, 53, 44, 0.8)' : 'rgba(196, 172, 133, 0.3)'
        }`,
        boxShadow: primary && !disabled
          ? '0 5px 16px rgba(163, 53, 44, 0.22), inset 0 1px 0 rgba(255, 225, 180, 0.14)'
          : 'none',
        color: disabled ? '#4d483f' : primary ? '#f4dcbc' : '#c2ad8c',
        fontFamily: MONO,
        fontSize: primary ? '0.76rem' : '0.64rem',
        fontWeight: primary ? 700 : 600,
        letterSpacing: primary ? '0.16em' : '0.12em',
        lineHeight: 1,
        padding: primary ? '0.5rem 1.45rem' : '0.42rem 0.9rem',
        borderRadius: '3px',
        whiteSpace: 'nowrap',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  )
}
