'use client'

/**
 * bookPages — the text of the reference manual, spread by spread.
 *
 * Content lives apart from the book that renders it for the same reason the
 * scenarios live in JSON: the shell is a page-turner and should not have to be
 * edited to change a sentence. ReferenceBook knows how to draw two pages and a
 * gutter; this file knows what is printed on them.
 *
 * SCOPE, and it is a hard line: this manual describes the CELL — what it is for,
 * what each device does, what its resting state is, and how to read the two
 * boards on the wall. It never describes a fault, never names a suspect and
 * never reads the scenario. It is the manual that would be hanging in the panel
 * shop whether anything had gone wrong or not, which is exactly what makes it
 * useful: everything in here is what SHOULD be true, and the job is to find the
 * one thing that is not.
 *
 * The operating sequence is taken from src/scenarios/rigs.json, and the chart in
 * Fig. 3 is the one drawn on the whiteboard in silo_cell.glb, transcribed step
 * for step so that the manual and the board cannot disagree.
 */

import type { ReactNode } from 'react'
import {
  Figure,
  FigCellLayout,
  FigSfcAnatomy,
  FigSfcChart,
  FigLadderRung,
  FigIoBoard,
  FigProx,
  FigPhotoEye,
  FigSolenoid,
  FigPilotLamp,
  FigOperatorPanel,
  FigIsolator,
} from '@/components/ui/book/BookDiagrams'

// ── Type ────────────────────────────────────────────────────────────────────
export interface BookSpread {
  /** Stable key, and what the contents list numbers against. */
  id: string
  /** Contents-list entry. */
  title: string
  left: ReactNode
  right: ReactNode
}

// ── Print furniture ─────────────────────────────────────────────────────────
const SLAB = '"Rockwell", "Roboto Slab", "Bookman Old Style", Georgia, serif'
const BODY = 'Georgia, "Iowan Old Style", "Times New Roman", serif'
const MONO = '"JetBrains Mono", ui-monospace, "SFMono-Regular", monospace'
const INK = '#33291d'
const SOFT = '#5d5241'
const RED = '#a3352c'
const RULE = '#cdbb98'

/** Chapter head: the number in the margin, the title on the rule. */
export function H({ n, children }: { n: string; children: ReactNode }) {
  return (
    <header style={{ marginBottom: '0.9rem' }}>
      <div style={{
        fontFamily: MONO, fontSize: '0.62rem', letterSpacing: '0.22em',
        color: RED, fontWeight: 700, marginBottom: '0.35rem',
      }}>
        {n}
      </div>
      <h2 style={{
        fontFamily: SLAB, fontSize: '1.28rem', lineHeight: 1.15, color: INK,
        margin: 0, fontWeight: 700, letterSpacing: '-0.01em',
      }}>
        {children}
      </h2>
      <div style={{ height: 2, background: INK, opacity: 0.75, marginTop: '0.5rem' }} />
    </header>
  )
}

/** Section head inside a page. */
export function S({ children }: { children: ReactNode }) {
  return (
    <h3 style={{
      fontFamily: SLAB, fontSize: '0.86rem', color: INK, margin: '0.85rem 0 0.4rem',
      fontWeight: 700, letterSpacing: '0.01em',
    }}>
      {children}
    </h3>
  )
}

export function P({ children }: { children: ReactNode }) {
  return (
    <p style={{
      fontFamily: BODY, fontSize: '0.815rem', lineHeight: 1.55, color: INK,
      margin: '0 0 0.55rem', textAlign: 'justify', hyphens: 'auto',
    }}>
      {children}
    </p>
  )
}

/** The opening paragraph of a chapter, set larger with a drop of tracking. */
export function Lead({ children }: { children: ReactNode }) {
  return (
    <p style={{
      fontFamily: BODY, fontSize: '0.885rem', lineHeight: 1.48, color: INK,
      margin: '0 0 0.65rem', fontStyle: 'italic',
    }}>
      {children}
    </p>
  )
}

/** An address, set the way it is printed on the schedule board. */
export function Tag({ children }: { children: string }) {
  const input = children.trim().startsWith('I')
  return (
    <span style={{
      fontFamily: MONO, fontSize: '0.78em', fontWeight: 700,
      color: input ? '#1d4ed8' : '#b45309',
      background: input ? 'rgba(29, 78, 216, 0.07)' : 'rgba(180, 83, 9, 0.08)',
      padding: '0.05em 0.28em', borderRadius: 2, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol style={{
      fontFamily: BODY, fontSize: '0.815rem', lineHeight: 1.48, color: INK,
      margin: '0 0 0.6rem', paddingLeft: '1.35rem',
    }}>
      {items.map((it, i) => (
        <li key={i} style={{ marginBottom: '0.28rem' }}>{it}</li>
      ))}
    </ol>
  )
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul style={{
      fontFamily: BODY, fontSize: '0.815rem', lineHeight: 1.48, color: INK,
      margin: '0 0 0.6rem', paddingLeft: '1.1rem', listStyleType: 'square',
    }}>
      {items.map((it, i) => (
        <li key={i} style={{ marginBottom: '0.28rem' }}>{it}</li>
      ))}
    </ul>
  )
}

/** A ruled note in the margin voice — the thing an old hand writes in pencil. */
export function Note({ label = 'NOTE', children }: { label?: string; children: ReactNode }) {
  return (
    <aside style={{
      borderLeft: `3px solid ${RED}`,
      background: 'rgba(163, 53, 44, 0.045)',
      padding: '0.45rem 0.65rem',
      margin: '0.6rem 0 0.7rem',
    }}>
      <div style={{
        fontFamily: MONO, fontSize: '0.58rem', letterSpacing: '0.18em',
        color: RED, fontWeight: 700, marginBottom: '0.2rem',
      }}>
        {label}
      </div>
      <div style={{ fontFamily: BODY, fontSize: '0.775rem', lineHeight: 1.45, color: SOFT }}>
        {children}
      </div>
    </aside>
  )
}

/** Two-column key/value, for state tables. */
export function Rows({ rows }: { rows: Array<[ReactNode, ReactNode]> }) {
  return (
    <table style={{
      width: '100%', borderCollapse: 'collapse', margin: '0.3rem 0 0.7rem',
      fontFamily: BODY, fontSize: '0.775rem', color: INK,
    }}>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderTop: `1px solid ${RULE}` }}>
            <td style={{ padding: '0.26rem 0.5rem 0.26rem 0', width: '38%', verticalAlign: 'top' }}>
              {r[0]}
            </td>
            <td style={{ padding: '0.26rem 0', verticalAlign: 'top', color: SOFT }}>
              {r[1]}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// The spreads
// ════════════════════════════════════════════════════════════════════════════
export const BOOK_SPREADS: BookSpread[] = [
  // ── 1 ─────────────────────────────────────────────────────────────────────
  {
    id: 'cell',
    title: 'The cell, and what it is for',
    left: (
      <>
        <H n="CHAPTER ONE">The silo fill cell</H>
        <Lead>
          West bay. One conveyor, one silo, two sensors, one gate. It fills cartons
          with granular product and sends them on to packing.
        </Lead>
        <P>
          Everything the cell does, it does in one repeating cycle. There is no
          recipe, no batch record and nothing to set up: a carton arrives empty,
          leaves full, and the next one takes its place. That is worth saying
          plainly, because it means every symptom you will ever see here is a
          symptom of one cycle stopping somewhere, and there are only four places
          it can stop.
        </P>
        <Figure n={1} caption="The cell in elevation. Product falls from the silo through the solenoid gate into a carton held under the spout by the conveyor; the prox says the carton is there, the photo-eye says it is full.">
          <FigCellLayout />
        </Figure>
      </>
    ),
    right: (
      <>
        <S>The operating sequence</S>
        <Steps items={[
          <>A conveyor indexes an empty carton along the belt.</>,
          <>An inductive prox sensor sees it arrive under the silo spout and the
            belt stops, leaving the box in position.</>,
          <>A solenoid gate in the silo discharge opens and product runs into the
            carton.</>,
          <>A through-beam photo-eye across the mouth of the box makes when it is
            full, and the gate shuts.</>,
          <>The belt indexes the full carton out and the next empty one in.</>,
        ]} />
        <P>
          Five moves, and each one waits on the one before it. The belt will not
          stop until the prox makes; the gate will not open until the belt has
          stopped; the gate will not shut until the level makes. A cell built this
          way cannot skip a step — but it can wait forever at one of them, quite
          happily, with every lamp telling you it is doing exactly what it was
          asked to do.
        </P>
        <S>What the operator sees</S>
        <P>
          START and STOP on the panel latch and drop a seal-in rung; a maintained
          E-STOP kills it outright. RUN, FILL and FULL report which part of the
          cycle the processor believes it is in.
        </P>
        <Note label="READ THIS TWICE">
          Which is not always the same as what the machine is doing. The lamps are
          fed from the processor&rsquo;s output bits, not from the belt, the gate
          or the product. Believing a lamp is the most expensive habit in this
          trade.
        </Note>
      </>
    ),
  },

  // ── 2 ─────────────────────────────────────────────────────────────────────
  {
    id: 'sfc',
    title: 'Reading the sequence chart',
    left: (
      <>
        <H n="CHAPTER TWO">The chart on the whiteboard</H>
        <Lead>
          A sequential function chart is the cycle drawn as a flight of stairs. It
          tells you where the cell is, and what it is waiting for.
        </Lead>
        <P>
          Three things appear on it and nothing else. A <b>step</b> is a state the
          cell is in — exactly one is active at a time. A <b>transition</b> is the
          bar between two steps and carries the condition that must go TRUE before
          the cell may move down. An <b>action</b> is the box beside a step, and it
          lists what is energised for as long as that step is active.
        </P>
        <P>
          The step with the double border is the initial step: the one the cell
          rests in at power-up, and the one it returns to at the end of a cycle.
        </P>
        <Figure n={2} caption="Step, transition, action. Read downwards: the chart moves on only when the condition on the bar is true, and while it sits on a step it is driving whatever the action box says.">
          <FigSfcAnatomy />
        </Figure>
      </>
    ),
    right: (
      <>
        <S>The chart for this cell</S>
        <P>
          Four steps. <b>S0 IDLE</b> waits for the start button. <b>S1 CONVEY</b>{' '}
          runs the belt. <b>S2 FILL</b> holds the gate open. <b>S3 EJECT</b> runs
          the belt again to carry the full carton away, and the chart returns to
          S0 when the prox has cleared.
        </P>
        <Figure n={3} scale={0.84} caption="The silo fill sequence as drawn on the board, transcribed. The addresses on the transition bars are the inputs the processor is waiting on; the boxes on the right are the outputs it drives while the step is live.">
          <FigSfcChart />
        </Figure>
        <P>
          Read a stuck cell off this chart before you touch anything. Whichever
          step it is sitting on, the transition below it is FALSE, and the address
          written on that bar is the input to go and look at.
        </P>
      </>
    ),
  },

  // ── 3 ─────────────────────────────────────────────────────────────────────
  {
    id: 'io',
    title: 'The I/O schedule board',
    left: (
      <>
        <H n="CHAPTER THREE">Addresses</H>
        <Lead>
          The chart names conditions. The schedule board names the wires. You need
          both, and they hang side by side for that reason.
        </Lead>
        <P>
          An address reads left to right in three parts.{' '}
          <b>I</b> is an input card — something the field tells the processor.{' '}
          <b>O</b> is an output card — something the processor drives. The number
          after the colon is the slot the card sits in, and the number after the
          slash is the terminal on that card, which is the screw the wire actually
          lands under.
        </P>
        <P>
          So <Tag>I:1/03</Tag> is terminal 03 of the input card in slot 1, and the
          board will tell you that terminal 03 is the inductive prox. Inputs are
          written in blue on the board and outputs in amber, for no better reason
          than that it is the fastest way to see, from across the bay, which half
          of the world an address belongs to.
        </P>
        <Figure n={4} scale={0.82} caption="The schedule board, and an address taken apart. The label column is the tag name the program uses; the last column is the device on the end of the wire.">
          <FigIoBoard />
        </Figure>
      </>
    ),
    right: (
      <>
        <S>From a transition to a rung</S>
        <P>
          The chart is the intent; the ladder is what the processor actually
          executes. A rung is a line of power from the left rail to the right: put
          contacts in the way of it, and the coil at the end energises only when
          every contact lets power through.
        </P>
        <P>
          A plain contact asks &ldquo;is this bit ON?&rdquo; A contact with a slash
          through it asks &ldquo;is this bit OFF?&rdquo; — which is how a NOT is
          drawn. The coil on the right is the output the rung controls.
        </P>
        <Figure n={5} caption="The fill rung. RUN must be on, the prox must be made, the level must NOT be made — and only then does the gate solenoid energise.">
          <FigLadderRung />
        </Figure>
        <P>
          Every transition on the chart turns into contacts on a rung, and every
          action box turns into a coil. If you can read one, you can read the
          other; the ladder simply has no room to be vague about it.
        </P>
        <Note label="ORDER OF PLAY">
          The processor reads every input, solves every rung top to bottom, then
          writes every output — twenty times a second. Nothing happens in the
          middle of a scan, so a rung always sees the inputs as they were at the
          start of it.
        </Note>
      </>
    ),
  },

  // ── 4 ─────────────────────────────────────────────────────────────────────
  {
    id: 'sensors',
    title: 'The sensors',
    left: (
      <>
        <H n="CHAPTER FOUR">Inductive proximity</H>
        <Lead>
          Mounted on a bracket at the fill position, aimed across the belt line.
          Address <Tag>I:1/03</Tag>, tag PROX_SENSOR.
        </Lead>
        <P>
          It senses metal, and only metal, at a few millimetres. An oscillator
          behind the sensing face throws a field; steel entering that field damps
          the oscillation, and the sensor switches. No contact, no moving parts,
          nothing to wear out — which is why it is the sensor of choice for
          counting things past a fixed point.
        </P>
        <Rows rows={[
          ['Normal state', <>OFF, with nothing in front of the face</>],
          ['Made when', <>the carton flight reaches the fill position</>],
          ['Status LED', <>dark when OFF, lit when the sensor is switched</>],
          ['Wiring', <>brown +24 V, blue 0 V, black signal</>],
        ]} />
        <Figure n={6} caption="Barrel prox in its bracket. The two nuts set the gap, the LED on the back reports the output, and the field only reaches a few millimetres past the face.">
          <FigProx />
        </Figure>
      </>
    ),
    right: (
      <>
        <S>Through-beam photo-eye</S>
        <P>
          Two separate units facing each other across the mouth of the carton:
          an emitter throwing a beam, and a receiver watching for it. Address{' '}
          <Tag>I:1/04</Tag>, tag LEVEL_SENSOR.
        </P>
        <P>
          It reports level by interruption. While the carton is filling the beam
          passes clean across the open top; when the product reaches the mouth it
          cuts the beam, the receiver goes dark, and the input makes. That is why
          it is mounted at the height it is — the beam line IS the fill line, and
          moving the bracket changes the fill weight.
        </P>
        <Rows rows={[
          ['Normal state', <>beam clear, input OFF</>],
          ['Made when', <>product breaks the beam</>],
          ['Emitter LED', <>lit whenever the unit has supply</>],
          ['Receiver LED', <>lit while it can see the beam</>],
        ]} />
        <Figure n={7} scale={0.9} caption="Emitter and receiver either side of the carton. Two LEDs, and they mean different things: one says powered, the other says seeing.">
          <FigPhotoEye />
        </Figure>
        <Note>
          A status LED tells you what the SENSOR decided. It does not tell you the
          processor got it, and it does not tell you the wire between them is
          whole.
        </Note>
      </>
    ),
  },

  // ── 5 ─────────────────────────────────────────────────────────────────────
  {
    id: 'actuators',
    title: 'The actuators',
    left: (
      <>
        <H n="CHAPTER FIVE">What the outputs drive</H>
        <Lead>
          Three kinds of thing hang off the output card: a contactor, a solenoid
          and three lamps. Only two of them can move anything.
        </Lead>
        <S>Gearmotor and contactor</S>
        <P>
          <Tag>O:2/00</Tag> does not drive the conveyor motor. It drives the coil
          of a contactor in the cabinet, and the contactor&rsquo;s power contacts
          drive the motor. The output card switches a few milliamps; the contactor
          switches the three phases.
        </P>
        <P>
          The chain from bit to belt therefore has four links in it — the output
          bit, the coil, the contacts, and the mechanical drive from the gearbox
          through to the belt itself. Each is checkable, and they are not the same
          thing.
        </P>
        <S>The solenoid gate</S>
        <P>
          <Tag>O:2/01</Tag> energises a solenoid on the silo discharge. Energised,
          the armature pulls the gate open against a spring; de-energised, the
          spring shuts it. Product only ever falls while the coil is held on.
        </P>
        <Figure n={8} scale={0.83} caption="Solenoid gate valve. Note which way the spring works: the coil holds the gate OPEN, so any loss of supply closes the silo rather than emptying it onto the floor.">
          <FigSolenoid />
        </Figure>
      </>
    ),
    right: (
      <>
        <S>The pilot lamps</S>
        <P>
          Three lenses on the panel, each wired to its own output bit, each doing
          nothing but reporting that bit.
        </P>
        <Rows rows={[
          [<><Tag>O:2/02</Tag> RUN</>, <>amber. The seal-in bit — the cell has been started and not stopped</>],
          [<><Tag>O:2/03</Tag> FILL</>, <>amber. Follows the gate output</>],
          [<><Tag>O:2/04</Tag> FULL</>, <>red. Follows the level sensor</>],
        ]} />
        <Figure n={9} scale={0.9} caption="Pilot lamp in section, and the three lenses fitted to this panel. Behind each lens is an LED element across the same two terminals as any other 24 V load.">
          <FigPilotLamp />
        </Figure>
        <P>
          RUN is worth understanding properly, because it is not only a lamp. The
          same bit is used by the ladder as its own memory of having been started —
          the rung reads its own output back to hold itself in. That is the seal-in,
          and it is why the cell stays running after you let go of the button.
        </P>
        <Note label="WHAT A LAMP PROVES">
          That the processor set the bit. Nothing further. A lit lamp and a turning
          motor are two claims, and only one of them was made by the machine.
        </Note>
      </>
    ),
  },

  // ── 6 ─────────────────────────────────────────────────────────────────────
  {
    id: 'panel',
    title: 'The operator panel',
    left: (
      <>
        <H n="CHAPTER SIX">The operator panel</H>
        <Lead>
          Two pushbuttons, a mode selector and a mushroom. Four controls, and one
          of them is wired backwards on purpose.
        </Lead>
        <P>
          <b>START</b>, <Tag>I:1/00</Tag>, is a momentary normally-open button. At
          rest its contact is open and the input reads 0; press it and the input
          reads 1 for as long as your thumb is on it. Let go and it drops. It never
          holds the cell on by itself — the seal-in rung does that.
        </P>
        <P>
          <b>STOP</b>, <Tag>I:1/01</Tag>, is a momentary normally-closed button. At
          rest its contact is MADE, so the input reads 1 all day while the cell is
          perfectly happy; pressing it BREAKS the circuit and the input falls to 0.
        </P>
        <Figure n={10} caption="The panel as fitted, with the contact each button carries. Flush green to start, flush red to stop, mushroom for emergencies, and a three-position selector for mode.">
          <FigOperatorPanel />
        </Figure>
      </>
    ),
    right: (
      <>
        <S>Why STOP is normally closed</S>
        <P>
          Because of what happens when the wire falls off. A normally-open stop
          button that loses its wire looks, to the processor, exactly like a stop
          button nobody is pressing — and the cell keeps running with no way to
          stop it. A normally-closed stop button that loses its wire looks like a
          stop button someone IS pressing, and the cell stops.
        </P>
        <P>
          The failure is designed to fall on the safe side. That is all fail-safe
          means, and you will find the same reasoning in the spring on the silo
          gate: everything that can break should break towards stopped, shut and
          dark.
        </P>
        <Note label="CONSEQUENCE">
          A healthy STOP button reads TRUE. If you are watching the input table and
          <Tag>I:1/01</Tag> shows 1 while nobody is at the panel, that is the
          correct and expected state, not a stuck input.
        </Note>
        <S>The E-STOP</S>
        <P>
          <Tag>I:1/02</Tag>, a maintained mushroom head in a yellow collar. Struck,
          it latches down and stays down — it is not a button you hold, it is a
          switch you throw. It is twisted to release, and the cell will not restart
          on release alone; someone has to press START again.
        </P>
        <S>The mode selector</S>
        <P>
          <Tag>I:1/05</Tag>, three maintained positions marked A, B and C. It is a
          maintained switch, so whatever position it is left in is the position it
          is in when the next shift arrives. Check where it is standing before you
          assume anything about how the cell should be behaving.
        </P>
      </>
    ),
  },

  // ── 7 ─────────────────────────────────────────────────────────────────────
  {
    id: 'loto',
    title: 'Isolation and lock-off',
    left: (
      <>
        <H n="CHAPTER SEVEN">Isolation and lock-off</H>
        <Lead>
          The conveyor guard exists because the drive end of a belt will take a
          hand in and not give it back. Everything below is about making sure the
          belt cannot start while your arm is inside it.
        </Lead>
        <P>
          The main isolator is inside the control cabinet. Its handle throws the
          supply to the whole cell — the contactor, the solenoid, the sensors and
          the processor&rsquo;s output card with them. Thrown to OFF, the cell is
          dead: nothing on it can move, energise or light up, and the lamps go out
          with everything else.
        </P>
        <P>
          A handle at OFF is not enough on its own, because a handle can be thrown
          back by anybody who finds a stopped line and no explanation. The hasp on
          the isolator takes a padlock, and the padlock is what turns a switch
          position into a guarantee.
        </P>
        <Figure n={11} scale={0.94} caption="Isolator thrown to OFF, hasp through the staple, padlock through the hasp, tag on the padlock. The tag says who and why; the lock does the actual work.">
          <FigIsolator />
        </Figure>
      </>
    ),
    right: (
      <>
        <S>The order it is done in</S>
        <Steps items={[
          <>Stop the cell at the panel. Do not lock off a running machine.</>,
          <>Open the cabinet and throw the main isolator to OFF.</>,
          <>Fit the hasp and put your own padlock through it. One key, and you
            keep it.</>,
          <>Hang the DANGER — DO NOT OPERATE tag with your name on it.</>,
          <>Prove dead: try to start the cell from the panel and confirm nothing
            moves and nothing lights.</>,
          <>Only now open the guard and put your hands in.</>,
        ]} />
        <Note label="THE POINT OF THE PADLOCK">
          It is not a sign. It is the physical impossibility of that handle moving
          while your key is in your pocket. A sign asks people not to kill you; a
          lock removes their ability to.
        </Note>
        <S>While it is locked</S>
        <P>
          The cell is dead and stays dead. Nothing you do at the panel will do
          anything, the sensors are unpowered, and the processor is not driving
          anything — so do not expect to test a sensor or watch a lamp while your
          lock is on. Diagnosis happens live; work happens locked. Knowing which of
          the two you are doing at any moment is most of the discipline.
        </P>
        <S>Taking it off</S>
        <P>
          Your hands out, guard back on, tools accounted for, then your lock off,
          then the handle back to ON. In that order, and by you — the person who
          fitted the lock is the person who removes it.
        </P>
        <Note label="COSTS">
          Reaching inside a guard on a live cell is recorded against the job. It is
          the one mistake here that a good repair does not make up for.
        </Note>
      </>
    ),
  },
]
