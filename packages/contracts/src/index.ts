/**
 * @agri/contracts — the wire contracts, shared by browser and backend.
 *
 * The JSON Schemas in schemas/ are the source of truth. Types in src/generated/ are
 * produced from them by `pnpm gen` and must not be hand-edited. Everything else in
 * this package is hand-written helper code that builds on those types.
 */

export * from './generated/contracts';
export * from './topics';
export * from './api';

/** REST and WebSocket API version. */
export const API_VERSION = 'v1';
