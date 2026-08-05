'use client'

/**
 * MultiplayerMenu — the crew panel.
 *
 * NOT SHIPPED IN THIS BUILD. page.tsx does not mount it and MULTIPLAYER_ENABLED
 * below is false; the reasoning is written out there. Everything past that flag
 * describes how it behaves when it is switched on, which is how it was left:
 * working, honest about what the transport can actually do, and one line from
 * being reachable again.
 *
 * Lives outside the Canvas with the rest of the full-screen DOM, because drei's
 * PointerLockControls binds click-to-lock to `selector="canvas"` and anything
 * rendered inside the Canvas is a lock target. The launcher deliberately calls
 * stopPropagation on its own click: GameCanvas's ClickOverlay is a full-screen
 * div with onClick={handleStart} behind it, so without that, opening the crew
 * panel would also start the shift.
 *
 * It shows only on the title screen (`started === false`). Mid-shift there is
 * nothing here to change: you cannot swap bodies with a man standing in the room
 * looking at you.
 *
 * KEYBOARD
 *   Tab            moves through every control; focus is visible, drawn in red
 *   Escape         closes the panel (keymap.ts binds nothing on 'title')
 *   Enter          in the code field, joins
 *   Enter/Space    on any button, activates it — they are real <button>s
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useLobbyStore, cleanName, MAX_NAME } from '@/stores/lobbyStore'
import { codeProblem, normaliseCode, CODE_LENGTH, type AvatarVariant } from '@/net/session'

/**
 * OFF, deliberately, and the one line to change when it is not.
 *
 * Multiplayer is not in this release. What exists is groundwork: the lobby, the
 * codes, the roster and the join lifecycle are real and correct, and the
 * transport underneath them is a BroadcastChannel, which reaches other TABS of
 * this browser and nothing else. There is no network and the machine is not
 * shared.
 *
 * A tester who finds this panel will do the obvious thing — take a code, send it
 * to someone, watch nothing happen — and file a bug, and be right to. No
 * disclaimer prevents that; it only costs them the time it takes to disbelieve
 * it. The launcher also sits bottom-centre on the title screen, arguing with the
 * one instruction that screen exists to give. So the button is not rendered.
 *
 * Hiding it costs nothing: with page.tsx not mounting <MultiplayerMenu />, none
 * of this reaches the client bundle, while the file stays type-checked, linted
 * and honest. Flip this to true and mount the component and the panel is back.
 */
const MULTIPLAYER_ENABLED: boolean = false

const RED = '#e63946'
const MONO = '"JetBrains Mono", monospace'
const INK = '#e8e4e0'

type Tab = 'solo' | 'host' | 'join'

// ─── Small shared pieces ─────────────────────────────────────────────────────

function Logo({ size = '1.4rem' }: { size?: string }) {
  return (
    <div style={{ fontSize: size, fontWeight: 700, fontFamily: MONO, letterSpacing: '0.1em' }}>
      <span style={{ color: INK }}>FAULT</span>
      {/* Braced so the slashes are not read as a JSX comment. */}
      <span style={{ color: RED }}>{'//'}</span>
      <span style={{ color: INK }}>FOUND</span>
    </div>
  )
}

interface BtnProps {
  children: React.ReactNode
  onClick: () => void
  variant?: 'primary' | 'ghost' | 'quiet'
  disabled?: boolean
  title?: string
  /** Rendered as pressed. Used for the three mode tabs. */
  active?: boolean
  grow?: boolean
}

function Btn({ children, onClick, variant = 'ghost', disabled, title, active, grow }: BtnProps) {
  const [hot, setHot] = useState(false)
  const primary = variant === 'primary'
  const quiet = variant === 'quiet'

  const bg = disabled ? 'rgba(255,255,255,0.02)'
    : primary ? RED
    : active ? 'rgba(230, 57, 70, 0.15)'
    : hot ? 'rgba(255,255,255,0.08)'
    : quiet ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.03)'

  const fg = disabled ? '#4c525e'
    : primary ? '#fff'
    : active ? RED
    : quiet ? '#8890a0' : '#d0d4dc'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      style={{
        flex: grow ? 1 : undefined,
        background: bg,
        color: fg,
        border: primary ? 'none'
          : active ? `1px solid ${RED}`
          : '1px solid rgba(255,255,255,0.1)',
        padding: '0.7rem 1.1rem',
        fontSize: '0.78rem',
        fontWeight: 600,
        letterSpacing: '0.1em',
        borderRadius: '4px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: MONO,
        textTransform: 'uppercase',
        // Not outline:none. The pointer is free on this screen but the whole
        // point of this menu is that it also works without one.
        outlineOffset: '2px',
        boxShadow: primary ? '0 4px 14px rgba(230, 57, 70, 0.2)' : undefined,
        transition: 'background 0.12s ease',
      }}
    >
      {children}
    </button>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '0.62rem', letterSpacing: '0.16em', textTransform: 'uppercase',
      color: RED, fontFamily: MONO, marginBottom: '0.45rem', opacity: 0.85,
    }}>
      {children}
    </div>
  )
}

// ─── Panel ───────────────────────────────────────────────────────────────────

function Panel() {
  const role = useLobbyStore(s => s.role)
  const status = useLobbyStore(s => s.status)
  const error = useLobbyStore(s => s.error)
  const shareCode = useLobbyStore(s => s.shareCode)
  const transport = useLobbyStore(s => s.transport)
  const localName = useLobbyStore(s => s.localName)
  const localVariant = useLobbyStore(s => s.localVariant)
  const peers = useLobbyStore(s => s.peers)
  const setLocalName = useLobbyStore(s => s.setLocalName)
  const setLocalVariant = useLobbyStore(s => s.setLocalVariant)
  const setMenuOpen = useLobbyStore(s => s.setMenuOpen)
  const host = useLobbyStore(s => s.host)
  const join = useLobbyStore(s => s.join)
  const leave = useLobbyStore(s => s.leave)
  const clearError = useLobbyStore(s => s.clearError)
  const localId = useLobbyStore(s => s.localId)

  // The tab follows the role when there is one — reopening the panel while
  // hosting should not present the SOLO tab as if nothing were running.
  const [tab, setTab] = useState<Tab>(
    role === 'host' ? 'host' : role === 'guest' ? 'join' : 'solo')
  const [draft, setDraft] = useState('')
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'manual'>('idle')
  const codeRef = useRef<HTMLInputElement>(null)
  const codeBoxRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const close = useCallback(() => setMenuOpen(false), [setMenuOpen])

  useEffect(() => {
    // Safe to own Escape here: keymap.ts dispatches on UiFocus and 'title' —
    // the only focus this panel is ever visible in — has nothing bound.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  // Somewhere sensible for the keyboard to start, and somewhere that is not a
  // destructive control.
  useEffect(() => { closeRef.current?.focus() }, [])
  useEffect(() => { if (tab === 'join') codeRef.current?.focus() }, [tab])

  // The live validation the JOIN button reads. Null draft = untouched, so the
  // field does not scold you before you have typed anything.
  const problem = draft.length === 0 ? null : codeProblem(draft)
  const canJoin = draft.length > 0 && problem === null

  const doJoin = useCallback(() => {
    if (!canJoin) return
    join(draft)
  }, [canJoin, draft, join])

  /**
   * The clipboard API needs a secure context and a permission, and on
   * http://<lan-ip> — exactly where you would be testing this with someone in
   * the same room — `navigator.clipboard` is simply not there. So the failure
   * path is a real path: select the code so a manual copy works, and say so
   * rather than flashing "Copied" at somebody whose clipboard is empty.
   */
  const doCopy = useCallback(async () => {
    if (!shareCode) return
    try {
      await navigator.clipboard.writeText(shareCode)
      setCopyState('done')
    } catch {
      const el = codeBoxRef.current
      const sel = typeof window.getSelection === 'function' ? window.getSelection() : null
      if (el && sel) {
        const range = document.createRange()
        range.selectNodeContents(el)
        sel.removeAllRanges()
        sel.addRange(range)
      }
      setCopyState('manual')
    }
    window.setTimeout(() => setCopyState('idle'), 2200)
  }, [shareCode])

  const peerIds = Object.keys(peers)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crew"
      style={{
        position: 'fixed', inset: 0, zIndex: 210,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(5, 5, 8, 0.88)', backdropFilter: 'blur(8px)',
        fontFamily: '"Inter", sans-serif', color: '#d0d4dc',
      }}
      onClick={(e) => { e.stopPropagation() }}
      onMouseDown={(e) => { e.stopPropagation() }}
      onPointerDown={(e) => { e.stopPropagation() }}
    >
      <div style={{
        width: 'min(560px, calc(100vw - 2rem))',
        maxHeight: 'calc(100vh - 2rem)',
        overflowY: 'auto',
        background: 'linear-gradient(180deg, #16181e 0%, #1a1c24 100%)',
        border: '1px solid rgba(230, 57, 70, 0.15)',
        borderRadius: '8px',
        padding: '1.4rem 1.8rem 1.6rem',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(230,57,70,0.05)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '1.2rem', paddingBottom: '0.75rem',
          borderBottom: '1px solid rgba(230, 57, 70, 0.1)',
        }}>
          <div>
            <Logo />
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.22em', opacity: 0.35, fontFamily: MONO, marginTop: '0.3rem' }}>
              CREW
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            style={{
              background: 'rgba(230,57,70,0.1)', border: '1px solid rgba(230,57,70,0.3)',
              color: RED, fontSize: '0.68rem', padding: '0.35rem 0.7rem', borderRadius: '4px',
              cursor: 'pointer', fontFamily: MONO, fontWeight: 600, letterSpacing: '0.08em',
            }}
          >
            CLOSE
          </button>
        </div>

        {/* Identity */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.2rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <Label>Your name</Label>
            <input
              type="text"
              value={localName}
              maxLength={MAX_NAME}
              placeholder="TECHNICIAN"
              onChange={(e) => setLocalName(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '4px', color: INK, fontFamily: MONO, fontSize: '0.85rem',
                padding: '0.55rem 0.7rem', letterSpacing: '0.06em', outlineOffset: '2px',
              }}
            />
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <Label>Body</Label>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              {(['male', 'female'] as AvatarVariant[]).map((v) => (
                <Btn key={v} active={localVariant === v} onClick={() => setLocalVariant(v)}>
                  {v}
                </Btn>
              ))}
            </div>
          </div>
        </div>

        {/* Mode */}
        <Label>Mode</Label>
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.1rem' }}>
          <Btn grow active={tab === 'solo'} onClick={() => { setTab('solo'); leave() }}>Solo</Btn>
          <Btn grow active={tab === 'host'} onClick={() => setTab('host')}>Host</Btn>
          <Btn grow active={tab === 'join'} onClick={() => setTab('join')}>Join</Btn>
        </div>

        {/* ── SOLO ─────────────────────────────────────────────────────────── */}
        {tab === 'solo' && (
          <div style={{ fontSize: '0.8rem', lineHeight: 1.65, opacity: 0.72 }}>
            One technician, one fault, nobody to blame. This is the default and it
            is what the game already does — close this panel and take the shift.
            <div style={{ fontSize: '0.68rem', opacity: 0.5, marginTop: '0.7rem', fontFamily: MONO }}>
              No session is opened. Nothing is broadcast.
            </div>
          </div>
        )}

        {/* ── HOST ─────────────────────────────────────────────────────────── */}
        {tab === 'host' && (
          <div>
            {role !== 'host' || !shareCode ? (
              <div>
                {/*
                  This used to say the machine was "simulated here and mirrored
                  to everyone else". It is not — nothing is mirrored yet. The
                  lobby, the codes and the roster are real; the shared machine is
                  not built. Promising it here would be a lie told by the product
                  to its own player, and the first thing anyone would do is test
                  it. Say what it does.
                */}
                <div style={{ fontSize: '0.8rem', lineHeight: 1.65, opacity: 0.72, marginBottom: '0.75rem' }}>
                  Open a session and hand out the code. You are the host, so the
                  job and the clock are yours.
                </div>
                <div style={{
                  fontSize: '0.72rem', lineHeight: 1.6, marginBottom: '1rem',
                  padding: '0.6rem 0.75rem', borderRadius: '3px',
                  border: '1px solid rgba(230,57,70,0.35)',
                  background: 'rgba(230,57,70,0.07)', color: 'rgba(255,255,255,0.7)',
                }}>
                  PREVIEW — the lobby works, but the machine is not shared yet.
                  You will see each other; you will not see the same cell.
                </div>
                <Btn variant="primary" onClick={host}>Create a session</Btn>
              </div>
            ) : (
              <div>
                <Label>Share code</Label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
                  <div ref={codeBoxRef} style={{
                    flex: 1, fontFamily: MONO, fontSize: '1.9rem', fontWeight: 700,
                    letterSpacing: '0.34em', color: RED, textAlign: 'center',
                    background: 'rgba(0,0,0,0.4)', border: `1px solid rgba(230,57,70,0.35)`,
                    borderRadius: '4px', padding: '0.6rem 0 0.6rem 0.34em',
                    userSelect: 'all',
                  }}>
                    {shareCode}
                  </div>
                  <Btn onClick={() => { void doCopy() }}>
                    {copyState === 'done' ? 'Copied' : copyState === 'manual' ? 'Selected' : 'Copy'}
                  </Btn>
                </div>
                <div style={{ fontSize: '0.68rem', opacity: 0.45, marginTop: '0.6rem', fontFamily: MONO }}>
                  {copyState === 'manual'
                    ? 'No clipboard access here — the code is selected, copy it by hand.'
                    : `${CODE_LENGTH} characters. Never contains O, 0, I or 1.`}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── JOIN ─────────────────────────────────────────────────────────── */}
        {tab === 'join' && (
          <div>
            <Label>Host&apos;s code</Label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                ref={codeRef}
                type="text"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                value={draft}
                placeholder="ABC234"
                onChange={(e) => {
                  // Editing the code retires the verdict on the last one.
                  clearError()
                  setDraft(normaliseCode(e.target.value).slice(0, CODE_LENGTH + 2))
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') doJoin() }}
                aria-invalid={problem !== null}
                style={{
                  flex: 1, minWidth: 0, boxSizing: 'border-box',
                  background: 'rgba(0,0,0,0.4)',
                  border: `1px solid ${problem ? 'rgba(230,57,70,0.6)' : 'rgba(255,255,255,0.12)'}`,
                  borderRadius: '4px', color: INK, fontFamily: MONO,
                  fontSize: '1.4rem', fontWeight: 700, letterSpacing: '0.3em',
                  padding: '0.5rem 0 0.5rem 0.8rem', textAlign: 'center', outlineOffset: '2px',
                }}
              />
              <Btn variant="primary" onClick={doJoin} disabled={!canJoin}>Join</Btn>
            </div>
            <div style={{
              fontSize: '0.72rem', marginTop: '0.55rem', minHeight: '1.1rem',
              color: problem ? RED : '#8890a0',
              fontFamily: problem ? MONO : undefined,
            }}>
              {problem ?? (canJoin ? 'Looks like a code.' : 'Ask the host for their six-character code.')}
            </div>
          </div>
        )}

        {/*
          ── Error ──────────────────────────────────────────────────────────
          Outside the roster block, which is where it used to live, and which
          only renders when role !== 'solo'. The error join() sets for a bad
          code is set while the role is still 'solo' — join() returns before it
          ever opens a session — so the one message this panel most needed to
          show was the one message it structurally could not. Errors are shown
          wherever they come from.
        */}
        {error && (
          <div style={{
            marginTop: '1rem', fontSize: '0.72rem', lineHeight: 1.5, color: RED,
            fontFamily: MONO,
            background: 'rgba(230,57,70,0.08)', border: '1px solid rgba(230,57,70,0.25)',
            borderRadius: '4px', padding: '0.5rem 0.65rem',
          }}>
            {error}
          </div>
        )}

        {/* ── Status and roster ────────────────────────────────────────────── */}
        {role !== 'solo' && (
          <div style={{ marginTop: '1.3rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.6rem' }}>
              <Label>On the floor</Label>
              <div style={{ fontSize: '0.62rem', fontFamily: MONO, letterSpacing: '0.08em', opacity: 0.45 }}>
                {status.toUpperCase()}
                {transport ? ` · ${transport.toUpperCase()}` : ''}
              </div>
            </div>

            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <li style={rowStyle(true)}>
                {/* The name the OTHERS see, not this panel's placeholder. An
                    unnamed player is TECH-4F2A on every roster in the room and
                    showing them 'TECHNICIAN' here would make their own row the
                    only one that lies. */}
                <span style={{ color: INK }}>{cleanName(localName, localId)}</span>
                <span style={{ fontSize: '0.6rem', opacity: 0.5, letterSpacing: '0.12em' }}>
                  YOU · {role.toUpperCase()} · {localVariant.toUpperCase()}
                </span>
              </li>
              {peerIds.map((id) => (
                <li key={id} style={rowStyle(false)}>
                  <span style={{ color: INK }}>{peers[id].name}</span>
                  <span style={{ fontSize: '0.6rem', opacity: 0.5, letterSpacing: '0.12em' }}>
                    {peers[id].variant.toUpperCase()}
                  </span>
                </li>
              ))}
              {peerIds.length === 0 && (
                <li style={{ ...rowStyle(false), opacity: 0.45, fontStyle: 'italic' }}>
                  {/* A guest that is still 'connecting' has not found the room
                      yet — saying "nobody else" would report the wrong fact and
                      then contradict itself six seconds later. */}
                  {status === 'connecting'
                    ? 'Looking for the session…'
                    : 'Nobody else yet.'}
                </li>
              )}
            </ul>

            <div style={{ marginTop: '0.9rem' }}>
              <Btn variant="quiet" onClick={() => { leave(); setTab('solo') }}>Leave session</Btn>
            </div>
          </div>
        )}

        {/* The honest footnote. There is no network here yet and saying so is
            cheaper than someone discovering it from a friend's blank screen. */}
        <div style={{
          marginTop: '1.3rem', paddingTop: '0.8rem',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          fontSize: '0.64rem', lineHeight: 1.6, opacity: 0.4, fontFamily: MONO,
        }}>
          GROUNDWORK BUILD — the transport is local to this browser. Codes reach
          other TABS on this machine, not other machines. See src/net/session.ts.
        </div>
      </div>
    </div>
  )
}

function rowStyle(you: boolean): React.CSSProperties {
  return {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.45rem 0.7rem', borderRadius: '4px', fontSize: '0.78rem',
    fontFamily: MONO,
    background: you ? 'rgba(230,57,70,0.08)' : 'rgba(255,255,255,0.03)',
    border: you ? '1px solid rgba(230,57,70,0.2)' : '1px solid rgba(255,255,255,0.05)',
  }
}

// ─── Launcher + mount ────────────────────────────────────────────────────────

export function MultiplayerMenu() {
  const started = useSettingsStore(s => s.started)
  const menuOpen = useLobbyStore(s => s.menuOpen)
  const setMenuOpen = useLobbyStore(s => s.setMenuOpen)
  const role = useLobbyStore(s => s.role)
  const peerCount = useLobbyStore(s => Object.keys(s.peers).length)
  const hydrate = useLobbyStore(s => s.hydrate)

  useEffect(() => {
    if (!MULTIPLAYER_ENABLED) return
    hydrate()
  }, [hydrate])

  // See MULTIPLAYER_ENABLED. After the hooks, never before — an early return
  // above them makes every hook below it conditional.
  if (!MULTIPLAYER_ENABLED) return null

  if (started) return null

  if (menuOpen) return <Panel />

  const summary = role === 'solo'
    ? 'SOLO'
    : `${role.toUpperCase()} · ${peerCount + 1}`

  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: '5vh', zIndex: 60,
      display: 'flex', justifyContent: 'center', pointerEvents: 'none',
    }}>
      <button
        type="button"
        // The title screen's ClickOverlay is a full-screen div with an onClick
        // that starts the shift. Without stopping here, opening this panel would
        // also start the game underneath it.
        onClick={(e) => { e.stopPropagation(); setMenuOpen(true) }}
        style={{
          pointerEvents: 'auto',
          background: 'rgba(10,10,14,0.75)',
          border: `1px solid ${role === 'solo' ? 'rgba(255,255,255,0.14)' : 'rgba(230,57,70,0.5)'}`,
          color: role === 'solo' ? '#98a0ac' : RED,
          fontFamily: MONO, fontSize: '0.72rem', fontWeight: 600,
          letterSpacing: '0.14em', padding: '0.6rem 1.3rem',
          borderRadius: '4px', cursor: 'pointer', outlineOffset: '2px',
        }}
      >
        [ CREW: {summary} ]
      </button>
    </div>
  )
}
