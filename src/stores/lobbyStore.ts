'use client'

/**
 * lobbyStore — who is in this factory with you.
 *
 * One store, three roles, and a hard rule about what is reactive.
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 *
 * `peers` is a roster. Its OBJECT IDENTITY changes exactly three times in a
 * peer's life: when they join, when their identity changes, and when they
 * leave. It does NOT change when they move.
 *
 * Movement arrives at ~12 Hz per player. Cloning the roster on every packet
 * would be the same mistake gameStore.setTags already makes at 20 Hz — every
 * subscriber notified, every selector re-run, for data no React component reads
 * — except worse, because here the data really does belong to something that
 * renders. So movement is written STRAIGHT INTO the existing PlayerState object
 * with no set() call at all, and PlayerAvatar reads those fields in useFrame.
 *
 * Mutating store state in place is normally a sin. It is the right answer here
 * for the same reason SiloCell keeps its carton positions on a ref: the values
 * change at frame rate, nothing in the React tree renders from them, and the
 * one thing that does need them is already running per frame. The contract is
 * therefore explicit and narrow:
 *
 *     peers[id].name, .variant, .id     reactive. Safe to render.
 *     peers[id].pos, .yaw, .moving, .t  NOT reactive. useFrame only.
 *
 * ── Solo ─────────────────────────────────────────────────────────────────────
 *
 * role 'solo' is the default and the whole thing is inert: no session object,
 * no transport, no timers, no listeners, and publishLocal() returns on its
 * first line. Nothing in this file allocates until someone presses HOST or
 * JOIN.
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import {
  hostSession,
  joinSession,
  makePeerId,
  codeProblem,
  normaliseCode,
  type AvatarVariant,
  type PeerId,
  type PlayerState,
  type Session,
  type SessionRole,
  type SessionStatus,
} from '@/net/session'

const NAME_KEY = 'faultfound.crew.name'
const VARIANT_KEY = 'faultfound.crew.variant'
/** Longer than this and the nameplate stops being readable across the bay. */
export const MAX_NAME = 14

/**
 * The live session, deliberately OUTSIDE the store.
 *
 * It is not state — nothing renders from it, it has no meaningful equality, and
 * putting a thing with an .on() method into Zustand invites someone to
 * subscribe to it. The store holds the facts about the session; this holds the
 * session.
 */
let session: Session | null = null
/** Unsubscribe functions for the current session's event handlers. */
let unsubs: Array<() => void> = []

interface LobbyState {
  role: SessionRole
  status: SessionStatus
  /** Human-readable, already suitable for putting on screen. Null when fine. */
  error: string | null
  /** The six-character code, uppercase. Null unless hosting or joined. */
  shareCode: string | null
  /** This client's peer id, or null when solo. */
  localId: PeerId | null
  localName: string
  localVariant: AvatarVariant
  /** Which transport is underneath, for the honest label in the menu. */
  transport: string | null

  /**
   * REMOTE peers only — the local player is never in here, because the local
   * player is the camera and drawing a body on the camera is how you end up
   * looking at the inside of your own hard hat.
   */
  peers: Record<PeerId, PlayerState>

  /** Is the multiplayer panel open? UI state, but state, so it lives here. */
  menuOpen: boolean
  setMenuOpen: (v: boolean) => void

  setLocalName: (name: string) => void
  setLocalVariant: (v: AvatarVariant) => void
  /** Read the remembered name/variant from localStorage. Client-only, idempotent. */
  hydrate: () => void

  host: () => void
  join: (rawCode: string) => void
  /**
   * Drop a stale error. The menu calls this when the player edits the code they
   * were just told was wrong: an error about the last attempt has no business
   * sitting under the next one.
   */
  clearError: () => void
  /** Tear down whatever is running and go back to solo. Always safe to call. */
  leave: () => void

  /**
   * Push the local player's motion out. Called every frame from inside the
   * Canvas; throttled to the wire rate by the session. Returns immediately when
   * solo.
   */
  publishLocal: (pos: readonly [number, number, number], yaw: number, moving: boolean) => void
}

/**
 * Trim, clamp, and never let it be empty — a blank nameplate reads as a bug.
 *
 * The id matters. Most people will not type a name, and if the fallback ignores
 * the id then every one of them is called TECH: two anonymous players get the
 * same nameplate, the roster shows the same row twice, and the first thing the
 * lobby communicates is that it cannot tell people apart. Pass the id.
 *
 * Exported so the menu can show a player the same name everyone else sees,
 * rather than its own placeholder.
 */
export function cleanName(raw: string, id: PeerId | null): string {
  const n = raw.trim().slice(0, MAX_NAME)
  if (n) return n
  return id ? `TECH-${id.slice(0, 4).toUpperCase()}` : 'TECH'
}

export const useLobbyStore = create<LobbyState>()(
  subscribeWithSelector((set, get) => ({
    role: 'solo',
    status: 'idle',
    error: null,
    shareCode: null,
    localId: null,
    localName: '',
    localVariant: 'male',
    transport: null,
    peers: {},
    menuOpen: false,

    setMenuOpen: (v) => set({ menuOpen: v }),

    setLocalName: (name) => {
      set({ localName: name.slice(0, MAX_NAME) })
      try { localStorage.setItem(NAME_KEY, name.slice(0, MAX_NAME)) } catch { /* private mode */ }
    },

    setLocalVariant: (v) => {
      set({ localVariant: v })
      try { localStorage.setItem(VARIANT_KEY, v) } catch { /* private mode */ }
    },

    hydrate: () => {
      try {
        const name = localStorage.getItem(NAME_KEY)
        const variant = localStorage.getItem(VARIANT_KEY)
        set({
          localName: name ?? get().localName,
          localVariant: variant === 'female' || variant === 'male' ? variant : get().localVariant,
        })
      } catch { /* localStorage can throw outright in some privacy modes */ }
    },

    host: () => {
      get().leave()
      // The id is minted here rather than inside the session, because the name
      // that goes out in the first hello is derived from it when the player has
      // not typed one. See cleanName.
      const id = makePeerId()
      attach(hostSession({
        id,
        name: cleanName(get().localName, id),
        variant: get().localVariant,
      }))
    },

    join: (rawCode) => {
      const code = normaliseCode(rawCode)
      const problem = codeProblem(code)
      if (problem) {
        // Not thrown. A bad code is a normal thing for a person to type, and the
        // menu renders this string under the input.
        set({ error: problem, status: 'error' })
        return
      }
      get().leave()
      const id = makePeerId()
      attach(joinSession(code, {
        id,
        name: cleanName(get().localName, id),
        variant: get().localVariant,
      }))
    },

    clearError: () => {
      if (get().error === null) return
      // With no session running, 'error' was never a state of anything real —
      // it was the verdict on a string somebody typed. Go back to idle. With a
      // session running the status belongs to the session, so leave it alone.
      set({ error: null, status: session ? get().status : 'idle' })
    },

    leave: () => {
      for (const off of unsubs) off()
      unsubs = []
      session?.close()
      session = null
      set({
        role: 'solo',
        status: 'idle',
        error: null,
        shareCode: null,
        localId: null,
        transport: null,
        peers: {},
      })
    },

    publishLocal: (pos, yaw, moving) => {
      // The solo path in full. One null check per frame.
      const s = session
      if (!s) return
      s.publish(pos, yaw, moving)
    },
  }))
)

/** Wire a freshly created session into the store. */
function attach(s: Session) {
  const set = useLobbyStore.setState
  session = s

  unsubs.push(s.on('status', ({ status, error }) => {
    set({ status, error: error ?? null })
  }))

  unsubs.push(s.on('join', (player) => {
    // Replace the roster object — this is a join, so React SHOULD see it.
    const peers = { ...useLobbyStore.getState().peers }
    const existing = peers[player.id]
    if (existing) {
      // Already known: keep the object we have so any in-flight motion writes
      // are not thrown away, and refresh only the identity fields.
      existing.name = player.name
      existing.variant = player.variant
    } else {
      // `pos` is rebuilt rather than adopted. It came off the wire, so it is
      // whatever JSON.parse made of whatever the other side sent, and it is
      // about to be written into in place sixty times a second by code that
      // assumes three numbers. A peer with a malformed hello should show up
      // standing at the origin, not take the render loop down.
      const p = player.pos
      const pos: [number, number, number] = Array.isArray(p)
        ? [Number(p[0]) || 0, Number(p[1]) || 0, Number(p[2]) || 0]
        : [0, 0, 0]
      peers[player.id] = {
        ...player,
        pos,
        yaw: Number(player.yaw) || 0,
        moving: player.moving === true,
        t: performance.now(),
      }
    }
    set({ peers })
  }))

  unsubs.push(s.on('leave', (id) => {
    const peers = { ...useLobbyStore.getState().peers }
    if (!(id in peers)) return
    delete peers[id]
    set({ peers })
  }))

  unsubs.push(s.on('message', ({ msg }) => {
    if (msg.k !== 'move') return
    // ── The hot path ──────────────────────────────────────────────────────
    // No set(). No spread. No notification. See the header: these three
    // fields are read in useFrame by PlayerAvatar and by nothing else.
    const p = useLobbyStore.getState().peers[msg.id]
    if (!p) return   // a move from someone whose hello has not landed yet
    if (!Array.isArray(msg.p)) return
    p.pos[0] = Number(msg.p[0]) || 0
    p.pos[1] = Number(msg.p[1]) || 0
    p.pos[2] = Number(msg.p[2]) || 0
    p.yaw = Number(msg.y) || 0
    p.moving = msg.m === true
    p.t = performance.now()
  }))

  set({
    role: s.role,
    status: s.status(),
    shareCode: s.code,
    localId: s.id,
    transport: s.transport,
    error: null,
    peers: {},
  })
}

/**
 * Non-reactive read for useFrame, mirroring worldRunning()/uiFocus().
 *
 * A component that only needs "is anyone else here" every frame should call
 * this rather than subscribing, for the same reason the scan cycle does not
 * subscribe to the clock.
 */
export function isMultiplayer(): boolean {
  return useLobbyStore.getState().role !== 'solo'
}

/** The live PlayerState for a peer, or null. Motion fields are current. */
export function peerState(id: PeerId): PlayerState | null {
  return useLobbyStore.getState().peers[id] ?? null
}
