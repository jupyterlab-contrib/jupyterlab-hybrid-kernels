import { ServerConnection } from '@jupyterlab/services';
import { PageConfig } from '@jupyterlab/coreutils';
import { Signal } from '@lumino/signaling';
import type { ISignal } from '@lumino/signaling';

import type { IRemoteServerConfig, HybridKernelsMode } from './tokens';

/**
 * PageConfig keys for hybrid kernels configuration
 */
const PAGE_CONFIG_BASE_URL_KEY = 'hybridKernelsBaseUrl';
const PAGE_CONFIG_TOKEN_KEY = 'hybridKernelsToken';
const PAGE_CONFIG_MODE_KEY = 'hybridKernelsMode';

/**
 * Get the current hybrid kernels mode from PageConfig.
 * Defaults to 'hybrid' if not configured.
 */
export function getHybridKernelsMode(): HybridKernelsMode {
  const mode = PageConfig.getOption(PAGE_CONFIG_MODE_KEY);
  if (mode === 'remote') {
    return 'remote';
  }
  return 'hybrid';
}

/**
 * Implementation of remote server configuration.
 * Always reads from and writes to PageConfig, acting as a proxy.
 */
export class RemoteServerConfig implements IRemoteServerConfig {
  /**
   * Get the base URL from PageConfig
   */
  get baseUrl(): string {
    return PageConfig.getOption(PAGE_CONFIG_BASE_URL_KEY);
  }

  /**
   * Get the token from PageConfig
   */
  get token(): string {
    return PageConfig.getOption(PAGE_CONFIG_TOKEN_KEY);
  }

  /**
   * Whether we are currently connected to the remote server
   */
  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * A signal emitted when the configuration changes.
   */
  get changed(): ISignal<this, void> {
    return this._changed;
  }

  /**
   * Set the connection state
   */
  setConnected(connected: boolean): void {
    if (this._isConnected !== connected) {
      this._isConnected = connected;
      this._changed.emit();
    }
  }

  /**
   * Update the configuration by writing to PageConfig.
   * The new values will be immediately available via the getters.
   */
  update(config: { baseUrl?: string; token?: string }): void {
    let hasChanged = false;
    const currentBaseUrl = this.baseUrl;
    const currentToken = this.token;

    if (config.baseUrl !== undefined && config.baseUrl !== currentBaseUrl) {
      PageConfig.setOption(PAGE_CONFIG_BASE_URL_KEY, config.baseUrl);
      hasChanged = true;
    }

    if (config.token !== undefined && config.token !== currentToken) {
      PageConfig.setOption(PAGE_CONFIG_TOKEN_KEY, config.token);
      hasChanged = true;
    }

    if (hasChanged) {
      this._changed.emit();
    }
  }

  private _changed = new Signal<this, void>(this);
  private _isConnected = false;
}

/**
 * Create dynamic server settings that read from PageConfig on every access.
 * This ensures that when the user updates the configuration via the dialog,
 * subsequent API calls will use the new values without needing to recreate managers.
 *
 * The returned object implements ServerConnection.ISettings with dynamic getters
 * for baseUrl, wsUrl, and token that always read the current values from PageConfig.
 */
export function createServerSettings(): ServerConnection.ISettings {
  const defaultSettings = ServerConnection.makeSettings();

  const dynamicSettings: ServerConnection.ISettings = {
    get baseUrl(): string {
      const baseUrl = PageConfig.getOption(PAGE_CONFIG_BASE_URL_KEY);
      if (!baseUrl) {
        return defaultSettings.baseUrl;
      }
      return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    },

    get appUrl(): string {
      return defaultSettings.appUrl;
    },

    get wsUrl(): string {
      const baseUrl = PageConfig.getOption(PAGE_CONFIG_BASE_URL_KEY);
      if (!baseUrl) {
        return defaultSettings.wsUrl;
      }
      const wsUrl = baseUrl.replace(/^http/, 'ws');
      return wsUrl.endsWith('/') ? wsUrl : `${wsUrl}/`;
    },

    get token(): string {
      return PageConfig.getOption(PAGE_CONFIG_TOKEN_KEY);
    },

    get init(): RequestInit {
      return defaultSettings.init;
    },

    get Headers(): typeof Headers {
      return defaultSettings.Headers;
    },

    get Request(): typeof Request {
      return defaultSettings.Request;
    },

    get fetch(): ServerConnection.ISettings['fetch'] {
      return defaultSettings.fetch;
    },

    get WebSocket(): typeof WebSocket {
      return defaultSettings.WebSocket;
    },

    get appendToken(): boolean {
      return true;
    },

    get serializer(): ServerConnection.ISettings['serializer'] {
      return defaultSettings.serializer;
    }
  };

  return dynamicSettings;
}
