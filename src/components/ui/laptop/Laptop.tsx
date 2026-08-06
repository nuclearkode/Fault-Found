'use client'

/**
 * Laptop — the maintenance terminal, opened with L.
 *
 * Plain DOM, mounted in page.tsx OUTSIDE the Canvas. That is not a style
 * preference: drei's PointerLockControls binds click-to-lock to
 * `selector="canvas"`, so anything drawn inside the Canvas — a drei <Html>
 * panel included — re-locks the pointer the moment the player clicks a contact,
 * and the editor becomes unusable. Outside the Canvas it is just a div.
 *
 * It does NOT bind keys. `src/input/keymap.ts` owns L and Escape for every
 * focus, and it already skips events aimed at INPUT/TEXTAREA/SELECT so typing
 * an address in here cannot reach the game. It also never touches the pointer
 * lock — `PointerLockWarden` is the only thing allowed to release it. Every
 * control below is therefore reachable with the mouse alone.
 *
 * The world keeps running while this is open (SIMULATES.laptop is true): the
 * player is reading a LIVE machine and the shift clock is burning, which is why
 * the clock is on the online bar where they cannot miss it.
 *
 * The chrome is deliberately a late-90s Windows PLC editor — white ladder
 * canvas, blue instructions, green power, dense grey chrome. The horror is in
 * the shed, not in the software; the terminal is the one thing in this game
 * that behaves like a tool.
 */

import { useEffect, useRef } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useLaptopStore } from '@/stores/laptopStore'
import { LadderView } from './LadderView'
import { IoTable } from './IoTable'
import { Toolbar } from './Toolbar'

const clock = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/**
 * The shift countdown, painted imperatively.
 *
 * `remainingTime` is written by the scan cycle 20 times a second. Subscribing to
 * it through React would re-render the laptop — and therefore the whole ladder —
 * at that rate, which is precisely what the rest of this UI is built to avoid.
 */
function ShiftClock() {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el === null) return
    let raf = 0
    let last = ''
    const paint = (): void => {
      raf = 0
      const text = clock(useGameStore.getState().remainingTime)
      if (text !== last) {
        last = text
        el.textContent = text
      }
    }
    const schedule = (): void => {
      if (raf === 0) raf = requestAnimationFrame(paint)
    }
    paint()
    const unsubscribe = useGameStore.subscribe((s) => s.remainingTime, schedule)
    return () => {
      unsubscribe()
      if (raf !== 0) cancelAnimationFrame(raf)
    }
  }, [])

  return <span className="ff-clock" ref={ref}>--:--</span>
}

const MENUS = ['File', 'Edit', 'View', 'Search', 'Comms', 'Tools', 'Window', 'Help']

export function Laptop() {
  const open = useSettingsStore((s) => s.overlay === 'laptop')
  const scenarioId = useGameStore((s) => s.scenarioId)
  const phase = useGameStore((s) => s.phase)
  const rungCount = useGameStore((s) => s.rungs.length)

  const tab = useLaptopStore((s) => s.tab)
  const setTab = useLaptopStore((s) => s.setTab)
  const pending = useLaptopStore((s) => Object.keys(s.drafts).length)
  const clearDrafts = useLaptopStore((s) => s.clearDrafts)
  const resetForRun = useLaptopStore((s) => s.resetForRun)

  /**
   * Drafts belong to the program they were written against. When the running
   * program is REPLACED — a new job loading, a restart — a draft keyed by rung
   * id would silently apply to a different rung, so it is dropped. (A download
   * replaces `rungs` too and lands here harmlessly: it has already cleared.)
   */
  useEffect(() => useGameStore.subscribe((s) => s.rungs, clearDrafts), [clearDrafts])

  /**
   * A new RUN wipes the terminal, not just its drafts.
   *
   * The download stamp and the open document survive `clearDrafts` on purpose —
   * that handler also runs on a download, which must not erase the timestamp it
   * just set. But they are per-processor facts, so a fresh job that opened on
   * Data Files showing "Last download 21:14:07" would be reporting a write to a
   * machine the player never touched. `runNonce` is the one signal that means
   * "different run" and nothing else; the scenario bootstrap keys off it too.
   */
  useEffect(() => useGameStore.subscribe((s) => s.runNonce, resetForRun), [resetForRun])

  if (!open) return null

  // ONLINE means what it means on a real terminal: there is a processor at the
  // other end of the cable and it is scanning. Everything the ladder shows —
  // the green rails, the live highlight — is only true when this is true.
  const online = phase === 'active' && rungCount > 0

  const stop = (e: React.SyntheticEvent): void => {
    e.stopPropagation()
    e.nativeEvent.stopImmediatePropagation()
  }

  return (
    <div
      className="ff-backdrop"
      // Belt and braces with GameCanvas's pointerEvents:none — a click that
      // reaches the canvas is a click that re-locks the pointer mid-edit.
      onClick={stop}
      onMouseDown={stop}
      onPointerDown={stop}
    >
      <style>{CSS}</style>

      <div className="ff-stage">
        <div className="ff-lid">
          <div className="ff-bezel">
            <div className="ff-cam" />
            <div className={online ? 'ff-screen ff-run' : 'ff-screen'}>
              <header className="ff-title">
                <span className="ff-title-app">FIELDMASTER 400</span>
                <span className="ff-title-doc">
                  {scenarioId ?? 'NO JOB'} — LAD 2 · MAIN PROGRAM
                </span>
              </header>

              <nav className="ff-menu">
                {MENUS.map((m) => (
                  <span className="ff-menu-item" key={m}>
                    {m}
                  </span>
                ))}
              </nav>

              <div className="ff-online">
                <span className={online ? 'ff-pill ff-pill-on' : 'ff-pill ff-pill-off'}>
                  {online ? 'ONLINE' : 'OFFLINE'}
                </span>
                <span className="ff-pill">{online ? 'RUN' : 'PROGRAM'}</span>
                <span className="ff-pill">No Forces</span>
                <span className={pending > 0 ? 'ff-pill ff-pill-warn' : 'ff-pill'}>
                  {pending > 0 ? `${pending} Edit${pending === 1 ? '' : 's'}` : 'No Edits'}
                </span>
                <span className="ff-driver">Driver: AB_DF1-1 · Node: 1d</span>
                <span className="ff-shift">
                  Shift <ShiftClock />
                </span>
              </div>

              {tab === 'ladder' && <Toolbar />}

              <div className="ff-doctabs">
                <button
                  type="button"
                  className={tab === 'ladder' ? 'ff-doctab ff-doctab-on' : 'ff-doctab'}
                  onClick={() => setTab('ladder')}
                >
                  LAD 2 — MAIN
                </button>
                <button
                  type="button"
                  className={tab === 'io' ? 'ff-doctab ff-doctab-on' : 'ff-doctab'}
                  onClick={() => setTab('io')}
                >
                  Data Files
                </button>
              </div>

              <div className="ff-body">
                {tab === 'ladder' ? <LadderView /> : <IoTable />}
              </div>

              <footer className="ff-statusbar">
                <span className="ff-sb-pane">2:0000</span>
                {/*
                  The key, and it is not decoration.

                  This ladder has THREE states where a real RSLogix screen has
                  two: it separates "this contact is made" from "power actually
                  reaches it". That is the more useful distinction — a made
                  contact on a dead branch is exactly the thing a technician
                  needs to notice — but with no key it reads as a fault in the
                  display, because a bit showing 1 in Data Files can appear
                  amber here and the player has no way to learn why.
                */}
                <span className="ff-sb-key" aria-label="Colour key">
                  <i className="ff-key-sw ff-key-cold" /> open
                  <i className="ff-key-sw ff-key-made" /> made, not fed
                  <i className="ff-key-sw ff-key-live" /> powered
                </span>
                <span className="ff-sb-warn">
                  The line is running — the shift clock does not stop for this.
                </span>
                <span className="ff-sb-hint">[L] or [Esc] to close</span>
              </footer>
            </div>
          </div>
        </div>

        <div className="ff-deck">
          <div className="ff-hinge" />
          <div className="ff-keys" />
          <div className="ff-plate">FIELDMASTER 400 · RUGGED FIELD TERMINAL</div>
        </div>
      </div>
    </div>
  )
}

/**
 * All of the laptop's styling, including the three power-flow states the SVG is
 * painted with. Colour lives HERE and not in the paint loop on purpose: the loop
 * writes one attribute per changed element and the cascade does the rest.
 *
 *   data-s="0"  dead                                     (blue — the cold rung)
 *   data-s="1"  contact made, but nothing is feeding it   (amber — read this one)
 *   data-s="2"  powered                                   (green)
 *
 * A real RSLogix screen only has two of those: it greens an instruction whenever
 * its bit says so, fed or not. The amber middle state is this game's addition and
 * it is the best teaching device in the whole UI — "made, but dead" is exactly
 * how a technician reads a rung that should be working and isn't.
 */
const CSS = `
.ff-backdrop {
  /* Above the briefing (140), below the FAULT CLEARED banner (150) and the
     pause menu / debrief (200): fixing the fault from the laptop should show
     the banner without making the player close the lid to see it. */
  position: fixed; inset: 0; z-index: 145;
  display: flex; align-items: flex-end; justify-content: center;
  background: radial-gradient(120% 90% at 50% 100%, rgba(10,12,16,.72), rgba(4,5,7,.94));
  backdrop-filter: blur(3px);
  font-family: "Segoe UI", system-ui, -apple-system, "Helvetica Neue", sans-serif;
  font-size: 12px;
  color: #10151c;
  animation: ff-fade 240ms ease both;
  overflow: hidden;

  --ff-ink: #10151c;
  --ff-dim: #5d6879;
  --ff-line: #a9b2c0;
  --ff-face: #eef1f5;
  --ff-face-2: #dde3ec;
  --ff-blue: #2430c0;      /* the cold rung: wires, bars, coil parens */
  --ff-green: #06a12c;     /* powered */
  --ff-amber: #c07a00;     /* made, but nothing feeding it */
  --ff-sel: #1a56db;
  --ff-red: #b3261e;

  /* Data Files shows a bit as a LAMP, so these are fills, not the stroke
     colours above — a 3px green line reads as a wire and a filled cell reads as
     a state, which is the distinction the two panes are making. The key in the
     table header draws its swatches from these same two properties, for the
     same reason the ladder key does: the key cannot end up describing a colour
     the table stopped using. */
  --ff-bit-off: #eef1f5;
  --ff-bit-on: #7ce894;
}
@keyframes ff-fade { from { opacity: 0 } to { opacity: 1 } }

.ff-stage {
  width: min(1280px, 98vw);
  perspective: 1700px;
  perspective-origin: 50% 100%;
  padding-bottom: 1.2vh;
}

/* The lid. Hinged along its bottom edge where it meets the deck, so opening
   reads as a laptop being lifted into view rather than a modal fading in. */
.ff-lid {
  transform-origin: 50% 100%;
  animation: ff-lid-open 380ms cubic-bezier(.22,.92,.3,1) both;
  will-change: transform;
}
@keyframes ff-lid-open {
  from { transform: rotateX(-95deg); opacity: .15; }
  60%  { opacity: 1; }
  to   { transform: rotateX(0deg); opacity: 1; }
}

.ff-bezel {
  position: relative;
  height: min(78vh, 830px);
  background: linear-gradient(180deg, #3c4149 0%, #23262c 8%, #1b1e23 92%, #2a2e35 100%);
  border: 1px solid #494f58;
  border-radius: 10px 10px 4px 4px;
  padding: 24px 14px 16px;
  box-shadow:
    0 -2px 0 rgba(255,255,255,.06) inset,
    0 40px 90px rgba(0,0,0,.75),
    0 0 0 1px rgba(0,0,0,.6);
}
.ff-cam {
  position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
  width: 6px; height: 6px; border-radius: 50%;
  background: #0a0c10; box-shadow: 0 0 0 2px #4a5058;
}

.ff-screen {
  height: 100%;
  display: flex; flex-direction: column;
  background: var(--ff-face);
  border: 1px solid #7c8695;
  border-radius: 2px;
  overflow: hidden;
}

/* --- window chrome ------------------------------------------------------ */
.ff-title {
  display: flex; align-items: center; gap: 10px;
  padding: 5px 10px;
  background: linear-gradient(180deg, #2c4f8a, #1d3865);
  color: #f2f5fa;
  font-size: 11px; letter-spacing: .04em;
  border-bottom: 1px solid #16294b;
}
.ff-title-app { font-weight: 700; letter-spacing: .1em; }
.ff-title-doc { opacity: .82; }

.ff-menu {
  display: flex; gap: 2px;
  padding: 3px 6px;
  background: var(--ff-face);
  border-bottom: 1px solid var(--ff-line);
  font-size: 11.5px; color: #2a3140;
}
.ff-menu-item { padding: 2px 8px; border-radius: 2px; }

.ff-online {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 8px;
  background: linear-gradient(180deg, #f7f9fc, var(--ff-face-2));
  border-bottom: 1px solid var(--ff-line);
  font-size: 11px;
}
.ff-pill {
  padding: 2px 9px; border-radius: 2px;
  background: #fff; border: 1px solid var(--ff-line); color: #333b49;
  font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase;
}
.ff-pill-on { background: #dcf5e1; border-color: #4aa863; color: #0d6b28; font-weight: 700; }
.ff-pill-off { background: #ececef; border-color: #9aa3b1; color: #5c6472; font-weight: 700; }
.ff-pill-warn { background: #fdeccd; border-color: #d09a2c; color: #7a5200; font-weight: 700; }
.ff-driver { color: var(--ff-dim); margin-left: 6px; }
.ff-shift {
  margin-left: auto; color: var(--ff-dim);
  display: flex; align-items: center; gap: 6px;
}
.ff-clock {
  font-family: ui-monospace, "JetBrains Mono", Consolas, monospace;
  font-size: 13px; font-weight: 700; color: var(--ff-red);
  background: #fff; border: 1px solid var(--ff-line); padding: 1px 7px;
}

/* --- instruction toolbar ------------------------------------------------ */
.ff-itbar {
  background: var(--ff-face-2);
  border-bottom: 1px solid var(--ff-line);
}
.ff-itbar-tabs { display: flex; gap: 2px; padding: 3px 6px 0; }
.ff-itab {
  padding: 2px 12px; font-size: 10.5px;
  border: 1px solid var(--ff-line); border-bottom: none;
  border-radius: 3px 3px 0 0;
  background: #d2d8e2; color: #5d6879;
}
.ff-itab-on { background: #fff; color: var(--ff-ink); font-weight: 600; }
.ff-itab-off { opacity: .55; }

.ff-itbar-row {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding: 5px 8px;
  background: #fff;
  border-top: 1px solid var(--ff-line);
}
.ff-palette { display: flex; align-items: center; gap: 4px; }
.ff-sep { width: 1px; align-self: stretch; background: var(--ff-line); margin: 0 4px; }

.ff-inst {
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  font: inherit; cursor: pointer;
  padding: 3px 8px 2px;
  background: linear-gradient(180deg, #fbfcfe, var(--ff-face));
  border: 1px solid var(--ff-line); border-radius: 3px;
  color: var(--ff-ink);
}
.ff-inst em { font-style: normal; font-size: 9px; letter-spacing: .1em; color: var(--ff-dim); }
.ff-inst:hover { background: #e8effb; border-color: #7c9cd8; }
.ff-inst-on {
  background: #d7e6ff; border-color: var(--ff-sel);
  box-shadow: 0 0 0 1px var(--ff-sel) inset;
}
.ff-inst-on em { color: var(--ff-sel); font-weight: 700; }
.ff-inst-locked { opacity: .45; }
.ff-glyph { display: block; }
.ff-g-wire { stroke: var(--ff-blue); stroke-width: 1.6; }
.ff-g-bar { stroke: var(--ff-blue); stroke-width: 2.2; }
.ff-inst-on .ff-g-wire, .ff-inst-on .ff-g-bar { stroke: var(--ff-sel); }

.ff-tool {
  font: inherit; font-size: 11px; cursor: pointer;
  padding: 5px 10px;
  background: linear-gradient(180deg, #fbfcfe, var(--ff-face));
  border: 1px solid var(--ff-line); border-radius: 3px; color: var(--ff-ink);
}
.ff-tool:hover:not(:disabled) { background: #e8effb; border-color: #7c9cd8; }
.ff-tool:disabled { color: #9aa3b1; background: #f3f4f7; cursor: default; }
.ff-tool-danger:hover:not(:disabled) { background: #fdeaea; border-color: #d08a86; color: var(--ff-red); }

.ff-dl {
  font: inherit; font-size: 11px; font-weight: 700; cursor: pointer;
  padding: 5px 14px;
  background: linear-gradient(180deg, #c8392f, #9d1f17);
  border: 1px solid #7d1811; border-radius: 3px; color: #fff;
  box-shadow: 0 1px 0 rgba(255,255,255,.25) inset;
}
.ff-dl:hover:not(:disabled) { background: linear-gradient(180deg, #d84a3f, #ad271e); }
.ff-dl:disabled {
  background: #f3f4f7; border-color: var(--ff-line); color: #9aa3b1;
  box-shadow: none; cursor: default;
}
.ff-itbar-last { margin-left: auto; color: var(--ff-dim); font-size: 10.5px; }

/* --- document tabs ------------------------------------------------------ */
.ff-doctabs {
  display: flex; gap: 2px; padding: 4px 8px 0;
  background: var(--ff-face-2);
  border-bottom: 1px solid var(--ff-line);
}
.ff-doctab {
  font: inherit; font-size: 11px; cursor: pointer;
  padding: 4px 14px;
  background: #d2d8e2; color: #4c5666;
  border: 1px solid var(--ff-line); border-bottom: none;
  border-radius: 3px 3px 0 0;
}
.ff-doctab:hover { background: #e4e9f1; }
.ff-doctab-on {
  background: #fff; color: var(--ff-ink); font-weight: 600;
  box-shadow: 0 1px 0 #fff;
}

.ff-body { flex: 1; min-height: 0; display: flex; background: #fff; }

/* --- status bar --------------------------------------------------------- */
.ff-statusbar {
  display: flex; align-items: center; gap: 10px;
  padding: 4px 8px;
  background: var(--ff-face-2);
  border-top: 1px solid var(--ff-line);
  font-size: 10.5px; color: var(--ff-dim);
}
.ff-sb-pane {
  font-family: ui-monospace, Consolas, monospace;
  padding: 1px 8px; background: #fff; border: 1px solid var(--ff-line);
}
.ff-sb-warn { color: #8a5a00; }
.ff-sb-hint { margin-left: auto; }

/* --- ladder ------------------------------------------------------------- */
.ff-ladder { flex: 1; min-height: 0; display: flex; flex-direction: column; background: #fff; }
.ff-ladder-scroll { flex: 1; min-height: 0; overflow: auto; }
.ff-ladder-scroll::-webkit-scrollbar { width: 14px; height: 14px; }
.ff-ladder-scroll::-webkit-scrollbar-thumb {
  background: #c3cad6; border: 3px solid #fff; border-radius: 7px;
}
.ff-ladder-scroll::-webkit-scrollbar-track { background: #f1f3f7; }

.ff-empty, .ff-parse-error { padding: 18px; font-size: 12px; color: var(--ff-dim); }
.ff-parse-error { color: var(--ff-red); }

/* width:max-content is what makes the rung's own chrome — its selected
   background, its separator, its gutter's right edge — run the whole length of a
   rung that is wider than the pane. As a plain block it would be sized by the
   SCROLL CONTAINER, so scrolling right ran off the end of its own row and the
   selection highlight stopped in mid-air. min-width keeps short rungs full
   width. */
.ff-rung {
  display: flex; align-items: stretch;
  width: max-content; min-width: 100%;
  border-bottom: 1px solid #e3e7ee;
}
.ff-rung-sel { background: #f6f9ff; }
.ff-rung-end { color: var(--ff-blue); }

.ff-gutter {
  flex: none; width: 54px;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 6px 0;
  font: inherit; cursor: pointer; text-align: center;
  background: #eef1f5; border: none; border-right: 1px solid var(--ff-line);
  color: var(--ff-blue);
}
.ff-gutter:hover { background: #e2e9f7; }
.ff-gutter-static, .ff-gutter-static:hover { cursor: default; background: #eef1f5; }
.ff-gutter-on { background: #d7e6ff; box-shadow: inset 2px 0 0 var(--ff-sel); }
.ff-gutter-no {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px; letter-spacing: .04em;
}
.ff-zone {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px; font-weight: 700; color: #8a5a00;
}

/* No min-width:0 — the flex item must keep its content width so a wide rung
   makes the pane scroll horizontally instead of being silently clipped. Basis
   an auto basis rather than 0 for the same reason: under the row's max-content
   sizing the body must ask for its real width, and still grow on a short rung. */
.ff-rungbody { flex: 1 0 auto; padding: 4px 0 2px; }
.ff-rung-head {
  display: flex; align-items: center; gap: 8px;
  padding: 0 10px 2px; min-height: 18px;
}
.ff-comment {
  background: #fff4bf; border: 1px solid #d9c26a; color: #3a3110;
  padding: 1px 7px; font-size: 10.5px; max-width: 62ch;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ff-badge {
  padding: 1px 7px; font-size: 10px; letter-spacing: .06em;
  background: #fdeaea; border: 1px solid #d08a86; color: #8c1f18;
}
.ff-badge-eq { background: #fdeccd; border-color: #d09a2c; color: #7a5200; }
.ff-offline-note { color: var(--ff-dim); font-size: 10px; letter-spacing: .02em; }
.ff-revert {
  margin-left: auto; flex: none;
  font: inherit; font-size: 10.5px; cursor: pointer;
  padding: 2px 9px;
  background: linear-gradient(180deg, #fbfcfe, var(--ff-face));
  border: 1px solid var(--ff-line); border-radius: 3px; color: #333b49;
}
.ff-revert:hover { background: #e8effb; border-color: #7c9cd8; }

.ff-end-mark {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px; color: var(--ff-blue); padding: 4px 10px;
}

.ff-svgwrap { position: relative; }
.ff-svg { display: block; }

/* The rails go thick and green the moment the processor is scanning — the one
   thing you can read off an online RSLogix screen from across a room. */
.ff-rail { stroke: #8b94a4; stroke-width: 3; }
.ff-run .ff-rail { stroke: var(--ff-green); stroke-width: 4.5; }

.ff-wire { stroke: var(--ff-blue); stroke-width: 1.6; }
.ff-wire[data-s="2"] { stroke: var(--ff-green); stroke-width: 3.4; }
.ff-bar { stroke: var(--ff-blue); stroke-width: 2.4; }
.ff-bar[data-s="1"] { stroke: var(--ff-amber); }
.ff-bar[data-s="2"] { stroke: var(--ff-green); stroke-width: 3.2; }
.ff-coil { stroke: var(--ff-blue); stroke-width: 2.4; fill: none; }
.ff-coil[data-s="2"] { stroke: var(--ff-green); stroke-width: 3.2; }

/* AN EDITED RUNG IS NOT RUNNING, SO IT IS NOT COLOURED.
   The shape drawn is the draft; the processor is still scanning what was
   downloaded. Blue would claim "this rung is cold" and green would claim "power
   is here" — both are assertions about a program that is not executing. Grey is
   the only honest ink, and it is why a download visibly brings the rung back to
   life. Placed after the state rules so it wins on equal specificity even if the
   paint loop is ever allowed to write here again. */
.ff-svg-offline .ff-rail { stroke: #c3cad6; stroke-width: 3; }
.ff-svg-offline .ff-wire { stroke: #a4adbb; stroke-width: 1.6; }
.ff-svg-offline .ff-bar { stroke: #98a2b1; stroke-width: 2.4; }
.ff-svg-offline .ff-coil { stroke: #98a2b1; stroke-width: 2.4; }
.ff-svg-offline .ff-addr { fill: #7a8494; }
.ff-svg-offline .ff-chip { fill: #f1f3f7; stroke: #c3cad6; }
.ff-svg-offline .ff-chip-t { fill: #838d9c; }

.ff-addr {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px; text-anchor: middle; fill: #16202e;
}
.ff-mn {
  font-family: "Segoe UI", system-ui, sans-serif;
  font-size: 9px; text-anchor: middle; fill: #7a8494; letter-spacing: .08em;
}
/* Symbol chips are STATIC — a real editor does not animate them, and a label
   that changed colour with the bit would compete with the power flow. */
.ff-chip { fill: #ddf3dd; stroke: #86b886; stroke-width: 1; }
.ff-chip-t {
  font-family: "Segoe UI", system-ui, sans-serif;
  font-size: 9px; text-anchor: middle; fill: #1d3a1d;
}

.ff-hit { fill: transparent; cursor: pointer; }
.ff-hit:hover { fill: rgba(26,86,219,.06); }
.ff-sel { fill: rgba(26,86,219,.10); stroke: var(--ff-sel); stroke-width: 1.5; }

.ff-slot { cursor: pointer; }
.ff-slot rect {
  fill: #fff; stroke: var(--ff-sel); stroke-width: 1.2; stroke-dasharray: 3 2;
}
.ff-slot text {
  font-family: "Segoe UI", system-ui, sans-serif;
  font-size: 14px; font-weight: 700; text-anchor: middle; fill: var(--ff-sel);
  pointer-events: none;
}
.ff-slot:hover rect { fill: #d7e6ff; stroke-dasharray: none; }
.ff-slot-br rect { stroke: #0d8b3a; }
.ff-slot-br text { fill: #0d8b3a; }
.ff-slot-br:hover rect { fill: #d8f3e0; }

/* --- address popover ---------------------------------------------------- */
.ff-pop-scrim { position: fixed; inset: 0; z-index: 1; }
.ff-pop {
  position: absolute; z-index: 2;
  transform: translateX(-50%);
  width: 244px;
  background: #fff;
  border: 1px solid #6f7c8f;
  box-shadow: 0 10px 26px rgba(16,21,28,.28);
}
.ff-pop-head {
  padding: 4px 8px; font-size: 10.5px; color: #f2f5fa;
  background: linear-gradient(180deg, #2c4f8a, #1d3865);
}
.ff-pop-input {
  display: block; width: 100%; box-sizing: border-box;
  font: inherit; font-family: ui-monospace, Consolas, monospace; font-size: 12px;
  padding: 5px 7px; border: none; border-bottom: 1px solid var(--ff-line);
  color: var(--ff-ink); background: #fff;
}
.ff-pop-input:focus { outline: 2px solid var(--ff-sel); outline-offset: -2px; }
.ff-pop-list { list-style: none; margin: 0; padding: 0; max-height: 190px; overflow: auto; }
.ff-pop-row {
  display: flex; align-items: baseline; gap: 8px; width: 100%;
  font: inherit; text-align: left; cursor: pointer;
  padding: 4px 8px; background: #fff; border: none;
}
.ff-pop-row:hover { background: #d7e6ff; }
.ff-pop-cur { background: #eef3fd; }
.ff-pop-new { background: #fff8e6; }
/* The row Enter commits, marked so the list cannot promise something the
   keyboard does not do. */
.ff-pop-first { box-shadow: inset 2px 0 0 var(--ff-sel); }
.ff-pop-enter { margin-left: auto; font-size: 11px; color: var(--ff-sel); }
.ff-pop-id {
  font-family: ui-monospace, Consolas, monospace; font-size: 11.5px;
  color: var(--ff-blue); min-width: 62px;
}
.ff-pop-label { font-size: 10.5px; color: var(--ff-dim); }
.ff-pop-none { padding: 6px 8px; font-size: 11px; color: var(--ff-dim); }

/* --- ladder status line ------------------------------------------------- */
.ff-status {
  display: flex; align-items: center; gap: 10px;
  padding: 5px 10px; min-height: 26px;
  background: var(--ff-face);
  border-top: 1px solid var(--ff-line);
  font-size: 11px; color: var(--ff-dim);
}
.ff-status-armed { color: var(--ff-ink); font-weight: 600; }
.ff-status-hint { color: var(--ff-dim); }
.ff-status-cancel {
  font: inherit; font-size: 10.5px; cursor: pointer;
  padding: 2px 9px;
  background: #fff; border: 1px solid var(--ff-line); border-radius: 3px;
  color: #333b49;
}
.ff-status-cancel:hover { background: #e8effb; }
.ff-notice {
  margin-left: auto; font: inherit; font-size: 10.5px; cursor: pointer;
  padding: 2px 9px;
  background: #fdeccd; border: 1px solid #d09a2c; color: #6b4700;
}

/* --- I/O table ---------------------------------------------------------- */
.ff-io { flex: 1; min-height: 0; overflow: auto; background: #fff; }
.ff-io::-webkit-scrollbar { width: 14px; }
.ff-io::-webkit-scrollbar-thumb {
  background: #c3cad6; border: 3px solid #fff; border-radius: 7px;
}
.ff-io::-webkit-scrollbar-track { background: #f1f3f7; }
.ff-io-head {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 10px; font-size: 11px; color: var(--ff-dim);
  background: var(--ff-face); border-bottom: 1px solid var(--ff-line);
  position: sticky; top: 0; z-index: 1;
}
.ff-io-count { margin-left: auto; }
.ff-io-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.ff-io-table th {
  text-align: left; padding: 5px 10px; font-weight: 600;
  color: #333b49; background: var(--ff-face-2);
  border-bottom: 1px solid var(--ff-line);
}
.ff-io-table td {
  padding: 3px 10px; border-bottom: 1px solid #eceff4; color: #333b49;
}
/* THE ZEBRA STOPS AT THE VALUE COLUMN, AND THAT :not() IS THE WHOLE POINT.
   Everywhere else the row background is decoration; in the Value column the
   background IS the reading. Striped plainly, this selector — one class plus
   :nth-child plus three element names — outranks the .ff-io-val powered rule,
   which has no element names at all, so on every EVEN row the stripe quietly
   ate the green and left only the dark-green text behind. The bit was 1, the
   paint loop had correctly written data-s="2", and the cell still looked off:
   FILL_VALVE and FILL_LIGHT sat grey while RUN_LIGHT one row between them
   glowed, purely because of where they landed in an alphabetical sort. A
   player cannot unsee that, and the only story it tells is a false one.
   Excluding the cell is better than out-specifying it: it leaves exactly one
   owner for that background rather than starting a specificity arms race with
   whatever rule someone adds to this table next. */
.ff-io-table tbody tr:nth-child(even) td:not(.ff-io-val) { background: #f8fafc; }
.ff-io-addr {
  font-family: ui-monospace, Consolas, monospace;
  color: var(--ff-blue); width: 96px;
}
.ff-io-sym { width: 168px; color: #16202e; }
.ff-io-type { width: 62px; color: var(--ff-dim); }
.ff-io-val {
  width: 62px; text-align: center; font-weight: 700;
  font-family: ui-monospace, Consolas, monospace;
  color: #6b7382; background: var(--ff-bit-off);
}
.ff-io-val[data-s="2"] { color: #06340f; background: var(--ff-bit-on); }

/* The Data Files key. Same layout as the ladder's key below, but the swatches
   are cell-shaped rather than the ladder's 12x3 wire stubs, because they are
   standing in for a filled cell and a swatch should look like the thing it
   names. Two states only: this table has no equivalent of "made, not fed" —
   a bit is 1 or it is 0. */
.ff-io-key { font-size: 11px; }
.ff-io-sw {
  width: 15px; height: 11px; border-radius: 2px; flex: none;
  margin-left: 0.55rem; border: 1px solid #c3cad6;
}
.ff-io-sw:first-child { margin-left: 0; }
.ff-io-sw-off { background: var(--ff-bit-off); }
.ff-io-sw-on { background: var(--ff-bit-on); border-color: #4aa863; }

/* Colour key in the status bar. Swatches are drawn from the same three custom
   properties the rungs use, so the key cannot describe a palette the ladder no
   longer has. */
.ff-sb-key, .ff-io-key {
  display: flex; align-items: center; gap: 0.3rem;
  color: var(--ff-dim); white-space: nowrap;
}
.ff-key-sw {
  width: 12px; height: 3px; border-radius: 1px;
  margin-left: 0.55rem; flex: none;
}
.ff-key-sw:first-child { margin-left: 0; }
.ff-key-cold { background: var(--ff-blue); }
.ff-key-made { background: var(--ff-amber); }
.ff-key-live { background: var(--ff-green); }
.ff-io-desc { color: var(--ff-dim); font-size: 10.5px; }

/* --- deck --------------------------------------------------------------- */
.ff-deck {
  position: relative;
  height: 30px;
  background: linear-gradient(180deg, #3f444c 0%, #23262c 55%, #16181c 100%);
  border: 1px solid #494f58; border-top: none;
  border-radius: 0 0 12px 12px;
  box-shadow: 0 24px 50px rgba(0,0,0,.7);
}
.ff-hinge {
  position: absolute; top: 0; left: 12%; right: 12%; height: 4px;
  background: linear-gradient(180deg, #0a0c10, #4b515a);
  border-radius: 0 0 3px 3px;
}
.ff-keys {
  position: absolute; top: 11px; left: 8%; right: 8%; height: 9px;
  background:
    repeating-linear-gradient(90deg, rgba(255,255,255,.07) 0 12px, rgba(0,0,0,0) 12px 15px);
  opacity: .6;
}
.ff-plate {
  position: absolute; right: 16px; bottom: 4px;
  font-size: 8px; letter-spacing: .22em; color: #6b7280;
}
`
