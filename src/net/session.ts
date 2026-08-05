/**
 * session.ts — the seam between "two people are in this factory" and whatever
 * actually carries the bytes.
 *
 * NOTHING IN THIS FILE TALKS TO A NETWORK. That is deliberate. The expensive
 * part of multiplayer is not the transport — WebRTC via Trystero is about
 * fifteen lines — it is discovering, six weeks in, that the game's state was
 * never shaped like something you could send. So this pass builds the shape and
 * runs it against two local transports, which means every call site downstream
 * (the lobby store, the avatars, eventually the cell's authority gate) is
 * written against the real interface from day one and the transport swap is a
 * one-line change in TRANSPORTS below.
 *
 * ── Two transports ship today ────────────────────────────────────────────────
 *
 *   'local'     One player, no peers, ever. Zero timers, zero listeners, zero
 *               allocations after construction. This is what solo uses and it
 *               is why solo costs nothing.
 *
 *   'loopback'  BroadcastChannel. Same browser, same origin, different tabs.
 *               Still not a network — no sockets, no signalling server, no
 *               dependency — but it is genuinely two independent page instances
 *               exchanging the real wire format, which is enough to prove the
 *               interface, the lobby, the join/leave lifecycle and the avatar
 *               interpolation all actually work. Open the game in two tabs,
 *               host in one, paste the code into the other.
 *
 * ── Where a real transport slots in ──────────────────────────────────────────
 *
 * Implement TransportFactory and add it to TRANSPORTS. Nothing else changes.
 * With Trystero (`npm i trystero`, no server to run — it signals over public
 * BitTorrent/Nostr/MQTT infrastructure) the whole implementation is:
 *
 *     import { joinRoom } from 'trystero'
 *
 *     export const trysteroTransport: TransportFactory = (room, selfId, hooks) => {
 *       const r = joinRoom({ appId: 'fault-found', password: room }, room)
 *       const [sendRaw, onRaw] = r.makeAction<string>('n')
 *       r.onPeerJoin(hooks.onPeer)
 *       r.onPeerLeave(hooks.onLeave)
 *       onRaw((raw, from) => hooks.onData(from, raw))
 *       hooks.onStatus('connected')
 *       return {
 *         kind: 'trystero',
 *         send: (raw) => { sendRaw(raw) },
 *         close: () => { r.leave() },
 *       }
 *     }
 *
 * Two mismatches to handle when that day comes, both already accounted for in
 * the interface above:
 *
 *  1. Trystero mints its OWN peer ids and does not let you choose one. `selfId`
 *     here is therefore advisory; the identity the rest of the game keys on is
 *     whatever `hooks.onPeer` reports, and the `hello` message carries the
 *     human-facing name separately for exactly this reason.
 *  2. Trystero rooms are symmetric — there is no host in the protocol. That is
 *     fine, because "host" in this game does not mean "runs the server", it
 *     means "owns the simulation": see isAuthority().
 *
 * ── Authority ────────────────────────────────────────────────────────────────
 *
 * Per the state audit, the cell is already split into a sense half (physical →
 * PLC) and an obey half (PLC → physical), and the obey half is a pure function
 * of the Zustand tag map, so it runs correctly on every client with no changes
 * at all. Only the sense half needs a gate, and isAuthority() is that gate: the
 * host senses and publishes, guests read the replicated tags and obey them.
 * That is why the wire format below reserves a 'sim' message it does not yet
 * send — so adding it later is not a protocol change.
 */

// ─── Identity and wire types ─────────────────────────────────────────────────

export type PeerId = string

/** Who this client is in the session. 'solo' is the default and costs nothing. */
export type SessionRole = 'solo' | 'host' | 'guest'

/**
 * Which body a player wears. See PlayerAvatar.tsx — both variants are the same
 * rig, differing by proportion and material, so this is one byte on the wire
 * rather than a second model download.
 */
export type AvatarVariant = 'male' | 'female'

export type SessionStatus =
  | 'idle'        // no session object exists
  | 'connecting'  // transport opened, nobody has answered yet
  | 'connected'   // the channel is up (peers may still be zero)
  | 'error'       // see the error string that came with it
  | 'closed'      // deliberately torn down

/**
 * Everything one player is.
 *
 * `pos` is the FEET, in world metres, matching the avatar model's origin — not
 * the camera and not the physics capsule centre, both of which are 1.7 and 0.85
 * up from here respectively. Publishing the feet means the receiver never needs
 * to know the sender's eye height.
 *
 * `yaw` is in the MODEL's convention: 0 faces +Z, increasing towards +X, i.e.
 * `Math.atan2(forward.x, forward.z)`. This is the same convention Supervisor.tsx
 * uses, because it is the same rig.
 *
 * IMPORTANT: `pos`, `yaw` and `moving` are written many times a second. See the
 * note on lobbyStore.peers — they are mutated in place and are NOT reactive.
 */
export interface PlayerState {
  id: PeerId
  name: string
  variant: AvatarVariant
  pos: [number, number, number]
  yaw: number
  moving: boolean
  /** performance.now() when this was last written. Used to drop stale peers. */
  t: number
}

/**
 * The wire format. Keys are one character because this goes out at ~12 Hz per
 * player and JSON key names are most of a movement packet.
 */
export type NetMessage =
  /**
   * Sent on connect and in reply to another peer's hello. Identity only.
   *
   * `r` marks THIS hello as a reply, and it is the entire reason the handshake
   * terminates: a hello without it must always be answered, a hello with it
   * must never be. Putting the guard on the message rather than on the sender's
   * memory of who it has met is what makes the exchange symmetric — see the
   * note on `greeted` in createSession().
   */
  | { k: 'hello'; player: PlayerState; r?: boolean }
  /** Movement. The only high-rate message. */
  | { k: 'move'; id: PeerId; p: [number, number, number]; y: number; m: boolean }
  /** Deliberate departure. Absence of heartbeat covers the crash case. */
  | { k: 'bye'; id: PeerId }
  /**
   * RESERVED — not sent yet. The authority's physical-state snapshot: carton x
   * positions, per-carton fill, gate, door, selector. The state audit costed the
   * whole thing at 21 bytes. Declared now so that adding it is not a protocol
   * change, and so the guest-side branch in the reader below already exists.
   */
  | { k: 'sim'; seq: number; data: number[] }

export interface SessionEvents {
  status: { status: SessionStatus; error?: string }
  /** A peer sent its hello. Fires once per peer, after identity is known. */
  join: PlayerState
  leave: PeerId
  /** Everything, including messages already handled internally. */
  message: { from: PeerId; msg: NetMessage }
}
export type SessionEvent = keyof SessionEvents

// ─── Share codes ─────────────────────────────────────────────────────────────

/**
 * Uppercase, six characters, and every glyph that gets misread over a voice
 * call or in a screenshot is gone: no O, no 0, no I, no 1. What is left is 32
 * symbols, so a code is exactly 30 bits and there are 1.07 billion of them —
 * far more than enough that two people hosting at the same moment will not
 * collide, and short enough to read out loud.
 *
 * L and 5 and S are kept. They are only confusable in fonts this game does not
 * use; the UI renders codes in JetBrains Mono, where they are distinct.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6

/** A fresh share code. Uses crypto when it is there, Math.random when it isn't. */
export function makeShareCode(): string {
  const n = CODE_ALPHABET.length
  const bytes = new Uint8Array(CODE_LENGTH)
  const c = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : undefined
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes)
  else for (let i = 0; i < CODE_LENGTH; i++) bytes[i] = Math.floor(Math.random() * 256)

  let out = ''
  // 256 % 32 === 0, so the modulo is unbiased. That is the one good reason to
  // have picked an alphabet whose length divides 256.
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % n]
  return out
}

/**
 * Tidy up what a human typed or pasted, WITHOUT silently repairing it.
 *
 * Case, whitespace and the separators people add by hand (`-`, `_`, `.`) are
 * noise and are removed. Anything else is left exactly where it is, so that
 * codeProblem() can point at the actual bad character. Stripping unknown
 * characters instead would turn "AB0CDEF" into a valid-looking six-character
 * code that is not the code anyone meant — a silent wrong answer, which is the
 * worst kind.
 */
export function normaliseCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-_.]/g, '')
}

/**
 * Null when the code is fine, otherwise a sentence to put under the input.
 * Returns the FIRST problem only — a list of everything wrong with a six
 * character string is not help, it is noise.
 */
export function codeProblem(raw: string): string | null {
  const code = normaliseCode(raw)
  if (code.length === 0) return 'Enter the six-character code from the host.'
  for (const ch of code) {
    if (CODE_ALPHABET.includes(ch)) continue
    // The four characters we deliberately left out get their own message,
    // because "that is not a valid character" is infuriating when you are
    // staring at a letter that plainly exists.
    if (ch === 'O' || ch === '0') return 'Codes never contain O or zero — they are too easy to confuse.'
    if (ch === 'I' || ch === '1') return 'Codes never contain I or one — they are too easy to confuse.'
    return `"${ch}" is not part of a share code.`
  }
  if (code.length < CODE_LENGTH) return `${CODE_LENGTH - code.length} more character${code.length === CODE_LENGTH - 1 ? '' : 's'}.`
  if (code.length > CODE_LENGTH) return `Codes are ${CODE_LENGTH} characters; that is ${code.length}.`
  return null
}

export function isValidCode(raw: string): boolean {
  return codeProblem(raw) === null
}

// ─── Transports ──────────────────────────────────────────────────────────────

/** What a transport must hand back to the session. */
export interface TransportHooks {
  onPeer(id: PeerId): void
  onLeave(id: PeerId): void
  onData(from: PeerId, raw: string): void
  onStatus(status: SessionStatus, error?: string): void
}

export interface Transport {
  readonly kind: string
  send(raw: string): void
  close(): void
}

export type TransportFactory = (room: string, selfId: PeerId, hooks: TransportHooks) => Transport

export type TransportName = 'local' | 'loopback'

/**
 * Solo. Reports itself up and then does absolutely nothing for the rest of its
 * life: no channel, no timers, no event listeners, and send() is a no-op rather
 * than a queue, so a stray publish costs one function call.
 */
const localTransport: TransportFactory = (_room, _selfId, hooks) => {
  hooks.onStatus('connected')
  return { kind: 'local', send: () => {}, close: () => {} }
}

/** Presence and payload frames for the loopback transport. */
interface LoopFrame { f: 'hi' | 'bye' | 'd'; from: PeerId; raw?: string }

const HEARTBEAT_MS = 2500
/** Roughly three missed heartbeats. Covers a tab that was killed, not closed. */
const PEER_TIMEOUT_MS = 8000

/**
 * BroadcastChannel between tabs of the same browser.
 *
 * BroadcastChannel has no concept of membership — you cannot ask who else is
 * listening — so presence is built on top of it the same way a real mesh does
 * it: announce on arrival, answer newcomers once, heartbeat, and time out
 * anyone who stops. That is not busywork for a fake transport; it is the exact
 * lifecycle the lobby has to handle when the transport IS real, and building
 * the UI against a transport where peers only ever appear cleanly is how you
 * ship a lobby with permanent ghosts in it.
 */
const loopbackTransport: TransportFactory = (room, selfId, hooks) => {
  // The SSR pass has neither of these. Node 18+ DOES have BroadcastChannel — it
  // comes from worker_threads — but no `window`, so testing for the channel
  // alone got as far as addEventListener and threw. Both, therefore.
  // Fail loudly and return a working no-op rather than throwing out through a
  // store action and taking the menu down with it.
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    hooks.onStatus('error', 'This browser cannot open a local channel.')
    return { kind: 'loopback/unavailable', send: () => {}, close: () => {} }
  }

  const ch = new BroadcastChannel(`faultfound:${room}`)
  /** id → last time we heard anything from it. */
  const seen = new Map<PeerId, number>()
  let closed = false

  const post = (frame: LoopFrame) => {
    if (closed) return
    try { ch.postMessage(frame) } catch { /* a closed channel is not an error worth raising */ }
  }

  ch.onmessage = (e: MessageEvent) => {
    const frame = e.data as LoopFrame | null
    if (!frame || typeof frame.from !== 'string' || frame.from === selfId) return

    if (frame.f === 'bye') {
      if (seen.delete(frame.from)) hooks.onLeave(frame.from)
      return
    }

    const isNew = !seen.has(frame.from)
    seen.set(frame.from, performance.now())
    if (isNew) hooks.onPeer(frame.from)

    // Answer a newcomer so it learns we exist — but ONLY a newcomer. Answering
    // every hello makes two tabs volley forever; this terminates in three
    // messages because the second answer finds the sender already known.
    if (frame.f === 'hi' && isNew) post({ f: 'hi', from: selfId })
    if (frame.f === 'd' && typeof frame.raw === 'string') hooks.onData(frame.from, frame.raw)
  }

  const beat = setInterval(() => {
    post({ f: 'hi', from: selfId })
    const now = performance.now()
    for (const [id, at] of seen) {
      if (now - at <= PEER_TIMEOUT_MS) continue
      seen.delete(id)
      hooks.onLeave(id)
    }
  }, HEARTBEAT_MS)

  // pagehide, not beforeunload: beforeunload does not fire on mobile Safari or
  // on a bfcache navigation, and a player who navigates away should not linger
  // in someone else's lobby for eight seconds.
  const bye = () => post({ f: 'bye', from: selfId })
  window.addEventListener('pagehide', bye)

  post({ f: 'hi', from: selfId })
  hooks.onStatus('connected')

  return {
    kind: 'loopback',
    send: (raw) => post({ f: 'd', from: selfId, raw }),
    close: () => {
      if (closed) return
      bye()
      closed = true
      clearInterval(beat)
      window.removeEventListener('pagehide', bye)
      ch.onmessage = null
      ch.close()
    },
  }
}

/** Swap the real transport in here. Nothing else in the codebase names one. */
const TRANSPORTS: Record<TransportName, TransportFactory> = {
  local: localTransport,
  loopback: loopbackTransport,
}

// ─── Session ─────────────────────────────────────────────────────────────────

export interface SessionOptions {
  role: SessionRole
  /** Required for host and guest; ignored for solo. */
  code?: string | null
  name: string
  variant: AvatarVariant
  /**
   * The peer id to use. One is minted when this is absent.
   *
   * The lobby passes one in, because the name shown for a player who never
   * typed one is derived from their id (TECH-4F2A) and the name has to be
   * settled before the session exists — it goes out in the very first hello.
   */
  id?: PeerId
  /**
   * Defaults to 'local' for solo and 'loopback' otherwise.
   *
   * A TransportFactory may be passed directly. That is how a real transport
   * gets tried without editing TRANSPORTS, and how the handshake above is
   * tested against a pair of sessions on an in-memory bus.
   */
  transport?: TransportName | TransportFactory
}

export interface Session {
  /** This client's peer id. Stable for the life of the session. */
  readonly id: PeerId
  readonly role: SessionRole
  /** The share code, or null when solo. */
  readonly code: string | null
  /** Which transport is underneath. Useful in the UI: "local tabs only". */
  readonly transport: string
  status(): SessionStatus
  /**
   * Does this client own the simulation?
   *
   * True when solo (obviously) and when hosting. This is the gate the silo
   * cell's sense half needs — see the header. It is a method rather than a
   * field because the answer will eventually be able to change mid-session,
   * when the host leaves and someone is promoted.
   */
  isAuthority(): boolean
  on<K extends SessionEvent>(ev: K, cb: (payload: SessionEvents[K]) => void): () => void
  /** Fire and forget. Ordering is not guaranteed and nothing is retried. */
  send(msg: NetMessage): void
  /**
   * Publish the local player's motion. Safe to call every frame — it throttles
   * to SEND_HZ internally and drops updates that have not moved anything, so
   * standing still sends nothing at all.
   */
  publish(pos: readonly [number, number, number], yaw: number, moving: boolean): void
  close(): void
}

/** Movement packets per second. 12 is plenty given the receiver interpolates. */
const SEND_HZ = 12
const SEND_INTERVAL_MS = 1000 / SEND_HZ
/** Below this, a player has not really moved and the packet is not worth sending. */
const POS_EPSILON = 0.02
const YAW_EPSILON = 0.02

/**
 * A fresh peer id. Exported because the lobby needs one BEFORE it builds the
 * session — the default display name is derived from it.
 */
export function makePeerId(): PeerId {
  const c = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID().slice(0, 8)
  return Math.random().toString(36).slice(2, 10)
}

/**
 * How long a guest waits for somebody in the room to answer before we call the
 * code wrong.
 *
 * A room that exists answers in milliseconds — the transport announces on open
 * and an occupant replies to a newcomer immediately — so this is not a latency
 * budget, it is the interval after which silence means something. Long enough
 * that a busy tab is not accused of typing badly, short enough that nobody
 * stares at a spinner wondering.
 */
const JOIN_TIMEOUT_MS = 6000

type AnyHandler = (payload: never) => void

export function createSession(opts: SessionOptions): Session {
  const id = opts.id ?? makePeerId()
  const role = opts.role
  const code = role === 'solo' ? null : (opts.code ?? null)
  const factory: TransportFactory =
    typeof opts.transport === 'function'
      ? opts.transport
      : TRANSPORTS[opts.transport ?? (role === 'solo' ? 'local' : 'loopback')]
  /** Solo. Every send is dropped before it costs anything. */
  const inert = factory === localTransport

  const listeners = new Map<SessionEvent, Set<AnyHandler>>()
  let status: SessionStatus = role === 'solo' ? 'connected' : 'connecting'
  let closed = false

  /**
   * Events raised before this function has returned have nowhere to go: the
   * caller cannot possibly have subscribed yet, because it does not have the
   * session. A transport is entitled to report a peer, or a whole hello, from
   * inside its own constructor — the in-memory bus used to test the handshake
   * does exactly that, and so will any transport that finds a connection
   * already open — and every one of those events used to be emitted into an
   * empty listener map and lost. The status case happened to be covered because
   * the store reads status() directly after attaching; a 'join' was simply gone,
   * leaving a peer who is on the wire and not in the roster.
   *
   * So emissions queue until the end of the constructor and are flushed on the
   * next microtask, by which point the synchronous `attach(createSession(...))`
   * the store does has subscribed. `live` stays false until the flush actually
   * runs, so anything emitted in the gap queues behind the backlog rather than
   * overtaking it and arriving out of order.
   */
  let live = false
  const backlog: Array<() => void> = []

  function emit<K extends SessionEvent>(ev: K, payload: SessionEvents[K]) {
    if (!live) { backlog.push(() => deliver(ev, payload)); return }
    deliver(ev, payload)
  }

  function deliver<K extends SessionEvent>(ev: K, payload: SessionEvents[K]) {
    const set = listeners.get(ev)
    if (!set) return
    // Copied before iterating: a handler that unsubscribes itself — which the
    // lobby store's teardown does — would otherwise mutate the set mid-loop.
    for (const cb of [...set]) (cb as (p: SessionEvents[K]) => void)(payload)
  }

  const self: PlayerState = {
    id,
    name: opts.name,
    variant: opts.variant,
    pos: [0, 0, 0],
    yaw: 0,
    moving: false,
    t: 0,
  }

  /**
   * Peers we have already introduced ourselves to, UNPROMPTED.
   *
   * The volley this used to guard is real: "answer a hello with a hello" —
   * which you need, or the peer who was already in the room never learns the
   * newcomer's name — never terminates if you do it unconditionally, because
   * each side answers the answer forever, at whatever rate the transport can
   * manage. The mistake was guarding the ANSWER on this set. It made the
   * exchange asymmetric, and the failure it caused is not exotic:
   *
   *   A and B are in a room and have met. B's tab goes to the background, where
   *   browsers throttle timers to about one a minute, so its heartbeat stops. A
   *   times B out and drops it — correctly; that is what the timeout is for. B
   *   is still hearing A, so B drops nothing. B comes back to the foreground and
   *   announces. A sees a new peer and re-introduces itself. B has met A before,
   *   so the old guard swallowed B's reply — and A, which no longer knows who B
   *   is, never hears the one message that would tell it. B is on the wire, in
   *   the heartbeat, and permanently absent from A's roster.
   *
   * So this set now suppresses only the redundant unprompted announcement, and
   * the thing that stops the volley is the `r` flag on the message itself: a
   * reply is never replied to. The exchange is two messages instead of three,
   * and it recovers from one side forgetting the other.
   */
  const greeted = new Set<PeerId>()

  /** Introduce ourselves to a peer we have just noticed. Once each. */
  function announce(peer: PeerId) {
    if (greeted.has(peer)) return
    greeted.add(peer)
    send({ k: 'hello', player: self })
  }

  /**
   * A guest's transport being open does not mean the code was right.
   *
   * Every transport here — and any real one — will happily open a channel named
   * after six characters nobody is listening to, and report itself connected,
   * because from the transport's point of view it IS connected. Reporting that
   * up as success makes a typo indistinguishable from a room whose host has not
   * arrived: both read "CONNECTED · nobody else yet", which is the single most
   * confusing thing this menu could say. A guest is therefore not connected
   * until somebody in the room answers, and if nobody does, that is an error
   * with a sentence attached.
   *
   * Hosts and solo skip all of this: an empty room you opened yourself is not a
   * failure, and solo never even builds a timer.
   */
  let arrived = role !== 'guest'
  let arrivalTimer: ReturnType<typeof setTimeout> | null = null

  function setStatus(s: SessionStatus, error?: string) {
    status = s
    emit('status', { status: s, error })
  }

  function clearArrivalTimer() {
    if (arrivalTimer === null) return
    clearTimeout(arrivalTimer)
    arrivalTimer = null
  }

  /** Somebody in the room answered: the code was real. Recoverable, and late
   *  arrivals count, so a guest who timed out still joins if the host shows up. */
  function noteArrival() {
    if (arrived || closed) return
    arrived = true
    clearArrivalTimer()
    setStatus('connected')
  }

  const hooks: TransportHooks = {
    // A transport-level peer is not yet a player: we know something is there but
    // not who. Introduce ourselves and wait for its hello. The 'join' event
    // fires from the hello handler, not here, so the lobby never shows a
    // nameless row that fills itself in a moment later.
    onPeer: announce,
    onLeave: (peer) => {
      greeted.delete(peer)
      emit('leave', peer)
    },
    onData: (from, raw) => {
      let msg: NetMessage
      try { msg = JSON.parse(raw) as NetMessage } catch { return }
      if (!msg || typeof msg !== 'object' || typeof msg.k !== 'string') return

      if (msg.k === 'hello') {
        // Reply unless this was itself a reply. Unconditionally: see `greeted`.
        greeted.add(from)
        if (!msg.r) send({ k: 'hello', player: self, r: true })
        noteArrival()
        emit('join', msg.player)
      } else if (msg.k === 'bye') {
        greeted.delete(msg.id)
        emit('leave', msg.id)
      }
      emit('message', { from, msg })
    },
    onStatus: (s, error) => {
      if (closed) return
      if (s === 'connected' && !arrived) {
        // The channel is up; the room is not confirmed. Hold at 'connecting'
        // and start the clock.
        if (arrivalTimer === null) {
          arrivalTimer = setTimeout(() => {
            arrivalTimer = null
            if (closed || arrived) return
            setStatus('error', code
              ? `Nobody answered ${code}. Check the code, and check the host has opened their session.`
              : 'Nobody answered that code. Check it with the host.')
          }, JOIN_TIMEOUT_MS)
        }
        setStatus('connecting')
        return
      }
      setStatus(s, error)
    },
  }

  /**
   * Assigned below, and null until then — which matters, because a transport is
   * entitled to report a peer from inside its own constructor. The in-memory
   * bus used to test the handshake does exactly that, and so, plausibly, will a
   * transport that finds an already-open connection. When it happens, announce()
   * runs before `factory` has returned, send() is reached with no transport, and
   * a plain `const transport = factory(...)` throws "cannot access before
   * initialization" out through the store action that opened the session.
   *
   * So outbound frames queue until the transport is there, and are flushed the
   * moment it is.
   */
  let transport: Transport | null = null
  const pending: string[] = []

  function send(msg: NetMessage) {
    if (closed || inert) return
    const raw = JSON.stringify(msg)
    if (transport) transport.send(raw)
    else pending.push(raw)
  }

  const open = factory(code ?? 'solo', id, hooks)
  transport = open
  for (const raw of pending.splice(0)) open.send(raw)

  let lastSend = 0
  let lastPos: [number, number, number] = [NaN, NaN, NaN]
  let lastYaw = NaN
  let lastMoving = false

  const api: Session = {
    id,
    role,
    code,
    transport: open.kind,
    status: () => status,
    isAuthority: () => role !== 'guest',
    on(ev, cb) {
      let set = listeners.get(ev)
      if (!set) { set = new Set(); listeners.set(ev, set) }
      const bag = set
      bag.add(cb as AnyHandler)
      return () => { bag.delete(cb as AnyHandler) }
    },
    send,
    publish(pos, yaw, moving) {
      // Solo returns on the first comparison. This is called from useFrame, so
      // the cost of NOT being in a session has to be about one property read.
      if (closed || inert) return
      const now = performance.now()
      if (now - lastSend < SEND_INTERVAL_MS) return
      const still =
        Math.abs(pos[0] - lastPos[0]) < POS_EPSILON &&
        Math.abs(pos[1] - lastPos[1]) < POS_EPSILON &&
        Math.abs(pos[2] - lastPos[2]) < POS_EPSILON &&
        Math.abs(yaw - lastYaw) < YAW_EPSILON &&
        moving === lastMoving
      if (still) return
      lastSend = now
      lastPos = [pos[0], pos[1], pos[2]]
      lastYaw = yaw
      lastMoving = moving
      self.pos = lastPos
      self.yaw = yaw
      self.moving = moving
      self.t = now
      send({ k: 'move', id, p: lastPos, y: yaw, m: moving })
    },
    close() {
      if (closed) return
      send({ k: 'bye', id })
      closed = true
      clearArrivalTimer()
      status = 'closed'
      // Straight to the handlers. A close is the last thing anyone hears, and
      // queueing it behind a microtask that may never be reached — leave() drops
      // its subscriptions on the next line — would be a status nobody gets.
      deliver('status', { status: 'closed' })
      open.close()
      listeners.clear()
      backlog.length = 0
    },
  }

  // Everything the transport said while it was being built is still queued. The
  // caller is one `return` away from being able to subscribe; give it that, then
  // let the events through in the order they happened.
  queueMicrotask(() => {
    live = true
    for (const f of backlog.splice(0)) f()
  })

  return api
}

/** Start hosting. The code is on the returned session. */
export function hostSession(opts: { name: string; variant: AvatarVariant; id?: PeerId }): Session {
  return createSession({ ...opts, role: 'host', code: makeShareCode() })
}

/**
 * Join someone else's session. Throws on a malformed code rather than opening a
 * channel named after nonsense — the caller has codeProblem() to check first,
 * and this is the backstop.
 */
export function joinSession(
  code: string,
  opts: { name: string; variant: AvatarVariant; id?: PeerId },
): Session {
  const clean = normaliseCode(code)
  const problem = codeProblem(clean)
  if (problem) throw new Error(problem)
  return createSession({ ...opts, role: 'guest', code: clean })
}
