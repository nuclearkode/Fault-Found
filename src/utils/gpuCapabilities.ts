/**
 * GPU Capability Detection — WebGPU → WebGL2 → WebGL1 fallback chain.
 *
 * Detection order:
 *   1. Check if navigator.gpu exists (WebGPU API)
 *   2. If not, probe WebGL2 then WebGL1
 *   3. Classify into tiers based on detected backend + hardware
 *
 * Tier system:
 *   HIGH:   WebGPU available, or WebGL2 + dedicated GPU
 *   MEDIUM: WebGL2 + integrated GPU, or WebGL1 + instanced arrays
 *   LOW:    WebGL1 basic — no shadows, no post-processing
 */

export type GPUTier = 'high' | 'medium' | 'low'
export type GPUBackend = 'webgpu' | 'webgl2' | 'webgl1'

export interface GPUCaps {
  backend: GPUBackend
  webgpu: boolean
  webgl2: boolean
  maxTextureSize: number
  floatTextures: boolean
  instancedArrays: boolean
  drawBuffers: boolean
  anisotropy: number
  tier: GPUTier
  renderer: string
}

/**
 * Synchronous GPU capability detection.
 *
 * WebGPU presence is checked via navigator.gpu — this exists immediately
 * (no await needed). The actual adapter request is async and happens later
 * during renderer init. We just need to know IF WebGPU is available to
 * choose the renderer path.
 */
export function detectGPU(): GPUCaps {
  // --- Check WebGPU availability ---
  const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator

  // --- Probe WebGL capabilities (always needed for fallback tier logic) ---
  const canvas = document.createElement('canvas')
  const gl2 = canvas.getContext('webgl2')
  const gl = gl2 || canvas.getContext('webgl')

  if (!gl) {
    // Absolute minimum fallback — should rarely happen in 2026
    return {
      backend: 'webgl1',
      webgpu: false,
      webgl2: false,
      maxTextureSize: 1024,
      floatTextures: false,
      instancedArrays: false,
      drawBuffers: false,
      anisotropy: 1,
      tier: 'low',
      renderer: 'unknown',
    }
  }

  const debugExt = gl.getExtension('WEBGL_debug_renderer_info')
  const renderer = debugExt
    ? gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL)
    : 'unknown'

  // Determine backend: prefer WebGPU, fall back to best available WebGL
  const backend: GPUBackend = hasWebGPU ? 'webgpu' : gl2 ? 'webgl2' : 'webgl1'

  const caps: GPUCaps = {
    backend,
    webgpu: hasWebGPU,
    webgl2: !!gl2,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    floatTextures: !!gl.getExtension('OES_texture_float'),
    instancedArrays: !!gl2 || !!gl.getExtension('ANGLE_instanced_arrays'),
    drawBuffers: !!gl2 || !!gl.getExtension('WEBGL_draw_buffers'),
    anisotropy: getMaxAnisotropy(gl),
    tier: 'high', // Will be downgraded below if needed
    renderer,
  }

  // --- Tier classification ---
  if (hasWebGPU) {
    // WebGPU available — always high tier
    // The WebGPU adapter check during renderer init may still fail,
    // in which case the renderer will gracefully fall back to WebGL2
    caps.tier = 'high'
  } else if (gl2) {
    // WebGL2 — high if good hardware, medium if constrained
    caps.tier = caps.maxTextureSize >= 4096 ? 'high' : 'medium'
  } else {
    // WebGL1 — medium if has instanced arrays, low otherwise
    caps.tier = caps.instancedArrays ? 'medium' : 'low'
  }

  canvas.remove()
  return caps
}

function getMaxAnisotropy(gl: WebGLRenderingContext): number {
  const ext = gl.getExtension('EXT_texture_filter_anisotropic')
  return ext ? gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 1
}
