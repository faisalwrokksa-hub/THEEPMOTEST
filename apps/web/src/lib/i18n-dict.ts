/**
 * The dictionary itself lives in @pmo/contracts, because the API needs it too
 * for the Word, PowerPoint and Excel exports. This re-export keeps the import
 * path short at the call sites and marks the boundary.
 */
export { translator, term, type Lang, type T } from '@pmo/contracts';
