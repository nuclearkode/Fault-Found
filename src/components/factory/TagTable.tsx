'use client'

/**
 * TagTable — the I/O schedule, on its own whiteboard beside the SFC board.
 *
 * The SFC in silo_cell.glb tells you the SEQUENCE but names nothing: it refers
 * to steps and transitions, and the player is left to guess which physical
 * sensor sits behind `I:1/03`. That guess is the difference between reading the
 * chart and reading the machine, so the schedule belongs next to it — which is
 * exactly where a panel shop would put it.
 *
 * A second board rather than a wider one. The SFC's board is a free-standing
 * mobile whiteboard (frame, posts, feet, castors, pen tray, magnets), so this is
 * built to the same construction and dimensions read off the GLB, and wheeled up
 * alongside. Nothing in the model is touched.
 *
 * The table is a canvas texture. The SFC draws its text as one small mesh per
 * lit pixel — 1,856 of them for one chart — which is fine for a baked asset and
 * a poor idea for a table that changes with the scenario. A texture costs one
 * mesh and redraws for free.
 */

import { useMemo, useEffect } from 'react'
import * as THREE from 'three'
import { useGameStore } from '@/stores/gameStore'
import type { IOTag } from '@/engine/types'

// ── Construction, in SiloCell-local space ───────────────────────────────────
// Every figure below is measured off the GLB's own whiteboard so the pair read
// as two of the same thing rather than a board and a lookalike.
const PANEL_W = 1.30
const PANEL_H = 0.90
const PANEL_Y0 = 0.83              // WB_Panel sits 0.83..1.73
const FRAME_T = 0.026              // WB_Frame_HB height
const POST = 0.042                 // WB_Post_L section
const POST_H = 1.72
const FOOT_D = 0.62                // WB_Foot_L depth
const BOARD_Z = 1.28               // the panel plane, WB_Panel z 1.27..1.29
const PANEL_D = 0.02

/**
 * Gap to the SFC board's outer frame, which ends at x = -5.13.
 * Wide enough that the two posts don't touch and it reads as two boards.
 */
const GAP = 0.30
const FRAME_W = PANEL_W + FRAME_T * 2
const RIGHT_EDGE = -5.13 - GAP
const CX = RIGHT_EDGE - FRAME_W / 2
const CY = PANEL_Y0 + PANEL_H / 2

const MAT = {
  panel: new THREE.MeshStandardMaterial({
    color: '#f8f9f9', roughness: 0.22, metalness: 0 }),
  frame: new THREE.MeshStandardMaterial({
    color: '#e5e7ea', roughness: 0.3, metalness: 0.85 }),
  castor: new THREE.MeshStandardMaterial({
    color: '#59595d', roughness: 0.6, metalness: 0 }),
} as const

/** Texture resolution. Read from about a metre, so it has to hold up. */
const PX_PER_M = 1000

/**
 * Which physical device sits behind each address.
 *
 * Taken from the tag's own `description` — the scenario JSON already carries one
 * per tag and nothing rendered it. Trimmed at the first comma or dash because
 * those are written as "device, detail" and only the device belongs in a column.
 */
function device(tag: IOTag): string {
  const d = (tag.description ?? '').split(/[,—]/)[0].trim()
  return d.length > 30 ? d.slice(0, 29) + '…' : d
}

function drawTable(tags: IOTag[], title: string): HTMLCanvasElement {
  const w = Math.round(PANEL_W * PX_PER_M)
  const h = Math.round(PANEL_H * PX_PER_M)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!

  g.fillStyle = '#f8f9f9'
  g.fillRect(0, 0, w, h)

  const padX = w * 0.045
  const mono = (px: number, weight = '400') =>
    `${weight} ${px}px ui-monospace, "JetBrains Mono", monospace`

  // Title and rule, matching the SFC board's own header treatment
  g.fillStyle = '#1b2430'
  g.font = mono(h * 0.058, '700')
  g.textBaseline = 'alphabetic'
  g.fillText(title, padX, h * 0.078)
  g.fillStyle = '#c1272d'
  g.fillRect(padX, h * 0.092, w - padX * 2, Math.max(2, h * 0.005))

  const inputs = tags.filter(t => t.id.startsWith('I'))
  const outputs = tags.filter(t => !t.id.startsWith('I'))
  const rows = inputs.length + outputs.length + 2   // + a header per section

  const top = h * 0.135
  const rowH = (h - top - h * 0.03) / rows
  const fs = Math.min(rowH * 0.58, h * 0.038)

  const colA = padX                    // address
  const colB = padX + w * 0.17         // tag name
  const colC = padX + w * 0.43         // the actual device

  let y = top

  const section = (label: string) => {
    g.fillStyle = '#6b7280'
    g.font = mono(fs * 0.84, '700')
    g.fillText(label, colA, y + rowH * 0.7)
    g.fillStyle = '#d5d8dc'
    g.fillRect(colA, y + rowH * 0.86, w - padX * 2, 1)
    y += rowH
  }

  const row = (t: IOTag, i: number) => {
    if (i % 2 === 1) {
      g.fillStyle = '#edeff1'
      g.fillRect(colA - padX * 0.35, y + rowH * 0.06, w - padX * 1.3, rowH * 0.86)
    }
    // Inputs blue, outputs amber — the one thing you want to see at a glance
    g.font = mono(fs, '700')
    g.fillStyle = t.id.startsWith('I') ? '#1d4ed8' : '#b45309'
    g.fillText(t.id, colA, y + rowH * 0.7)
    g.font = mono(fs, '400')
    g.fillStyle = '#1b2430'
    g.fillText(t.label, colB, y + rowH * 0.7)
    g.fillStyle = '#4b5563'
    g.font = mono(fs * 0.86, '400')
    g.fillText(device(t), colC, y + rowH * 0.7)
    y += rowH
  }

  section('INPUTS')
  inputs.forEach(row)
  section('OUTPUTS')
  outputs.forEach(row)

  return c
}

/** Rendered inside the SiloCell group, so all of this is cell-local. */
export function TagTable() {
  // A snapshot, not a live readout. This is a printed schedule: it says what is
  // wired where, which does not change while the cell runs. Only the tag SET
  // changes, and only when a scenario loads.
  const tags = useGameStore(s => s.tags)
  const scenarioId = useGameStore(s => s.scenarioId)

  const texture = useMemo(() => {
    const list = Object.values(tags)
    if (list.length === 0) return null
    const t = new THREE.CanvasTexture(drawTable(list, `I/O SCHEDULE  ${scenarioId ?? ''}`))
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }, [tags, scenarioId])

  // A CanvasTexture holds a GPU allocation; a new scenario makes a new one.
  useEffect(() => () => { texture?.dispose() }, [texture])

  const halfW = FRAME_W / 2

  return (
    <group name="tag_board" position={[CX, 0, 0]}>
      {/* Face */}
      <mesh name="tag_board_panel" position={[0, CY, BOARD_Z]} castShadow receiveShadow>
        <boxGeometry args={[PANEL_W, PANEL_H, PANEL_D]} />
        <primitive object={MAT.panel} attach="material" />
      </mesh>

      {/* The schedule, a hair proud of the face so it cannot z-fight. The SFC's
          own glyphs sit at z 1.301 for exactly the same reason. */}
      {texture && (
        <mesh name="tag_board_face" position={[0, CY, BOARD_Z + 0.011]}>
          <planeGeometry args={[PANEL_W * 0.98, PANEL_H * 0.98]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      )}

      {/* Frame: two horizontals, two verticals */}
      {([-1, 1] as const).map((s) => (
        <mesh key={`h${s}`} position={[0, CY + s * (PANEL_H / 2 + FRAME_T / 2), BOARD_Z]}>
          <boxGeometry args={[FRAME_W, FRAME_T, 0.032]} />
          <primitive object={MAT.frame} attach="material" />
        </mesh>
      ))}
      {([-1, 1] as const).map((s) => (
        <mesh key={`v${s}`} position={[s * (PANEL_W / 2 + FRAME_T / 2), CY, BOARD_Z]}>
          <boxGeometry args={[FRAME_T, PANEL_H + FRAME_T * 2, 0.032]} />
          <primitive object={MAT.frame} attach="material" />
        </mesh>
      ))}

      {/* Posts, feet and castors — it stands on the floor like its neighbour */}
      {([-1, 1] as const).map((s) => (
        <group key={`leg${s}`} position={[s * (halfW - POST / 2 - 0.005), 0, BOARD_Z]}>
          <mesh position={[0, POST_H / 2, 0]} castShadow>
            <boxGeometry args={[POST, POST_H, POST]} />
            <primitive object={MAT.frame} attach="material" />
          </mesh>
          <mesh position={[0, 0.035, 0]} castShadow>
            <boxGeometry args={[0.052, 0.052, FOOT_D]} />
            <primitive object={MAT.frame} attach="material" />
          </mesh>
          {([-1, 1] as const).map((f) => (
            // Rotation belongs on the mesh, not the geometry — a cylinder is
            // built along Y and a castor rolls about X.
            <mesh key={f} position={[0, 0.028, f * (FOOT_D / 2 - 0.05)]}
                  rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.028, 0.028, 0.022, 10]} />
              <primitive object={MAT.castor} attach="material" />
            </mesh>
          ))}
        </group>
      ))}

      {/* Pen rail and tray, same heights as the SFC board's */}
      <mesh position={[0, 0.72, BOARD_Z]}>
        <boxGeometry args={[PANEL_W - 0.06, 0.032, 0.032]} />
        <primitive object={MAT.frame} attach="material" />
      </mesh>
      <mesh position={[0, 0.785, BOARD_Z - 0.028]}>
        <boxGeometry args={[0.936, 0.014, 0.055]} />
        <primitive object={MAT.frame} attach="material" />
      </mesh>
    </group>
  )
}
