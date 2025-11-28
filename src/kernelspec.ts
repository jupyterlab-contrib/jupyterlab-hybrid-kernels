import type { KernelSpec, ServerConnection } from '@jupyterlab/services';
import { BaseManager, KernelSpecManager } from '@jupyterlab/services';

import { URLExt } from '@jupyterlab/coreutils';

import type { IKernelSpecs } from '@jupyterlite/services';
import { LiteKernelSpecClient } from '@jupyterlite/services';

import { Poll } from '@lumino/polling';
import type { ISignal } from '@lumino/signaling';
import { Signal } from '@lumino/signaling';

import { getHybridKernelsMode } from './config';

/**
 * A hybrid kernel spec manager that combines in-browser (lite) kernel specs
 * with remote server kernel specs.
 */
export class HybridKernelSpecManager
  extends BaseManager
  implements KernelSpec.IManager
{
  /**
   * Construct a new hybrid kernel spec manager.
   */
  constructor(options: HybridKernelSpecManager.IOptions) {
    super(options);
    this._serverSettings = options.serverSettings;
    this._kernelSpecManager = new KernelSpecManager({
      serverSettings: options.serverSettings
    });
    const { kernelSpecs, serverSettings } = options;
    const kernelSpecAPIClient = new LiteKernelSpecClient({
      kernelSpecs,
      serverSettings
    });
    this._liteKernelSpecManager = new KernelSpecManager({
      kernelSpecAPIClient,
      serverSettings
    });

    kernelSpecs.changed.connect(() => {
      this.refreshSpecs();
    });

    this._ready = Promise.all([this.refreshSpecs()])
      .then(_ => undefined)
      .catch(_ => undefined)
      .then(() => {
        if (this.isDisposed) {
          return;
        }
        this._isReady = true;
      });

    this._pollSpecs = new Poll({
      auto: false,
      factory: () => this.refreshSpecs(),
      frequency: {
        interval: 10 * 1000, // Poll every 10 seconds (instead of default 61 seconds)
        backoff: true,
        max: 300 * 1000
      },
      name: '@jupyterlab-hybrid-kernels:HybridKernelSpecManager#specs',
      standby: options.standby ?? 'when-hidden'
    });
    void this._ready.then(() => {
      void this._pollSpecs.start();
    });
  }

  /**
   * A signal emitted when there is a connection failure.
   */
  get connectionFailure(): ISignal<this, Error> {
    return this._connectionFailure;
  }

  /**
   * Test whether the manager is ready.
   */
  get isReady(): boolean {
    return this._isReady;
  }

  /**
   * A promise that fulfills when the manager is ready.
   */
  get ready(): Promise<void> {
    return this._ready;
  }

  /**
   * Dispose of the resources used by the manager.
   */
  dispose(): void {
    this._pollSpecs.dispose();
    super.dispose();
  }

  /**
   * Get the kernel specs.
   */
  get specs(): KernelSpec.ISpecModels | null {
    return this._specs;
  }

  /**
   * A signal emitted when the specs change.
   */
  get specsChanged(): ISignal<this, KernelSpec.ISpecModels> {
    return this._specsChanged;
  }

  /**
   * Force a refresh of the specs from the server.
   */
  async refreshSpecs(): Promise<void> {
    const mode = getHybridKernelsMode();
    const serverSettings = this._kernelSpecManager.serverSettings;
    const baseUrl = serverSettings.baseUrl;

    let serverSpecs: KernelSpec.ISpecModels | null = null;

    if (mode === 'hybrid') {
      try {
        await this._kernelSpecManager.refreshSpecs();
        serverSpecs = this._kernelSpecManager.specs;
      } catch (e) {
        // Silently ignore errors fetching local server specs
      }
    } else {
      const isRemoteConfigured = !!baseUrl;

      if (isRemoteConfigured) {
        const token = serverSettings.token;
        const specsUrl = URLExt.join(baseUrl, 'api/kernelspecs');
        const urlWithToken = token
          ? `${specsUrl}?token=${encodeURIComponent(token)}`
          : specsUrl;
        try {
          const response = await fetch(urlWithToken);
          if (response.ok) {
            const data = await response.json();
            serverSpecs = data as KernelSpec.ISpecModels;
          }
        } catch (e) {
          // Silently ignore errors fetching remote specs
        }
      }
    }

    await this._liteKernelSpecManager.refreshSpecs();
    const newLiteSpecs = this._liteKernelSpecManager.specs;

    if (!serverSpecs && !newLiteSpecs) {
      return;
    }

    const transformedServerSpecs =
      mode === 'remote'
        ? this._transformRemoteSpecResources(serverSpecs)
        : serverSpecs;

    const specs: KernelSpec.ISpecModels = {
      default: serverSpecs?.default ?? newLiteSpecs?.default ?? '',
      kernelspecs: {
        ...transformedServerSpecs?.kernelspecs,
        ...newLiteSpecs?.kernelspecs
      }
    };

    this._specs = specs;
    this._specsChanged.emit(specs);
  }

  /**
   * Transform remote kernel spec resources to use absolute URLs.
   * Also handles the nested 'spec' structure from the Jupyter Server API.
   */
  private _transformRemoteSpecResources(
    specs: KernelSpec.ISpecModels | null
  ): KernelSpec.ISpecModels | null {
    if (!specs || !this._serverSettings) {
      return specs;
    }

    const { baseUrl, token } = this._serverSettings;
    const transformedKernelspecs: {
      [key: string]: KernelSpec.ISpecModel;
    } = {};

    for (const [name, rawSpec] of Object.entries(specs.kernelspecs)) {
      if (!rawSpec) {
        continue;
      }

      // Handle both flat and nested spec structures
      // Jupyter Server API returns: { name, spec: { display_name, ... }, resources }
      // ISpecModel expects: { name, display_name, ..., resources }
      const spec = (rawSpec as any).spec ?? rawSpec;
      const resources = (rawSpec as any).resources ?? spec.resources ?? {};

      const transformedResources: { [key: string]: string } = {};

      // Transform each resource URL to be absolute
      for (const [resourceKey, resourcePath] of Object.entries(resources)) {
        if (typeof resourcePath !== 'string') {
          continue;
        }
        // Make the resource URL absolute using the baseUrl
        let transformedUrl: string;
        if (
          resourcePath.startsWith('http://') ||
          resourcePath.startsWith('https://')
        ) {
          // Already absolute URL
          transformedUrl = resourcePath;
        } else if (resourcePath.startsWith('/')) {
          // Absolute path from server root - use only origin from baseUrl
          const url = new URL(baseUrl);
          transformedUrl = `${url.origin}${resourcePath}`;
        } else {
          // Relative path - join with baseUrl
          transformedUrl = URLExt.join(baseUrl, resourcePath);
        }

        // Append token if configured
        if (token) {
          const separator = transformedUrl.includes('?') ? '&' : '?';
          transformedResources[resourceKey] =
            `${transformedUrl}${separator}token=${encodeURIComponent(token)}`;
        } else {
          transformedResources[resourceKey] = transformedUrl;
        }
      }

      transformedKernelspecs[name] = {
        name: spec.name ?? name,
        display_name: spec.display_name ?? name,
        language: spec.language ?? '',
        argv: spec.argv ?? [],
        env: spec.env ?? {},
        metadata: spec.metadata ?? {},
        resources: transformedResources
      };
    }

    return {
      ...specs,
      kernelspecs: transformedKernelspecs
    };
  }

  private _kernelSpecManager: KernelSpec.IManager;
  private _liteKernelSpecManager: KernelSpec.IManager;
  private _serverSettings?: ServerConnection.ISettings;
  private _isReady = false;
  private _connectionFailure = new Signal<this, Error>(this);
  private _ready: Promise<void>;
  private _specsChanged = new Signal<this, KernelSpec.ISpecModels>(this);
  private _specs: KernelSpec.ISpecModels | null = null;
  private _pollSpecs: Poll;
}

export namespace HybridKernelSpecManager {
  /**
   * The options used to initialize a kernel spec manager.
   */
  export interface IOptions extends BaseManager.IOptions {
    /**
     * The in-browser kernel specs.
     */
    kernelSpecs: IKernelSpecs;

    /**
     * When the manager stops polling the API. Defaults to `when-hidden`.
     */
    standby?: Poll.Standby | (() => boolean | Poll.Standby);
  }
}
