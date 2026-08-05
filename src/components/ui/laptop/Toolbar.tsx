'use client'

/**
 * Toolbar — the instruction palette, drawn the way a ladder editor draws it.
 *
 * The palette is MODAL by design: you arm an instruction here, the ladder grows
 * drop targets, you click one. That is how every real ladder editor works, and
 * it is the only interaction that survives being driven entirely by a mouse with
 * the pointer unlocked — no keyboard shortcuts, because `src/input/keymap.ts`
 * owns the keyboard and this panel may not take a single binding from it.
 *
 * Nothing here subscribes to `gameStore.tags`. The only game state it reads is
 * the rung list, and only on a click.
 */

import { useLaptopStore } from '@/stores/laptopStore'
import { removeAt, toggleContactType } from '@/engine/ladder'
import type { Instruction } from '@/stores/laptopStore'

/** The instruction glyphs, drawn rather than spelled — `-| |-`, not "XIC". */
function Glyph({ kind }: { kind: 'xic' | 'xio' | 'ote' | 'branch' }) {
  return (
    <svg className="ff-glyph" width={38} height={20} viewBox="0 0 38 20" aria-hidden>
      {kind === 'ote' ? (
        <>
          <line className="ff-g-wire" x1={2} y1={10} x2={12} y2={10} />
          <path className="ff-g-wire" d="M 12 3 A 9 7 0 0 0 12 17" fill="none" />
          <path className="ff-g-wire" d="M 26 3 A 9 7 0 0 1 26 17" fill="none" />
          <line className="ff-g-wire" x1={26} y1={10} x2={36} y2={10} />
        </>
      ) : kind === 'branch' ? (
        <>
          <line className="ff-g-wire" x1={2} y1={5} x2={36} y2={5} />
          <line className="ff-g-wire" x1={8} y1={5} x2={8} y2={16} />
          <line className="ff-g-wire" x1={30} y1={5} x2={30} y2={16} />
          <line className="ff-g-wire" x1={8} y1={16} x2={30} y2={16} />
        </>
      ) : (
        <>
          <line className="ff-g-wire" x1={2} y1={10} x2={13} y2={10} />
          <line className="ff-g-bar" x1={13} y1={3} x2={13} y2={17} />
          <line className="ff-g-bar" x1={25} y1={3} x2={25} y2={17} />
          {kind === 'xio' && <line className="ff-g-bar" x1={11} y1={17} x2={27} y2={3} />}
          <line className="ff-g-wire" x1={25} y1={10} x2={36} y2={10} />
        </>
      )}
    </svg>
  )
}

// `lastDownload` is cleared by laptopStore.resetForRun, so 0 means "nothing has
// been written to THIS processor" — this shift, not this browser session.
const stamp = (ms: number): string => {
  if (ms === 0) return 'none this shift'
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

export function Toolbar() {
  const armed = useLaptopStore((s) => s.armed)
  const arm = useLaptopStore((s) => s.arm)
  const selection = useLaptopStore((s) => s.selection)
  const applyOp = useLaptopStore((s) => s.applyOp)
  const beginEdit = useLaptopStore((s) => s.beginEdit)
  const setNotice = useLaptopStore((s) => s.setNotice)
  const pending = useLaptopStore((s) => Object.keys(s.drafts).length)
  const download = useLaptopStore((s) => s.download)
  const clearDrafts = useLaptopStore((s) => s.clearDrafts)
  const lastDownload = useLaptopStore((s) => s.lastDownload)

  // A contact is under the cursor (as opposed to a whole rung, or nothing).
  const target =
    selection !== null && selection.path !== null
      ? { rungId: selection.rungId, path: selection.path }
      : null

  const pick = (i: Instruction): void => {
    arm(i)
  }

  return (
    <div className="ff-itbar">
      <div className="ff-itbar-tabs">
        <span className="ff-itab ff-itab-on">Bit</span>
        <span className="ff-itab ff-itab-off" title="not licensed on this terminal">
          Timer/Counter
        </span>
        <span className="ff-itab ff-itab-off" title="not licensed on this terminal">
          Compare
        </span>
      </div>

      <div className="ff-itbar-row">
        <div className="ff-palette" role="group" aria-label="Bit instructions">
          <button
            type="button"
            className={armed === 'XIC' ? 'ff-inst ff-inst-on' : 'ff-inst'}
            aria-pressed={armed === 'XIC'}
            title="XIC — Examine If Closed. Click, then click a drop point on a rung."
            onClick={() => pick('XIC')}
          >
            <Glyph kind="xic" />
            <em>XIC</em>
          </button>
          <button
            type="button"
            className={armed === 'XIO' ? 'ff-inst ff-inst-on' : 'ff-inst'}
            aria-pressed={armed === 'XIO'}
            title="XIO — Examine If Open. Click, then click a drop point on a rung."
            onClick={() => pick('XIO')}
          >
            <Glyph kind="xio" />
            <em>XIO</em>
          </button>
          <button
            type="button"
            className="ff-inst ff-inst-locked"
            title="The output coil is wired in the panel — it cannot be moved from the terminal."
            onClick={() =>
              setNotice(
                'OTE is locked — output coils are wired in the panel, not from this terminal.',
              )
            }
          >
            <Glyph kind="ote" />
            <em>OTE</em>
          </button>
          <button
            type="button"
            className={armed === 'BRANCH' ? 'ff-inst ff-inst-on' : 'ff-inst'}
            aria-pressed={armed === 'BRANCH'}
            title="Branch — click, then click the branch point under an instruction."
            onClick={() => pick('BRANCH')}
          >
            <Glyph kind="branch" />
            <em>BRANCH</em>
          </button>
        </div>

        <div className="ff-sep" />

        <div className="ff-palette">
          <button
            type="button"
            className="ff-tool"
            disabled={target === null}
            title="Swap the selected instruction between XIC and XIO"
            onClick={() => target !== null && applyOp(target, toggleContactType)}
          >
            XIC ⇄ XIO
          </button>
          <button
            type="button"
            className="ff-tool"
            disabled={target === null}
            title="Edit the selected instruction's address"
            onClick={() => target !== null && beginEdit(target)}
          >
            Address…
          </button>
          <button
            type="button"
            className="ff-tool ff-tool-danger"
            disabled={target === null}
            title="Delete the selected instruction"
            onClick={() => target !== null && applyOp(target, removeAt)}
          >
            Delete
          </button>
        </div>

        <div className="ff-sep" />

        <button
          type="button"
          className="ff-dl"
          disabled={pending === 0}
          title="Write every edited rung into the running processor"
          onClick={() => {
            const n = download()
            setNotice(
              n === 0
                ? null
                : `Download complete — ${n} rung${n === 1 ? '' : 's'} written to the processor.`,
            )
          }}
        >
          ▼ Download to PLC{pending > 0 ? ` (${pending})` : ''}
        </button>
        <button
          type="button"
          className="ff-tool"
          disabled={pending === 0}
          title="Throw away every pending edit"
          onClick={() => clearDrafts()}
        >
          Discard all edits
        </button>

        <span className="ff-itbar-last">Last download {stamp(lastDownload)}</span>
      </div>
    </div>
  )
}
