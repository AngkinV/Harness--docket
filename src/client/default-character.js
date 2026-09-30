import manifest from '../../assets/pets/blue-maid/manifest.json'
export const DEFAULT_CHARACTER = { ...manifest, source: 'animation', format: 'alpha-video', human: false, rigged: false, boneCount: 0, bytes: Object.values(manifest.clips).reduce((sum, clip) => sum + clip.bytes + (clip.hevc?.bytes || 0), 0) }
