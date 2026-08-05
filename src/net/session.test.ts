/**
 * session.test.ts — the handshake, the arrival gate, and the two moments where
 * an event has nowhere to go.
 *
 * Every case here is a bug that shipped once. They are cheap to test and they
 * were expensive to see: all three failure modes look, from the UI, exactly like
 * "nobody else is here", which is also what success looks like when you are the
 * first one in the room. That is why they survived review.
 *
 * The bus below is a third transport, in-memory and synchronous. It exists to
 * exercise the two things the browser transports make hard to stage on purpose:
 * a peer reported from INSIDE the transport constructor, and one side dropping
 * the other while the other keeps listening — which is what a browser does to a
 * background tab every time it throttles its timers.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  createSession,
  type PeerId,
  type SessionStatus,
  type Transport,
  type TransportFactory,
  type TransportHooks,
} from './session'

class Bus {
  private members = new Map<PeerId, TransportHooks>()

  factory(): TransportFactory {
    return (_room, selfId, hooks) => {
      // Existing members are reported from inside the constructor, before the
      // factory has returned and long before the caller holds the session.
      for (const [id, h] of this.members) {
        hooks.onPeer(id)
        h.onPeer(selfId)
      }
      this.members.set(selfId, hooks)
      hooks.onStatus('connected')

      const t: Transport = {
        kind: 'bus',
        send: (raw) => {
          for (const [id, h] of this.members) if (id !== selfId) h.onData(selfId, raw)
        },
        close: () => {
          this.members.delete(selfId)
          for (const [, h] of this.members) h.onLeave(selfId)
        },
      }
      return t
    }
  }

  /** One side times the other out. The other notices nothing. */
  dropFrom(observer: PeerId, lost: PeerId) {
    this.members.get(observer)?.onLeave(lost)
  }

  /** A tab that went quiet is heard from again. */
  reannounce(from: PeerId) {
    for (const [id, h] of this.members) if (id !== from) h.onPeer(from)
  }
}

/** Events emitted during construction are flushed on a microtask. */
const settle = () => new Promise<void>((resolve) => { setTimeout(resolve, 0) })

const player = (name: string, transport: TransportFactory, role: 'host' | 'guest' = 'guest') =>
  createSession({ role, code: 'AAAAAA', name, variant: 'male', transport })

afterEach(() => { vi.useRealTimers() })

describe('hello handshake', () => {
  it('introduces both sides to each other', async () => {
    const bus = new Bus()
    const a = player('A', bus.factory(), 'host')
    const seenByA: string[] = []
    a.on('join', (p) => seenByA.push(p.name))

    const b = player('B', bus.factory())
    const seenByB: string[] = []
    b.on('join', (p) => seenByB.push(p.name))
    await settle()

    expect(seenByA).toEqual(['B'])
    expect(seenByB).toEqual(['A'])
  })

  it('terminates — a reply is never replied to', async () => {
    const bus = new Bus()
    let frames = 0
    const counted = (inner: TransportFactory): TransportFactory => (room, selfId, hooks) => {
      const t = inner(room, selfId, hooks)
      return { ...t, send: (raw) => { frames++; t.send(raw) } }
    }
    player('A', counted(bus.factory()), 'host')
    player('B', counted(bus.factory()))
    await settle()

    // One announcement and one reply. Anything unbounded shows up here first.
    expect(frames).toBeLessThanOrEqual(3)
  })

  it('re-learns a peer it dropped while the peer still knows it', async () => {
    const bus = new Bus()
    const a = player('A', bus.factory(), 'host')
    const joins: string[] = []
    const leaves: PeerId[] = []
    a.on('join', (p) => joins.push(p.name))
    a.on('leave', (id) => leaves.push(id))
    const b = player('B', bus.factory())
    await settle()
    expect(joins).toEqual(['B'])

    // B's tab is backgrounded: its heartbeat stops, A times it out. B, still
    // hearing A, drops nothing and goes on believing the two have met.
    bus.dropFrom(a.id, b.id)
    expect(leaves).toEqual([b.id])

    // B returns and announces. Its reply has to come, or A never learns who
    // this is and B is on the wire but absent from the roster forever.
    bus.reannounce(b.id)
    expect(joins).toEqual(['B', 'B'])
  })
})

describe('guest arrival', () => {
  it('holds at connecting until somebody answers', async () => {
    vi.useFakeTimers()
    const bus = new Bus()
    const seen: SessionStatus[] = []
    const g = player('G', bus.factory())
    g.on('status', (s) => seen.push(s.status))
    await vi.advanceTimersByTimeAsync(1)

    expect(seen).toEqual(['connecting'])
    expect(g.status()).toBe('connecting')
  })

  it('calls an unanswered code an error, and names it', async () => {
    vi.useFakeTimers()
    const bus = new Bus()
    const seen: Array<{ status: SessionStatus; error?: string }> = []
    const g = createSession({
      role: 'guest', code: 'ZZZZZZ', name: 'G', variant: 'male', transport: bus.factory(),
    })
    g.on('status', (s) => seen.push(s))
    await vi.advanceTimersByTimeAsync(7000)

    const last = seen[seen.length - 1]
    expect(last.status).toBe('error')
    // The code is in the message, because "check the code" without the code is
    // advice, not information.
    expect(last.error).toContain('ZZZZZZ')
  })

  it('recovers when the host turns up after the timeout', async () => {
    vi.useFakeTimers()
    const bus = new Bus()
    const g = player('G', bus.factory())
    await vi.advanceTimersByTimeAsync(7000)
    expect(g.status()).toBe('error')

    player('H', bus.factory(), 'host')
    await vi.advanceTimersByTimeAsync(1)
    expect(g.status()).toBe('connected')
  })

  it('does not hold a host hostage to an empty room', async () => {
    const bus = new Bus()
    const h = player('H', bus.factory(), 'host')
    await settle()
    expect(h.status()).toBe('connected')
  })

  it('solo is connected with no timers at all', () => {
    vi.useFakeTimers()
    const s = createSession({ role: 'solo', name: 'S', variant: 'male' })
    expect(s.status()).toBe('connected')
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('events raised before the caller has the session', () => {
  it('delivers a join that landed during construction', async () => {
    const bus = new Bus()
    player('A', bus.factory(), 'host')
    const b = player('B', bus.factory())

    // Subscribed after createSession returned — the only moment a caller can.
    const joins: string[] = []
    b.on('join', (p) => joins.push(p.name))
    await settle()

    expect(joins).toEqual(['A'])
  })

  it('keeps them in order', async () => {
    const bus = new Bus()
    player('A', bus.factory(), 'host')
    const b = player('B', bus.factory())
    const order: string[] = []
    b.on('status', (s) => order.push(`status:${s.status}`))
    b.on('join', (p) => order.push(`join:${p.name}`))
    await settle()

    expect(order[0]).toBe('status:connecting')
    expect(order).toContain('join:A')
    expect(order.indexOf('status:connecting')).toBeLessThan(order.indexOf('join:A'))
  })
})

describe('identity', () => {
  it('uses the id it was given', () => {
    // The lobby mints the id first: an unnamed player's name is derived from it
    // and has to be settled before the first hello goes out.
    const s = createSession({ role: 'solo', name: 'x', variant: 'male', id: 'abcd1234' })
    expect(s.id).toBe('abcd1234')
  })

  it('mints one when it is not', () => {
    const s = createSession({ role: 'solo', name: 'x', variant: 'male' })
    expect(s.id).toMatch(/^[a-z0-9-]{6,10}$/i)
  })
})
