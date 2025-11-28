import { Token } from '@lumino/coreutils';
import type { ISignal } from '@lumino/signaling';

/**
 * The operating mode for hybrid kernels.
 *
 * - 'hybrid': Normal JupyterLab mode - shows both server kernels (from localhost) and lite kernels.
 *             Use this when running JupyterLab with a local Jupyter server.
 * - 'remote': Remote server mode - shows lite kernels, and optionally remote server kernels
 *             when configured via the remote server dialog. Use this in JupyterLite
 *             or when you don't have a local Jupyter server.
 */
export type HybridKernelsMode = 'hybrid' | 'remote';

/**
 * The remote server configuration token.
 */
export const IRemoteServerConfig = new Token<IRemoteServerConfig>(
  'jupyterlab-hybrid-kernels:IRemoteServerConfig',
  'Remote server configuration for hybrid kernels'
);

/**
 * Remote server configuration interface
 */
export interface IRemoteServerConfig {
  /**
   * The base URL of the remote server (reads from PageConfig)
   */
  readonly baseUrl: string;

  /**
   * The authentication token (reads from PageConfig)
   */
  readonly token: string;

  /**
   * Whether we are currently connected to the remote server
   */
  readonly isConnected: boolean;

  /**
   * Signal emitted when configuration changes
   */
  readonly changed: ISignal<IRemoteServerConfig, void>;

  /**
   * Update the configuration (writes to PageConfig)
   */
  update(config: { baseUrl?: string; token?: string }): void;

  /**
   * Set the connection state
   */
  setConnected(connected: boolean): void;
}
