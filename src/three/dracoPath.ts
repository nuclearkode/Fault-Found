/**
 * Point drei's Draco decoder at our own origin. Import for side effect only.
 *
 * Eleven shipped GLBs are Draco-compressed (worker.glb and all ten
 * models/stations/st*.glb), and drei keeps the decoder location in a
 * module-level `let` that defaults to Google's CDN:
 *
 *     let decoderPath = 'https://www.gstatic.com/draco/versioned/decoders/1.5.5/'
 *
 * Left alone, the game fetches its decoder from gstatic.com at runtime while
 * shipping an unused copy in public/draco/. That is a hard dependency on a
 * third-party origin for an otherwise self-hosted game, and it fails closed —
 * a network that blocks gstatic (plenty of campus and corporate wifi does)
 * renders none of the compressed models.
 *
 * ── Why this is its own module, and why the import order matters ─────────────
 *
 * This cannot live in a component's module body. Look at what drei does
 * (node_modules/@react-three/drei/core/Gltf.js):
 *
 *     function extensions(useDraco = true, ...) {
 *       return loader => {
 *         if (!dracoLoader) dracoLoader = new DRACOLoader()
 *         dracoLoader.setDecoderPath(typeof useDraco === 'string' ? useDraco : decoderPath)
 *         ...
 *       }
 *     }
 *     useGLTF.preload = (path, ...) => useLoader.preload(GLTFLoader, path, extensions(...))
 *
 * The returned closure reads `decoderPath` when the loader is CONSTRUCTED, and
 * `useGLTF.preload(...)` constructs it immediately. Half a dozen of our
 * components call `useGLTF.preload(...)` at module scope — that is deliberate,
 * it is how the rig warms its models. ES modules evaluate every import before
 * the importing module's own body, so those preloads all fire before any line
 * of GameCanvas.tsx runs. A `setDecoderPath` call in GameCanvas's body is
 * therefore dead on arrival: it was measured still fetching from gstatic.
 *
 * So this must be imported FIRST, above the component imports, by the module
 * that roots the model-loading subtree. Keep it at the top of GameCanvas.tsx's
 * import list — moving it down silently restores the CDN fetch, and nothing
 * will fail loudly if it does.
 */

import { useGLTF } from '@react-three/drei'

/** Trailing slash required — drei concatenates the filename onto this. */
useGLTF.setDecoderPath('/draco/')
