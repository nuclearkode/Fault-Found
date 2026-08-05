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
 * in here cannot reach the game. It also never touches the pointer lock —
 * `PointerLockWarden` is the only thing allowed to release it.
 *
 * The world keeps running while this is open (SIMULATES.laptop is true): the
 * player is reading a LIVE machine and the shift clock is burning, which is why
 * the clock is on the title bar where they cannot miss it.
 */

import { useEffect, useRef } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useLaptopStore } from '@/stores/laptopStore'
import { LadderView } from './LadderView'
import { IoTable } from './IoTable'

const clock = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const stamp = (ms: number): string => {
  if (ms === 0) return 'NONE THIS SESSION'
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
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

export function Laptop() {
  const open = useSettingsStore((s) => s.overlay === 'laptop')
  const scenarioId = useGameStore((s) => s.scenarioId)

  const tab = useLaptopStore((s) => s.tab)
  const setTab = useLaptopStore((s) => s.setTab)
  const pending = useLaptopStore((s) => Object.keys(s.drafts).length)
  const download = useLaptopStore((s) => s.download)
  const clearDrafts = useLaptopStore((s) => s.clearDrafts)
  const setNotice = useLaptopStore((s) => s.setNotice)
  const lastDownload = useLaptopStore((s) => s.lastDownload)

  /**
   * Drafts belong to the program they were written against. When the running
   * program is REPLACED — a new job loading, a restart — a draft keyed by rung
   * id would silently apply to a different rung, so it is dropped. (A download
   * replaces `rungs` too and lands here harmlessly: it has already cleared.)
   */
  useEffect(() => useGameStore.subscribe((s) => s.rungs, clearDrafts), [clearDrafts])

  if (!open) return null

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
            <div className="ff-screen">
              <header className="ff-top">
                <span className="ff-id">
                  <b>FIELDMASTER</b> 400
                </span>
                <span className="ff-online">
                  <i className="ff-led" />
                  PROCESSOR ONLINE · {scenarioId ?? 'NO JOB'} · RUN MODE
                </span>
                <nav className="ff-tabs">
                  <button
                    className={tab === 'ladder' ? 'ff-tab ff-tab-on' : 'ff-tab'}
                    onClick={() => setTab('ladder')}
                  >
                    LADDER
                  </button>
                  <button
                    className={tab === 'io' ? 'ff-tab ff-tab-on' : 'ff-tab'}
                    onClick={() => setTab('io')}
                  >
                    I/O TABLE
                  </button>
                </nav>
                <span className="ff-shift">
                  SHIFT <ShiftClock />
                </span>
              </header>

              <div className="ff-body">
                {tab === 'ladder' ? <LadderView /> : <IoTable />}
              </div>

              <footer className="ff-bottom">
                <button
                  className="ff-download"
                  disabled={pending === 0}
                  onClick={() => {
                    const n = download()
                    setNotice(
                      n === 0
                        ? null
                        : `DOWNLOAD COMPLETE — ${n} RUNG${n === 1 ? '' : 'S'} WRITTEN TO PROCESSOR`,
                    )
                  }}
                >
                  DOWNLOAD TO PLC{pending > 0 ? ` (${pending})` : ''}
                </button>
                <button
                  className="ff-discard"
                  disabled={pending === 0}
                  onClick={() => clearDrafts()}
                >
                  DISCARD ALL EDITS
                </button>
                <span className="ff-last">LAST DOWNLOAD {stamp(lastDownload)}</span>
                <span className="ff-warn">
                  LINE IS RUNNING — THE SHIFT CLOCK DOES NOT STOP FOR THIS
                </span>
                <span className="ff-hint">[L] OR [ESC] TO CLOSE</span>
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
 *   data-s="0"  dead
 *   data-s="1"  contact made, but nothing is feeding it   (amber — read this one)
 *   data-s="2"  powered
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
  font-family: "JetBrains Mono", ui-monospace, "Courier New", monospace;
  animation: ff-fade 240ms ease both;
  overflow: hidden;
}
@keyframes ff-fade { from { opacity: 0 } to { opacity: 1 } }

.ff-stage {
  width: min(1240px, 97vw);
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
  height: min(76vh, 800px);
  background: linear-gradient(180deg, #23262c 0%, #15171b 8%, #101216 92%, #191c21 100%);
  border: 1px solid #2c3138;
  border-radius: 10px 10px 4px 4px;
  padding: 26px 16px 18px;
  box-shadow:
    0 -2px 0 rgba(255,255,255,.05) inset,
    0 40px 90px rgba(0,0,0,.75),
    0 0 0 1px rgba(0,0,0,.6);
}
.ff-cam {
  position: absolute; top: 11px; left: 50%; transform: translateX(-50%);
  width: 6px; height: 6px; border-radius: 50%;
  background: #0a0c10; box-shadow: 0 0 0 2px #2a2e35, 0 0 6px rgba(78,240,138,.25);
}

.ff-screen {
  height: 100%;
  display: flex; flex-direction: column;
  background:
    repeating-linear-gradient(0deg, rgba(0,0,0,.26) 0 1px, rgba(0,0,0,0) 1px 3px),
    radial-gradient(120% 100% at 50% 0%, #0d1a13 0%, #060b08 70%, #040705 100%);
  border: 1px solid #05100a;
  border-radius: 3px;
  box-shadow: 0 0 42px rgba(78,240,138,.10) inset, 0 0 0 1px rgba(78,240,138,.06) inset;
  color: #8ef0b0;
  overflow: hidden;
}

/* --- chrome ------------------------------------------------------------ */
.ff-top {
  display: flex; align-items: center; gap: 14px;
  padding: 7px 12px;
  border-bottom: 1px solid rgba(78,240,138,.16);
  background: linear-gradient(180deg, rgba(78,240,138,.07), rgba(0,0,0,0));
  font-size: 11px; letter-spacing: .08em;
}
.ff-id { color: #cfe9d8; letter-spacing: .16em; }
.ff-id b { color: #e63946; font-weight: 700; }
.ff-online { color: #4c7f63; display: flex; align-items: center; gap: 7px; }
.ff-led {
  width: 7px; height: 7px; border-radius: 50%; background: #4ef08a;
  box-shadow: 0 0 8px #4ef08a; animation: ff-blink 2.4s steps(1) infinite;
}
@keyframes ff-blink { 0%,88% { opacity: 1 } 89%,100% { opacity: .25 } }
.ff-tabs { margin-left: auto; display: flex; gap: 6px; }
.ff-tab {
  font: inherit; font-size: 11px; letter-spacing: .12em;
  padding: 5px 14px; cursor: pointer;
  background: rgba(255,255,255,.02); color: #4c7f63;
  border: 1px solid rgba(78,240,138,.16); border-radius: 2px;
}
.ff-tab:hover { color: #8ef0b0; border-color: rgba(78,240,138,.34); }
.ff-tab-on {
  background: rgba(78,240,138,.13); color: #b6ffd2;
  border-color: rgba(78,240,138,.55);
  box-shadow: 0 0 12px rgba(78,240,138,.18);
}
.ff-shift { color: #4c7f63; letter-spacing: .12em; }
.ff-clock { color: #e63946; font-weight: 700; letter-spacing: .06em; margin-left: 6px; }

.ff-body { flex: 1; min-height: 0; display: flex; }

.ff-bottom {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 12px;
  border-top: 1px solid rgba(78,240,138,.16);
  background: linear-gradient(0deg, rgba(78,240,138,.05), rgba(0,0,0,0));
  font-size: 10px; letter-spacing: .1em; color: #3f6e55;
}
.ff-download {
  font: inherit; font-size: 11px; font-weight: 700; letter-spacing: .12em;
  padding: 7px 16px; cursor: pointer;
  background: #e63946; color: #0a0c10; border: 1px solid #ff5a66; border-radius: 2px;
  box-shadow: 0 0 18px rgba(230,57,70,.28);
}
.ff-download:disabled {
  background: rgba(255,255,255,.03); color: #35604a;
  border-color: rgba(78,240,138,.14); box-shadow: none; cursor: default;
}
.ff-discard {
  font: inherit; font-size: 10px; letter-spacing: .12em;
  padding: 7px 12px; cursor: pointer;
  background: rgba(255,255,255,.02); color: #6fbf90;
  border: 1px solid rgba(78,240,138,.2); border-radius: 2px;
}
.ff-discard:disabled { color: #2d5340; cursor: default; }
.ff-warn { margin-left: auto; color: #b9863a; }
.ff-hint { color: #3f6e55; }
.ff-last { color: #2f5b45; }

/* --- ladder ------------------------------------------------------------ */
.ff-ladder { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.ff-ladder-scroll { flex: 1; min-height: 0; overflow: auto; padding: 6px 0 10px; }
.ff-ladder-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
.ff-ladder-scroll::-webkit-scrollbar-thumb { background: rgba(78,240,138,.18); }
.ff-ladder-scroll::-webkit-scrollbar-track { background: rgba(0,0,0,.35); }

.ff-empty, .ff-parse-error {
  padding: 24px; font-size: 11px; letter-spacing: .12em; color: #4c7f63;
}
.ff-parse-error { color: #e63946; }

.ff-rung { border-bottom: 1px solid rgba(78,240,138,.08); }
.ff-rung-head {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 14px 0; font-size: 10px; letter-spacing: .1em;
}
.ff-rung-no { color: #4ef08a; opacity: .75; }
.ff-rung-desc { color: #3f6e55; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ff-badge {
  margin-left: auto; flex: none;
  padding: 2px 7px; border-radius: 2px;
  background: rgba(230,57,70,.15); color: #ff8f97; border: 1px solid rgba(230,57,70,.5);
  letter-spacing: .14em;
}
.ff-badge-eq { background: rgba(185,134,58,.14); color: #d9ab5c; border-color: rgba(185,134,58,.5); }
.ff-mini {
  font: inherit; font-size: 9px; letter-spacing: .12em; cursor: pointer;
  padding: 2px 8px; border-radius: 2px;
  background: transparent; color: #6fbf90; border: 1px solid rgba(78,240,138,.28);
}
.ff-mini:hover { background: rgba(78,240,138,.12); color: #c9ffdf; }

.ff-svg { display: block; }
.ff-rail { stroke: #3aa06a; stroke-width: 3; opacity: .8; }
.ff-wire { stroke: #1e3a2a; stroke-width: 2; }
.ff-wire[data-s="2"] { stroke: #4ef08a; filter: drop-shadow(0 0 3px rgba(78,240,138,.6)); }
.ff-bar { stroke: #2c4b39; stroke-width: 3; stroke-linecap: round; }
.ff-bar[data-s="1"] { stroke: #b9863a; }
.ff-bar[data-s="2"] { stroke: #4ef08a; filter: drop-shadow(0 0 4px rgba(78,240,138,.7)); }
.ff-coil { stroke: #2c4b39; stroke-width: 3; fill: none; stroke-linecap: round; }
.ff-coil[data-s="2"] { stroke: #4ef08a; filter: drop-shadow(0 0 5px rgba(78,240,138,.8)); }
.ff-addr {
  font-family: inherit; font-size: 11px; text-anchor: middle;
  fill: #4c7f63; letter-spacing: .04em;
}
.ff-addr[data-s="1"] { fill: #d9ab5c; }
.ff-addr[data-s="2"] { fill: #b6ffd2; }
.ff-label {
  font-family: inherit; font-size: 9px; text-anchor: middle;
  fill: #2f5b45; letter-spacing: .06em;
}
.ff-hit { fill: transparent; cursor: pointer; }
.ff-hit:hover { fill: rgba(78,240,138,.07); }
.ff-sel { fill: rgba(230,57,70,.1); stroke: #e63946; stroke-width: 1; }

/* --- editor ------------------------------------------------------------ */
.ff-editor {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 8px 14px;
  border-top: 1px solid rgba(78,240,138,.16);
  background: rgba(0,0,0,.4);
  font-size: 10px; letter-spacing: .1em; min-height: 42px;
}
.ff-editor-idle { color: #35604a; }
.ff-editor-tag { color: #b6ffd2; }
.ff-field { display: flex; align-items: center; gap: 6px; color: #4c7f63; }
.ff-field select {
  font: inherit; font-size: 10px; letter-spacing: .06em;
  padding: 4px 6px; cursor: pointer;
  background: #08130d; color: #8ef0b0;
  border: 1px solid rgba(78,240,138,.3); border-radius: 2px;
}
.ff-op {
  font: inherit; font-size: 10px; letter-spacing: .1em; cursor: pointer;
  padding: 5px 10px; border-radius: 2px;
  background: rgba(78,240,138,.06); color: #8ef0b0;
  border: 1px solid rgba(78,240,138,.26);
}
.ff-op:hover { background: rgba(78,240,138,.16); color: #d6ffe6; }
.ff-op:disabled { color: #2d5340; border-color: rgba(78,240,138,.1); background: none; cursor: default; }
.ff-op-danger { color: #ff8f97; border-color: rgba(230,57,70,.35); background: rgba(230,57,70,.08); }
.ff-op-danger:hover { background: rgba(230,57,70,.2); color: #ffd0d4; }
.ff-notice { margin-left: auto; color: #d9ab5c; }

/* --- I/O table --------------------------------------------------------- */
.ff-io { flex: 1; min-height: 0; overflow: auto; padding: 10px 14px 16px; }
.ff-io::-webkit-scrollbar { width: 10px; }
.ff-io::-webkit-scrollbar-thumb { background: rgba(78,240,138,.18); }
.ff-io::-webkit-scrollbar-track { background: rgba(0,0,0,.35); }
.ff-io-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.ff-io-table th {
  text-align: left; padding: 6px 10px; letter-spacing: .14em; font-weight: 400;
  color: #3f6e55; border-bottom: 1px solid rgba(78,240,138,.24);
}
.ff-io-table td {
  padding: 5px 10px; border-bottom: 1px solid rgba(78,240,138,.07); color: #4c7f63;
}
.ff-io-addr { color: #8ef0b0; width: 90px; letter-spacing: .06em; }
.ff-io-sym { color: #6fbf90; width: 150px; }
.ff-io-type { width: 70px; opacity: .6; }
.ff-io-val {
  width: 70px; text-align: center; font-weight: 700;
  color: #2c4b39; background: rgba(0,0,0,.35);
}
.ff-io-val[data-s="2"] {
  color: #0a0c10; background: #4ef08a; text-shadow: none;
  box-shadow: 0 0 12px rgba(78,240,138,.45);
}
.ff-io-desc { color: #2f5b45; font-size: 10px; }

/* --- deck -------------------------------------------------------------- */
.ff-deck {
  position: relative;
  height: 30px;
  background: linear-gradient(180deg, #262a31 0%, #14161a 55%, #0b0d10 100%);
  border: 1px solid #2c3138; border-top: none;
  border-radius: 0 0 12px 12px;
  box-shadow: 0 24px 50px rgba(0,0,0,.7);
}
.ff-hinge {
  position: absolute; top: 0; left: 12%; right: 12%; height: 4px;
  background: linear-gradient(180deg, #0a0c10, #33383f);
  border-radius: 0 0 3px 3px;
}
.ff-keys {
  position: absolute; top: 11px; left: 8%; right: 8%; height: 9px;
  background:
    repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0 12px, rgba(0,0,0,0) 12px 15px);
  opacity: .5;
}
.ff-plate {
  position: absolute; right: 16px; bottom: 4px;
  font-size: 8px; letter-spacing: .22em; color: #4a5058;
}
`
