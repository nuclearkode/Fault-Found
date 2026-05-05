# FAULT//FOUND — Project Context for AI Assistants

> **PLC Troubleshooting Horror Game** — Browser-based, first-person 3D fault diagnosis simulator.

## Quick Reference
- **Full docs & skills**: `g:\My Drive\Fault Found\` (Google Drive)
- **Code repo**: This directory (`fault-found/`)
- **Stack**: Next.js + React-Three-Fiber + Drei + Rapier + Zustand + Howler.js + TypeScript (strict)
- **Renderer**: Three.js WebGL2 with WebGL1 fallback (3-tier GPU detection)
- **3D Styling**: Three.js Materials + GLSL shaders (NO CSS in 3D world)
- **UI Styling**: Tailwind CSS for DOM overlays only (via Drei `<Html>`)

## Architecture Rules — MUST FOLLOW
1. **Decouple PLC logic from 3D.** `src/engine/` never imports Three.js or React.
2. **Zustand selectors only.** `useGameStore(s => s.specificField)` — never destructure whole store.
3. **Scenario data is JSON.** Each scenario is `src/scenarios/S##.json`.
4. **DOM overlays via Drei `<Html>`.** Never render DOM outside Canvas context.
5. **All game state in Zustand.** No `useState` for game-critical data.
6. **WebGL fallback required.** Every visual feature must degrade gracefully.
7. **Name all meshes.** Every `<mesh>` needs a `name` prop for raycasting.

## Commands
```bash
npm run dev     # Dev server (localhost:3000)
npm run build   # Production build
npm run lint    # ESLint
npm test        # Vitest
```
