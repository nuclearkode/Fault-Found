'use client'

/**
 * BookDiagrams — every figure in the reference manual, drawn as inline SVG.
 *
 * There are no photographs in this game and none may be added: a screenshot of
 * the 3D cell would show the player the cell they are standing in, which teaches
 * nothing, and a photo of a real sensor would date the manual to whichever
 * catalogue it came from. A works manual is drawn, not photographed — schematic,
 * labelled, and true to the thing rather than to the light it was shot in.
 *
 * Everything here is geometry and text in a fixed viewBox, so a figure scales
 * with the page instead of resampling. Each is authored against a 340-unit wide
 * viewBox and rendered at roughly 460 px, which puts the 9-unit label text at
 * about 12 px on screen — the smallest size that still reads on a laptop panel.
 *
 * The palette is the printed one: warm paper, iron-gall ink, and the two signal
 * colours the I/O board already uses (blue for inputs, amber for outputs) so a
 * figure and the board agree without the reader being told they do.
 */

import type { ReactNode } from 'react'

// ── Ink and paper ───────────────────────────────────────────────────────────
const INK = '#2f2820'
const FAINT = '#c9bb9d'
const PAPER = '#f6efdd'
const BLUE = '#1d4ed8'     // inputs, matching TagTable
const AMBER = '#b45309'    // outputs, matching TagTable
const RED = '#a3352c'
const GREEN = '#2f6b3f'
const STEEL = '#d8d2c4'
const GREY = '#8c8578'

const MONO = '"JetBrains Mono", ui-monospace, "SFMono-Regular", monospace'
const SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif'

// ── Text helper ─────────────────────────────────────────────────────────────
interface TProps {
  x: number
  y: number
  children: ReactNode
  size?: number
  fill?: string
  anchor?: 'start' | 'middle' | 'end'
  weight?: number
  serif?: boolean
  italic?: boolean
}

function T({
  x, y, children, size = 9, fill = INK, anchor = 'start', weight = 400,
  serif = false, italic = false,
}: TProps) {
  return (
    <text
      x={x} y={y}
      fontSize={size}
      fill={fill}
      textAnchor={anchor}
      fontWeight={weight}
      fontFamily={serif ? SERIF : MONO}
      fontStyle={italic ? 'italic' : 'normal'}
      letterSpacing={serif ? 0 : 0.2}
    >
      {children}
    </text>
  )
}

/** A hatched fill, for cut material: panel walls, steel, coil windings. */
function Hatch({
  x, y, w, h, step = 5, stroke = GREY,
}: { x: number; y: number; w: number; h: number; step?: number; stroke?: string }) {
  const lines: ReactNode[] = []
  for (let i = -h; i < w; i += step) {
    const x1 = Math.max(x + i, x)
    const y1 = y + Math.max(-i, 0)
    const x2 = Math.min(x + i + h, x + w)
    const y2 = y + Math.min(h, w - i)
    lines.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={0.5} />)
  }
  return <g>{lines}</g>
}

/** An arrowhead marker set, defined once per SVG that needs one. */
function Arrowheads({ id, fill = INK }: { id: string; fill?: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill={fill} />
      </marker>
    </defs>
  )
}

// ── Figure frame ────────────────────────────────────────────────────────────
/**
 * A numbered plate. The number is passed in rather than counted, because the
 * figures are referred to by number in the body text and an automatic counter
 * would renumber every reference the moment a spread was reordered.
 */
export function Figure({
  n, caption, scale = 1, children,
}: { n: number; caption: string; scale?: number; children: ReactNode }) {
  return (
    <figure style={{ margin: '0.7rem 0 0.85rem' }}>
      <div style={{
        border: `1px solid ${FAINT}`,
        background: '#fbf6e9',
        padding: '0.45rem 0.5rem 0.3rem',
        boxShadow: 'inset 0 0 22px rgba(120, 96, 52, 0.06)',
        // A tall plate is set narrower rather than cropped, so the page still
        // holds its text. Never below about 0.8, or the labels stop reading.
        maxWidth: scale < 1 ? `${Math.round(scale * 100)}%` : undefined,
        margin: scale < 1 ? '0 auto' : undefined,
      }}>
        {children}
      </div>
      <figcaption style={{
        marginTop: '0.35rem',
        fontFamily: SERIF,
        fontSize: '0.72rem',
        lineHeight: 1.45,
        color: '#5c5140',
      }}>
        <span style={{
          fontFamily: MONO, fontWeight: 700, fontSize: '0.66rem',
          letterSpacing: '0.08em', color: RED, marginRight: '0.4rem',
        }}>
          FIG.&nbsp;{n}
        </span>
        {caption}
      </figcaption>
    </figure>
  )
}

/** Every plate shares one frame so they sit on the page as a set. */
function Plate({ h, children }: { h: number; children: ReactNode }) {
  return (
    <svg viewBox={`0 0 340 ${h}`} width="100%" style={{ display: 'block', height: 'auto' }}>
      <rect x={0} y={0} width={340} height={h} fill={PAPER} />
      {children}
    </svg>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Fig. 1 — the cell
// ════════════════════════════════════════════════════════════════════════════
export function FigCellLayout() {
  return (
    <Plate h={196}>
      <Arrowheads id="ah1" />

      {/* Silo */}
      <rect x={148} y={8} width={104} height={36} fill={STEEL} stroke={INK} strokeWidth={1.1} />
      <path d="M148 44 L252 44 L208 78 L192 78 Z" fill={STEEL} stroke={INK} strokeWidth={1.1} />
      <rect x={192} y={78} width={16} height={20} fill={STEEL} stroke={INK} strokeWidth={1.1} />
      <T x={200} y={30} anchor="middle" size={10} weight={700}>SILO</T>

      {/* Gate in the discharge */}
      <rect x={176} y={80} width={48} height={11} fill="#efe3c8" stroke={INK} strokeWidth={1.1} />
      <line x1={186} y1={85.5} x2={214} y2={85.5} stroke={AMBER} strokeWidth={2.4} />
      <T x={230} y={83} size={8} fill={AMBER} weight={700}>O:2/01</T>
      <T x={230} y={92} size={7.5} fill={GREY}>GATE</T>

      {/* Product falling */}
      <line x1={200} y1={98} x2={200} y2={112} stroke={GREY} strokeWidth={0.9}
            strokeDasharray="2 3" markerEnd="url(#ah1)" />

      {/* Carton under the spout — open top */}
      <path d="M176 112 L176 146 L224 146 L224 112" fill="#e6d3b0" stroke={INK} strokeWidth={1.1} />
      <rect x={178} y={132} width={44} height={13} fill="#8d8778" opacity={0.55} />
      <T x={200} y={158} anchor="middle" size={7.5} fill={GREY}>CARTON</T>

      {/* Level photo-eye across the carton mouth */}
      <rect x={143} y={100} width={15} height={16} fill="#3a3a40" stroke={INK} strokeWidth={0.9} />
      <rect x={242} y={100} width={15} height={16} fill="#3a3a40" stroke={INK} strokeWidth={0.9} />
      <line x1={158} y1={108} x2={242} y2={108} stroke={RED} strokeWidth={1} strokeDasharray="4 3" />
      <T x={137} y={96} anchor="end" size={7.5} fill={GREY}>TX</T>
      <T x={263} y={96} size={7.5} fill={GREY}>RX</T>
      <T x={200} y={104} anchor="middle" size={8} fill={BLUE} weight={700}>I:1/04</T>

      {/* Inductive prox at the fill position */}
      <rect x={112} y={128} width={26} height={10} fill="#3a3a40" stroke={INK} strokeWidth={0.9} />
      <rect x={138} y={128} width={4} height={10} fill="#c9c2ae" stroke={INK} strokeWidth={0.7} />
      <line x1={125} y1={128} x2={125} y2={116} stroke={GREY} strokeWidth={1.4} />
      <line x1={112} y1={116} x2={138} y2={116} stroke={GREY} strokeWidth={1.4} />
      <T x={108} y={126} anchor="end" size={8} fill={BLUE} weight={700}>I:1/03</T>
      <T x={108} y={136} anchor="end" size={7.5} fill={GREY}>PROX</T>

      {/* Conveyor */}
      <rect x={40} y={146} width={264} height={9} fill="#2c2c30" />
      <circle cx={46} cy={150.5} r={8} fill={STEEL} stroke={INK} strokeWidth={1} />
      <circle cx={298} cy={150.5} r={8} fill={STEEL} stroke={INK} strokeWidth={1} />
      <line x1={70} y1={155} x2={70} y2={182} stroke={INK} strokeWidth={1.4} />
      <line x1={270} y1={155} x2={270} y2={182} stroke={INK} strokeWidth={1.4} />
      <rect x={304} y={150} width={26} height={22} fill="#4a4a50" stroke={INK} strokeWidth={1} />
      <T x={317} y={165} anchor="middle" size={9} fill="#f2eada" weight={700}>M</T>
      <T x={317} y={182} anchor="middle" size={8} fill={AMBER} weight={700}>O:2/00</T>

      {/* Ground */}
      <line x1={8} y1={182} x2={332} y2={182} stroke={INK} strokeWidth={1.2} />

      {/* Travel */}
      <line x1={80} y1={168} x2={250} y2={168} stroke={GREY} strokeWidth={1}
            markerEnd="url(#ah1)" />
      <T x={165} y={165} anchor="middle" size={7.5} fill={GREY} serif italic>carton travel</T>

      {/* Operator panel */}
      <rect x={8} y={96} width={46} height={50} fill="#8e8b82" stroke={INK} strokeWidth={1.1} />
      <circle cx={20} cy={110} r={4} fill={GREEN} stroke={INK} strokeWidth={0.6} />
      <circle cx={34} cy={110} r={4} fill={RED} stroke={INK} strokeWidth={0.6} />
      <circle cx={42} cy={126} r={6} fill="#c0392b" stroke="#d7b93c" strokeWidth={2} />
      <circle cx={17} cy={132} r={3} fill="#e0a63a" stroke={INK} strokeWidth={0.5} />
      <circle cx={26} cy={132} r={3} fill="#e0a63a" stroke={INK} strokeWidth={0.5} />
      <circle cx={35} cy={140} r={3} fill="#c34a3f" stroke={INK} strokeWidth={0.5} />
      <T x={31} y={92} anchor="middle" size={7.5} fill={GREY}>PANEL</T>
    </Plate>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Fig. 2 — how an SFC is put together
// ════════════════════════════════════════════════════════════════════════════
export function FigSfcAnatomy() {
  return (
    <Plate h={196}>
      <Arrowheads id="ah2" />

      {/* Initial step — double border */}
      <rect x={96} y={14} width={68} height={28} fill="#fff" stroke={INK} strokeWidth={1.3} />
      <rect x={100} y={18} width={60} height={20} fill="none" stroke={INK} strokeWidth={0.8} />
      <T x={130} y={32} anchor="middle" size={11} weight={700}>S0</T>
      <T x={88} y={32} anchor="end" size={9} fill={GREY}>IDLE</T>

      {/* Link + transition */}
      <line x1={130} y1={42} x2={130} y2={92} stroke={INK} strokeWidth={1.2} />
      <line x1={110} y1={67} x2={150} y2={67} stroke={INK} strokeWidth={2.4} />
      <T x={158} y={70} size={9} fill={BLUE} weight={700}>I:1/00 START</T>

      {/* Step with an action */}
      <rect x={96} y={92} width={68} height={28} fill="#fff" stroke={INK} strokeWidth={1.3} />
      <T x={130} y={110} anchor="middle" size={11} weight={700}>S1</T>
      <T x={88} y={110} anchor="end" size={9} fill={GREY}>CONVEY</T>
      <line x1={164} y1={106} x2={196} y2={106} stroke={INK} strokeWidth={1.2} />
      <rect x={196} y={92} width={116} height={28} fill="#fdf3dd" stroke={INK} strokeWidth={1.1} />
      <T x={254} y={110} anchor="middle" size={9} fill={AMBER} weight={700}>O:2/00 MOTOR</T>

      {/* Legend */}
      <line x1={14} y1={136} x2={326} y2={136} stroke={FAINT} strokeWidth={1} />

      <rect x={16} y={146} width={22} height={12} fill="#fff" stroke={INK} strokeWidth={1.1} />
      <rect x={18} y={148} width={18} height={8} fill="none" stroke={INK} strokeWidth={0.7} />
      <T x={44} y={155} size={8} serif>initial step — where the cell sits at power-up</T>

      <rect x={16} y={164} width={22} height={12} fill="#fff" stroke={INK} strokeWidth={1.1} />
      <T x={44} y={173} size={8} serif>step — one state the cell is in, and only one at a time</T>

      <line x1={16} y1={186} x2={38} y2={186} stroke={INK} strokeWidth={2.4} />
      <T x={44} y={186} size={8} serif>transition — the condition that must be TRUE to move on</T>
    </Plate>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Fig. 3 — the chart actually on the whiteboard
// ════════════════════════════════════════════════════════════════════════════
function SfcRow({
  y, id, name, initial = false, actions,
}: { y: number; id: string; name: string; initial?: boolean; actions: string[] }) {
  const h = actions.length > 1 ? 32 : 26
  return (
    <g>
      <rect x={86} y={y} width={68} height={h} fill="#fff" stroke={INK} strokeWidth={1.3} />
      {initial && (
        <rect x={90} y={y + 4} width={60} height={h - 8} fill="none" stroke={INK} strokeWidth={0.8} />
      )}
      <T x={120} y={y + h / 2 + 4} anchor="middle" size={11} weight={700}>{id}</T>
      <T x={78} y={y + h / 2 + 4} anchor="end" size={8.5} fill={GREY}>{name}</T>
      <line x1={154} y1={y + h / 2} x2={190} y2={y + h / 2} stroke={INK} strokeWidth={1.1} />
      <rect x={190} y={y} width={132} height={h} fill="#fdf3dd" stroke={INK} strokeWidth={1} />
      {actions.map((a, i) => (
        <T key={a} x={256} y={y + (actions.length > 1 ? 14 + i * 13 : h / 2 + 3.5)}
           anchor="middle" size={8.5} fill={AMBER} weight={700}>{a}</T>
      ))}
    </g>
  )
}

function SfcBar({ y, label }: { y: number; label: string }) {
  return (
    <g>
      <line x1={100} y1={y} x2={140} y2={y} stroke={INK} strokeWidth={2.4} />
      <T x={148} y={y + 3.5} size={8.5} fill={BLUE} weight={700}>{label}</T>
    </g>
  )
}

export function FigSfcChart() {
  return (
    <Plate h={306}>
      <Arrowheads id="ah3" />

      <T x={14} y={12} size={9} weight={700}>SILO FILL SEQUENCE</T>
      <T x={326} y={12} anchor="end" size={7.5} fill={GREY}>SFC &mdash; PLC-01</T>
      <line x1={14} y1={17} x2={326} y2={17} stroke={RED} strokeWidth={1.2} />

      <line x1={120} y1={24} x2={120} y2={252} stroke={INK} strokeWidth={1.2} />

      <SfcRow y={24} id="S0" name="IDLE" initial actions={['—']} />
      <SfcBar y={64} label="I:1/00  START" />
      <SfcRow y={76} id="S1" name="CONVEY" actions={['O:2/00 MOTOR', '+ O:2/02 RUN']} />
      <SfcBar y={128} label="I:1/03  PROX MADE" />
      <SfcRow y={140} id="S2" name="FILL" actions={['O:2/01 VALVE', '+ O:2/03 FILL']} />
      <SfcBar y={192} label="I:1/04 LEVEL  OR  T 3.5 s" />
      <SfcRow y={204} id="S3" name="EJECT" actions={['O:2/00 MOTOR']} />
      <SfcBar y={240} label="NOT I:1/03" />

      {/* Return to the initial step */}
      <path d="M120 252 L120 268 L46 268 L46 37 L86 37"
            fill="none" stroke={INK} strokeWidth={1.2} markerEnd="url(#ah3)" />

      {/* The note that is written on the board */}
      <rect x={150} y={276} width={176} height={24} fill="none" stroke={GREY}
            strokeWidth={0.9} strokeDasharray="3 2" />
      <T x={158} y={286} size={7} fill={GREY}>NOTE: O:2/00 TRUE DOES NOT</T>
      <T x={158} y={295} size={7} fill={GREY}>PROVE BELT MOTION</T>
    </Plate>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Fig. 4 — one ladder rung
// ════════════════════════════════════════════════════════════════════════════
function Contact({ x, y, closed, addr, name }: {
  x: number; y: number; closed: boolean; addr: string; name: string
}) {
  return (
    <g>
      <line x1={x - 6} y1={y - 8} x2={x - 6} y2={y + 8} stroke={INK} strokeWidth={1.6} />
      <line x1={x + 6} y1={y - 8} x2={x + 6} y2={y + 8} stroke={INK} strokeWidth={1.6} />
      {!closed && <line x1={x - 9} y1={y + 9} x2={x + 9} y2={y - 9} stroke={INK} strokeWidth={1.4} />}
      <T x={x} y={y - 15} anchor="middle" size={9} fill={addr.startsWith('I') ? BLUE : AMBER} weight={700}>{addr}</T>
      <T x={x} y={y + 24} anchor="middle" size={7.5} fill={GREY}>{name}</T>
    </g>
  )
}

export function FigLadderRung() {
  return (
    <Plate h={136}>
      {/* Rails */}
      <line x1={18} y1={14} x2={18} y2={94} stroke={INK} strokeWidth={2} />
      <line x1={322} y1={14} x2={322} y2={94} stroke={INK} strokeWidth={2} />
      <T x={24} y={22} size={7.5} fill={GREY}>L1</T>
      <T x={316} y={22} anchor="end" size={7.5} fill={GREY}>L2</T>

      {/* The rung */}
      <line x1={18} y1={54} x2={322} y2={54} stroke={INK} strokeWidth={1.4} />
      <Contact x={70} y={54} closed addr="O:2/02" name="RUN" />
      <Contact x={140} y={54} closed addr="I:1/03" name="PROX" />
      <Contact x={210} y={54} closed={false} addr="I:1/04" name="LEVEL" />

      {/* Coil */}
      <path d="M276 46 A 10 10 0 0 0 276 62" fill="none" stroke={INK} strokeWidth={1.6} />
      <path d="M292 46 A 10 10 0 0 1 292 62" fill="none" stroke={INK} strokeWidth={1.6} />
      <T x={284} y={39} anchor="middle" size={9} fill={AMBER} weight={700}>O:2/01</T>
      <T x={284} y={78} anchor="middle" size={7.5} fill={GREY}>FILL VALVE</T>

      <line x1={14} y1={104} x2={326} y2={104} stroke={FAINT} strokeWidth={1} />
      <T x={14} y={118} size={8} fill={INK}>
        O:2/02 AND I:1/03 AND NOT I:1/04 &rarr; O:2/01
      </T>
      <T x={14} y={130} size={7.5} fill={GREY} serif italic>
        the same rung written the way the ladder editor writes it
      </T>
    </Plate>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Fig. 5 — the I/O schedule board, and what an address is made of
// ════════════════════════════════════════════════════════════════════════════
const SCHEDULE_ROWS: Array<[string, string, string]> = [
  ['I:1/00', 'START_PB', 'start pushbutton'],
  ['I:1/03', 'PROX_SENSOR', 'inductive prox'],
  ['I:1/04', 'LEVEL_SENSOR', 'level photo-eye'],
  ['O:2/00', 'CONV_MOTOR', 'gearmotor contactor'],
  ['O:2/01', 'FILL_VALVE', 'solenoid gate'],
  ['O:2/02', 'RUN_LIGHT', 'RUN lamp / seal-in'],
]

export function FigIoBoard() {
  return (
    <Plate h={266}>
      <Arrowheads id="ah5" />

      {/* Board */}
      <rect x={20} y={8} width={300} height={148} fill="#f8f9f9" stroke="#b9b4a6" strokeWidth={3} />
      <T x={34} y={28} size={10} weight={700} fill="#1b2430">I/O SCHEDULE</T>
      <line x1={34} y1={33} x2={306} y2={33} stroke="#c1272d" strokeWidth={1.6} />

      <T x={34} y={49} size={7.5} weight={700} fill="#6b7280">INPUTS</T>
      <line x1={34} y1={53} x2={306} y2={53} stroke="#d5d8dc" strokeWidth={0.8} />
      <T x={34} y={106} size={7.5} weight={700} fill="#6b7280">OUTPUTS</T>
      <line x1={34} y1={110} x2={306} y2={110} stroke="#d5d8dc" strokeWidth={0.8} />

      {SCHEDULE_ROWS.map(([addr, label, dev], i) => {
        const y = (i < 3 ? 66 : 123) + (i % 3) * 15
        return (
          <g key={addr}>
            {i % 2 === 1 && <rect x={30} y={y - 10} width={280} height={13} fill="#edeff1" />}
            <T x={34} y={y} size={9} weight={700} fill={addr.startsWith('I') ? BLUE : AMBER}>{addr}</T>
            <T x={108} y={y} size={9} fill="#1b2430">{label}</T>
            <T x={206} y={y} size={8} fill="#4b5563">{dev}</T>
          </g>
        )
      })}

      {/* Stand */}
      <line x1={70} y1={156} x2={70} y2={196} stroke="#b9b4a6" strokeWidth={3} />
      <line x1={270} y1={156} x2={270} y2={196} stroke="#b9b4a6" strokeWidth={3} />
      <line x1={52} y1={196} x2={88} y2={196} stroke="#b9b4a6" strokeWidth={3} />
      <line x1={252} y1={196} x2={288} y2={196} stroke="#b9b4a6" strokeWidth={3} />
      <circle cx={54} cy={200} r={3.5} fill={GREY} />
      <circle cx={86} cy={200} r={3.5} fill={GREY} />
      <circle cx={254} cy={200} r={3.5} fill={GREY} />
      <circle cx={286} cy={200} r={3.5} fill={GREY} />

      {/* The address, taken apart */}
      <line x1={14} y1={214} x2={326} y2={214} stroke={FAINT} strokeWidth={1} />
      <T x={40} y={236} size={20} weight={700} fill={BLUE}>I</T>
      <T x={60} y={236} size={20} weight={700} fill={INK}>:</T>
      <T x={78} y={236} size={20} weight={700} fill={INK}>1</T>
      <T x={98} y={236} size={20} weight={700} fill={INK}>/</T>
      <T x={120} y={236} size={20} weight={700} fill={INK}>03</T>

      <line x1={44} y1={242} x2={44} y2={250} stroke={GREY} strokeWidth={0.8} />
      <line x1={82} y1={242} x2={82} y2={250} stroke={GREY} strokeWidth={0.8} />
      <line x1={128} y1={242} x2={128} y2={250} stroke={GREY} strokeWidth={0.8} />
      <T x={44} y={256} anchor="middle" size={7} fill={GREY}>FILE</T>
      <T x={82} y={256} anchor="middle" size={7} fill={GREY}>SLOT</T>
      <T x={128} y={256} anchor="middle" size={7} fill={GREY}>BIT</T>

      <T x={162} y={228} size={7.8} serif>I = input card: the field tells the processor</T>
      <T x={162} y={240} size={7.8} serif>O = output card: the processor drives it</T>
      <T x={162} y={252} size={7.8} serif>the bit is the terminal the wire lands on</T>
    </Plate>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Fig. 6 — inductive proximity sensor
// ════════════════════════════════════════════════════════════════════════════
export function FigProx() {
  return (
    <Plate h={170}>
      <Arrowheads id="ah6" />

      {/* Cable */}
      <path d="M18 74 C 34 66, 44 84, 62 74" fill="none" stroke="#4a4a50" strokeWidth={3.4} />
      <T x={14} y={62} size={7.5} fill={GREY}>BN +24V</T>
      <T x={14} y={92} size={7.5} fill={GREY}>BU 0V</T>
      <T x={14} y={102} size={7.5} fill={GREY}>BK SIGNAL</T>

      {/* Barrel */}
      <rect x={62} y={60} width={140} height={28} fill="#3a3a40" stroke={INK} strokeWidth={1.1} />
      {Array.from({ length: 15 }, (_, i) => (
        <line key={i} x1={112 + i * 6} y1={60} x2={112 + i * 6} y2={88}
              stroke="#5d5d66" strokeWidth={1} />
      ))}
      {/* Mounting nuts */}
      <rect x={140} y={54} width={12} height={40} fill="#6b6b74" stroke={INK} strokeWidth={0.9} />
      <rect x={158} y={54} width={12} height={40} fill="#6b6b74" stroke={INK} strokeWidth={0.9} />
      {/* Bracket */}
      <rect x={128} y={94} width={54} height={6} fill={STEEL} stroke={INK} strokeWidth={0.8} />

      {/* Status LED */}
      <circle cx={78} cy={74} r={5} fill="#e0a63a" stroke={INK} strokeWidth={0.8} />

      {/* Sensing face */}
      <rect x={202} y={60} width={7} height={28} fill="#d9d2bd" stroke={INK} strokeWidth={1} />

      {/* Field */}
      {[13, 21, 29].map((r) => (
        <path key={r} d={`M ${209 + r * 0.5} ${74 - r * 0.87} A ${r} ${r} 0 0 1 ${209 + r * 0.5} ${74 + r * 0.87}`}
              fill="none" stroke={AMBER} strokeWidth={0.9} strokeDasharray="3 2" />
      ))}

      {/* Target */}
      <rect x={252} y={50} width={12} height={48} fill={STEEL} stroke={INK} strokeWidth={1} />
      <Hatch x={252} y={50} w={12} h={48} step={5} stroke="#a9a294" />

      {/* Sensing range */}
      <line x1={209} y1={112} x2={252} y2={112} stroke={GREY} strokeWidth={0.8}
            markerStart="url(#ah6)" markerEnd="url(#ah6)" />
      <T x={230} y={124} anchor="middle" size={7.5} fill={GREY}>Sn &asymp; 4 mm</T>

      {/* Callouts */}
      <line x1={78} y1={68} x2={78} y2={40} stroke={GREY} strokeWidth={0.7} />
      <T x={78} y={36} anchor="middle" size={7.5} fill={GREY}>STATUS LED</T>
      <line x1={205} y1={60} x2={205} y2={40} stroke={GREY} strokeWidth={0.7} />
      <T x={205} y={36} anchor="middle" size={7.5} fill={GREY}>SENSING FACE</T>
      <T x={258} y={44} anchor="middle" size={7.5} fill={GREY}>TARGET</T>
      <T x={155} y={110} anchor="middle" size={7.5} fill={GREY}>M12 BARREL &amp; NUTS</T>

      <line x1={14} y1={136} x2={326} y2={136} stroke={FAINT} strokeWidth={1} />
      <T x={14} y={150} size={8} serif>
        No target in front of the face: output OFF, LED dark. That is the resting state.
      </T>
      <T x={14} y={160} size={8} serif>
        Steel in front of the face: output ON, LED lit &mdash; and I:1/03 makes.
      </T>
    </Plate>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Fig. 7 — through-beam photo-eye
// ════════════════════════════════════════════════════════════════════════════
export function FigPhotoEye() {
  return (
    <Plate h={168}>
      {/* Emitter */}
      <rect x={22} y={44} width={42} height={48} fill="#3a3a40" stroke={INK} strokeWidth={1.1} />
      <path d="M64 56 L74 62 L74 74 L64 80 Z" fill="#c7b98d" stroke={INK} strokeWidth={0.8} />
      <circle cx={32} cy={54} r={4} fill="#e0a63a" stroke={INK} strokeWidth={0.7} />
      <T x={43} y={106} anchor="middle" size={8} weight={700}>EMITTER</T>
      <T x={43} y={116} anchor="middle" size={7.5} fill={GREY}>TX</T>

      {/* Receiver */}
      <rect x={276} y={44} width={42} height={48} fill="#3a3a40" stroke={INK} strokeWidth={1.1} />
      <path d="M276 56 L266 62 L266 74 L276 80 Z" fill="#c7b98d" stroke={INK} strokeWidth={0.8} />
      <circle cx={308} cy={54} r={4} fill="#e0a63a" stroke={INK} strokeWidth={0.7} />
      <T x={297} y={106} anchor="middle" size={8} weight={700}>RECEIVER</T>
      <T x={297} y={116} anchor="middle" size={7.5} fill={GREY}>RX  &rarr;  I:1/04</T>

      {/* Beam */}
      <line x1={74} y1={68} x2={266} y2={68} stroke={RED} strokeWidth={1.4} strokeDasharray="5 4" />
      <T x={170} y={40} anchor="middle" size={8} fill={RED} weight={700}>BEAM</T>

      {/* Carton with product rising into the beam */}
      <path d="M140 56 L140 136 L200 136 L200 56" fill="#e6d3b0" stroke={INK} strokeWidth={1.1} />
      <rect x={142} y={64} width={56} height={71} fill="#8d8778" opacity={0.6} />
      <line x1={170} y1={96} x2={170} y2={74} stroke={INK} strokeWidth={1} />
      <path d="M166 80 L170 72 L174 80 Z" fill={INK} />

      <line x1={14} y1={146} x2={326} y2={146} stroke={FAINT} strokeWidth={1} />
      <T x={14} y={160} size={8} serif>
        Beam clear &mdash; RX lit, I:1/04 = 0. Product reaches the mouth, beam broken, I:1/04 = 1.
      </T>
    </Plate>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Fig. 8 — solenoid gate valve
// ════════════════════════════════════════════════════════════════════════════
export function FigSolenoid() {
  return (
    <Plate h={190}>
      <Arrowheads id="ah8" />

      {/* Chute */}
      <line x1={150} y1={8} x2={150} y2={172} stroke={INK} strokeWidth={1.4} />
      <line x1={210} y1={8} x2={210} y2={172} stroke={INK} strokeWidth={1.4} />
      <line x1={180} y1={14} x2={180} y2={54} stroke={GREY} strokeWidth={1}
            markerEnd="url(#ah8)" strokeDasharray="3 3" />
      <line x1={180} y1={118} x2={180} y2={166} stroke={GREY} strokeWidth={1}
            markerEnd="url(#ah8)" strokeDasharray="3 3" />
      <T x={222} y={26} size={7.5} fill={GREY}>PRODUCT</T>

      {/* Valve body */}
      <rect x={138} y={66} width={84} height={44} fill="#e7e0cd" stroke={INK} strokeWidth={1.2} />

      {/* Gate, part-withdrawn */}
      <rect x={150} y={80} width={44} height={13} fill="#b9b2a0" stroke={INK} strokeWidth={1} />
      <Hatch x={150} y={80} w={44} h={13} step={5} stroke="#8d8778" />
      <T x={172} y={128} anchor="middle" size={8} weight={700}>GATE</T>

      {/* Armature */}
      <rect x={110} y={82} width={40} height={9} fill="#6b6b74" stroke={INK} strokeWidth={0.9} />

      {/* Coil */}
      <rect x={54} y={64} width={56} height={44} fill="#4a4a50" stroke={INK} strokeWidth={1.1} />
      {Array.from({ length: 8 }, (_, i) => (
        <line key={i} x1={58 + i * 6.5} y1={64} x2={58 + i * 6.5} y2={108}
              stroke="#c08a3e" strokeWidth={1.6} />
      ))}
      <T x={82} y={122} anchor="middle" size={8} weight={700}>COIL</T>
      <T x={82} y={132} anchor="middle" size={8} fill={AMBER} weight={700}>O:2/01</T>

      {/* Terminals */}
      <line x1={66} y1={64} x2={66} y2={46} stroke={INK} strokeWidth={1} />
      <line x1={98} y1={64} x2={98} y2={46} stroke={INK} strokeWidth={1} />
      <circle cx={66} cy={44} r={3} fill="none" stroke={INK} strokeWidth={1} />
      <circle cx={98} cy={44} r={3} fill="none" stroke={INK} strokeWidth={1} />
      <T x={82} y={34} anchor="middle" size={7.5} fill={GREY}>A1 / A2 &mdash; 24 V DC</T>

      {/* Spring return */}
      <line x1={16} y1={60} x2={16} y2={112} stroke={INK} strokeWidth={1.6} />
      <path d="M16 86 L22 78 L28 94 L34 78 L40 94 L46 78 L52 86"
            fill="none" stroke={INK} strokeWidth={1.2} />
      <T x={34} y={148} anchor="middle" size={7.5} fill={GREY}>SPRING</T>
      <line x1={34} y1={140} x2={34} y2={100} stroke={GREY} strokeWidth={0.7} />

      <line x1={14} y1={156} x2={326} y2={156} stroke={FAINT} strokeWidth={1} />
      <T x={14} y={170} size={8} serif>
        De-energised the spring shuts the gate. The coil only ever holds it open.
      </T>
      <T x={14} y={180} size={8} serif>
        Lose the 24 V, lose the air, lose the coil &mdash; the silo shuts. That is the fail-safe direction.
      </T>
    </Plate>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Fig. 9 — pilot lamp
// ════════════════════════════════════════════════════════════════════════════
export function FigPilotLamp() {
  return (
    <Plate h={168}>
      {/* Panel wall in section */}
      <rect x={118} y={16} width={12} height={124} fill="#cfc9ba" stroke={INK} strokeWidth={1} />
      <Hatch x={118} y={16} w={12} h={124} step={6} stroke="#9d9686" />
      <T x={124} y={152} anchor="middle" size={7.5} fill={GREY}>PANEL</T>

      {/* Lens */}
      <path d="M108 46 A 30 32 0 0 0 108 106 Z" fill="#e0a63a" stroke={INK} strokeWidth={1.1}
            opacity={0.85} />
      <rect x={106} y={44} width={12} height={64} fill="#b9b2a0" stroke={INK} strokeWidth={1} />
      <T x={70} y={40} anchor="middle" size={7.5} fill={GREY}>LENS</T>
      <line x1={70} y1={44} x2={86} y2={60} stroke={GREY} strokeWidth={0.7} />
      <T x={112} y={124} anchor="middle" size={7.5} fill={GREY}>BEZEL</T>

      {/* Body behind the panel */}
      <rect x={130} y={54} width={58} height={44} fill="#4a4a50" stroke={INK} strokeWidth={1.1} />
      <rect x={146} y={68} width={14} height={14} fill="#f2d089" stroke={INK} strokeWidth={0.8} />
      {[-1, 0, 1].map((k) => (
        <line key={k} x1={144} y1={75 + k * 6} x2={136} y2={75 + k * 6}
              stroke="#e0a63a" strokeWidth={1} />
      ))}
      <T x={159} y={112} anchor="middle" size={7.5} fill={GREY}>LED ELEMENT</T>

      {/* Terminals */}
      <line x1={188} y1={66} x2={214} y2={66} stroke={INK} strokeWidth={1} />
      <line x1={188} y1={86} x2={214} y2={86} stroke={INK} strokeWidth={1} />
      <circle cx={216} cy={66} r={3} fill="none" stroke={INK} strokeWidth={1} />
      <circle cx={216} cy={86} r={3} fill="none" stroke={INK} strokeWidth={1} />
      <T x={224} y={78} size={7.5} fill={GREY}>24 V</T>

      {/* The three lenses on this panel */}
      <line x1={252} y1={16} x2={252} y2={140} stroke={FAINT} strokeWidth={1} />
      {([
        ['RUN', '#e0a63a', 'O:2/02'],
        ['FILL', '#e0a63a', 'O:2/03'],
        ['FULL', '#c34a3f', 'O:2/04'],
      ] as const).map(([name, col, addr], i) => (
        <g key={name}>
          <circle cx={276} cy={40 + i * 42} r={14} fill={col} stroke={INK} strokeWidth={1.1} />
          <circle cx={276} cy={40 + i * 42} r={17} fill="none" stroke="#8f8878" strokeWidth={2} />
          <T x={298} y={37 + i * 42} size={8} weight={700}>{name}</T>
          <T x={298} y={47 + i * 42} size={7.5} fill={AMBER}>{addr}</T>
        </g>
      ))}

      <line x1={14} y1={148} x2={326} y2={148} stroke={FAINT} strokeWidth={1} />
      <T x={14} y={162} size={8} serif>
        A lamp reports what the processor has written to its bit &mdash; not what the machine did with it.
      </T>
    </Plate>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Fig. 10 — the operator panel
// ════════════════════════════════════════════════════════════════════════════
export function FigOperatorPanel() {
  return (
    <Plate h={224}>
      {/* Enclosure */}
      <rect x={16} y={10} width={228} height={150} rx={4} fill="#8e8b82" stroke={INK} strokeWidth={1.4} />
      <rect x={22} y={16} width={216} height={138} rx={3} fill="none" stroke="#6f6c64" strokeWidth={0.8} />

      {/* START */}
      <circle cx={58} cy={50} r={17} fill={GREEN} stroke={INK} strokeWidth={1.2} />
      <circle cx={58} cy={50} r={21} fill="none" stroke="#6f6c64" strokeWidth={2} />
      <T x={58} y={82} anchor="middle" size={8} weight={700} fill="#1b1b1b">START</T>
      <T x={58} y={92} anchor="middle" size={7.5} fill={BLUE}>I:1/00</T>
      <T x={58} y={102} anchor="middle" size={7} fill="#2b2b2b">MOMENTARY NO</T>

      {/* STOP */}
      <circle cx={126} cy={50} r={17} fill={RED} stroke={INK} strokeWidth={1.2} />
      <circle cx={126} cy={50} r={21} fill="none" stroke="#6f6c64" strokeWidth={2} />
      <T x={126} y={82} anchor="middle" size={8} weight={700} fill="#1b1b1b">STOP</T>
      <T x={126} y={92} anchor="middle" size={7.5} fill={BLUE}>I:1/01</T>
      <T x={126} y={102} anchor="middle" size={7} fill="#2b2b2b">MOMENTARY NC</T>

      {/* Mode selector */}
      <circle cx={196} cy={50} r={17} fill="#5a5751" stroke={INK} strokeWidth={1.2} />
      <line x1={196} y1={50} x2={184} y2={38} stroke="#e6e2d8" strokeWidth={3} />
      <T x={175} y={32} anchor="middle" size={8} fill="#1b1b1b" weight={700}>A</T>
      <T x={218} y={40} anchor="middle" size={8} fill="#1b1b1b">B</T>
      <T x={218} y={68} anchor="middle" size={8} fill="#1b1b1b">C</T>
      <T x={196} y={82} anchor="middle" size={8} weight={700} fill="#1b1b1b">MODE</T>
      <T x={196} y={92} anchor="middle" size={7.5} fill={BLUE}>I:1/05</T>
      <T x={196} y={102} anchor="middle" size={7} fill="#2b2b2b">MAINTAINED</T>

      {/* Lamps */}
      {([['RUN', '#e0a63a'], ['FILL', '#e0a63a'], ['FULL', '#c34a3f']] as const).map(([n, c], i) => (
        <g key={n}>
          <circle cx={58 + i * 68} cy={128} r={12} fill={c} stroke={INK} strokeWidth={1.1} />
          <circle cx={58 + i * 68} cy={128} r={15} fill="none" stroke="#6f6c64" strokeWidth={2} />
          <T x={58 + i * 68} y={150} anchor="middle" size={7.5} weight={700} fill="#1b1b1b">{n}</T>
        </g>
      ))}

      {/* E-STOP, on its own */}
      <circle cx={290} cy={50} r={30} fill="#d7b93c" stroke={INK} strokeWidth={1.2} />
      <circle cx={290} cy={50} r={22} fill="#c0392b" stroke={INK} strokeWidth={1.4} />
      <circle cx={290} cy={50} r={15} fill="#a93226" stroke="none" />
      <T x={290} y={92} anchor="middle" size={8} weight={700}>E-STOP</T>
      <T x={290} y={102} anchor="middle" size={7.5} fill={BLUE}>I:1/02</T>
      <T x={290} y={112} anchor="middle" size={7} fill={GREY}>MAINTAINED</T>
      <T x={290} y={122} anchor="middle" size={7} fill={GREY}>TWIST TO RESET</T>

      {/* Contact symbols — how each button behaves before anyone touches it */}
      <line x1={14} y1={172} x2={326} y2={172} stroke={FAINT} strokeWidth={1} />

      {/* Normally open */}
      <line x1={20} y1={192} x2={40} y2={192} stroke={INK} strokeWidth={1.3} />
      <circle cx={43} cy={192} r={2.6} fill="none" stroke={INK} strokeWidth={1.1} />
      <line x1={45} y1={186} x2={65} y2={178} stroke={INK} strokeWidth={1.3} />
      <circle cx={68} cy={192} r={2.6} fill="none" stroke={INK} strokeWidth={1.1} />
      <line x1={71} y1={192} x2={92} y2={192} stroke={INK} strokeWidth={1.3} />
      <T x={100} y={195} size={8} weight={700}>NO</T>
      <T x={122} y={195} size={8} serif>open at rest. Pressing it makes the circuit. START.</T>

      {/* Normally closed */}
      <line x1={20} y1={216} x2={40} y2={216} stroke={INK} strokeWidth={1.3} />
      <circle cx={43} cy={216} r={2.6} fill="none" stroke={INK} strokeWidth={1.1} />
      <line x1={43} y1={216} x2={68} y2={216} stroke={INK} strokeWidth={1.3} />
      <line x1={47} y1={221} x2={65} y2={206} stroke={INK} strokeWidth={1.3} />
      <circle cx={68} cy={216} r={2.6} fill="none" stroke={INK} strokeWidth={1.1} />
      <line x1={71} y1={216} x2={92} y2={216} stroke={INK} strokeWidth={1.3} />
      <T x={100} y={219} size={8} weight={700}>NC</T>
      <T x={122} y={219} size={8} serif>made at rest. Pressing it breaks the circuit. STOP.</T>
    </Plate>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Fig. 11 — isolator, hasp, padlock and tag
// ════════════════════════════════════════════════════════════════════════════
export function FigIsolator() {
  return (
    <Plate h={210}>
      {/* Enclosure */}
      <rect x={30} y={24} width={188} height={140} rx={4} fill="#8e8b82" stroke={INK} strokeWidth={1.4} />
      <rect x={38} y={32} width={172} height={124} rx={3} fill="none" stroke="#6f6c64" strokeWidth={0.8} />

      {/* Escutcheon and markings */}
      <circle cx={124} cy={94} r={44} fill="#75726b" stroke={INK} strokeWidth={1} />
      <T x={124} y={44} anchor="middle" size={9} weight={700} fill="#1b1b1b">OFF</T>
      <line x1={124} y1={48} x2={124} y2={54} stroke="#1b1b1b" strokeWidth={1.6} />
      <T x={182} y={98} anchor="middle" size={9} weight={700} fill="#1b1b1b">ON</T>
      <line x1={168} y1={94} x2={174} y2={94} stroke="#1b1b1b" strokeWidth={1.6} />

      {/* Handle, thrown to OFF */}
      <rect x={116} y={54} width={16} height={44} rx={4} fill="#c0392b" stroke={INK} strokeWidth={1.2} />
      <circle cx={124} cy={94} r={9} fill="#5a5751" stroke={INK} strokeWidth={1} />

      {/* Hasp */}
      <rect x={100} y={130} width={48} height={16} rx={2} fill="#b9b2a0" stroke={INK} strokeWidth={1.1} />
      <circle cx={112} cy={138} r={3.4} fill={PAPER} stroke={INK} strokeWidth={0.9} />
      <circle cx={124} cy={138} r={3.4} fill={PAPER} stroke={INK} strokeWidth={0.9} />
      <circle cx={136} cy={138} r={3.4} fill={PAPER} stroke={INK} strokeWidth={0.9} />
      <T x={124} y={160} anchor="middle" size={7.5} fill="#1b1b1b">HASP</T>

      {/* Padlock through it */}
      <path d="M236 116 A 14 16 0 0 1 264 116 L264 130 L256 130 L256 118 A 6 8 0 0 0 244 118 L244 130 L236 130 Z"
            fill="#b9b2a0" stroke={INK} strokeWidth={1.1} />
      <rect x={228} y={128} width={44} height={38} rx={4} fill="#c0392b" stroke={INK} strokeWidth={1.2} />
      <circle cx={250} cy={144} r={4} fill="#3a3a40" />
      <rect x={248} y={146} width={4} height={9} fill="#3a3a40" />
      <T x={250} y={182} anchor="middle" size={8} weight={700}>PADLOCK</T>
      <T x={250} y={192} anchor="middle" size={7} fill={GREY}>ONE KEY. YOURS.</T>

      {/* Tag */}
      <path d="M272 132 C 288 128, 292 140, 300 140" fill="none" stroke={INK} strokeWidth={0.8} />
      <rect x={294} y={40} width={40} height={96} rx={3} fill="#f2d089" stroke={INK} strokeWidth={1} />
      <circle cx={314} cy={48} r={3} fill="none" stroke={INK} strokeWidth={0.9} />
      <T x={314} y={70} anchor="middle" size={9} weight={700} fill={RED}>DANGER</T>
      <line x1={300} y1={76} x2={328} y2={76} stroke={RED} strokeWidth={1} />
      <T x={314} y={90} anchor="middle" size={6.5} fill={INK}>DO NOT</T>
      <T x={314} y={100} anchor="middle" size={6.5} fill={INK}>OPERATE</T>
      <line x1={300} y1={108} x2={328} y2={108} stroke={FAINT} strokeWidth={0.8} />
      <line x1={300} y1={118} x2={328} y2={118} stroke={FAINT} strokeWidth={0.8} />
      <line x1={300} y1={128} x2={328} y2={128} stroke={FAINT} strokeWidth={0.8} />

      {/* Cabinet callout */}
      <T x={124} y={18} anchor="middle" size={8} weight={700}>MAIN ISOLATOR</T>
      <T x={38} y={180} size={8} serif>Handle at OFF, hasp through the staple, your lock through the hasp.</T>
      <T x={38} y={192} size={8} serif>Nobody can turn it back on while your lock is in it &mdash; including you,</T>
      <T x={38} y={204} size={8} serif>by accident, from the far end of the cell.</T>
    </Plate>
  )
}
