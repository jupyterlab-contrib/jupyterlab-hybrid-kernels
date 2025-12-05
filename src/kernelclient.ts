import type {
  Kernel,
  KernelMessage,
  ServerConnection
} from '@jupyterlab/services';
import { KernelAPI } from '@jupyterlab/services';
import type {
  IKernel,
  IKernelClient,
  IKernelSpecs,
  LiteKernelClient
} from '@jupyterlite/services';
import type { IObservableMap } from '@jupyterlab/observables';
import type { ISignal } from '@lumino/signaling';
import { Signal } from '@lumino/signaling';

/**
 * A hybrid kernel client that routes kernel operations to either
 * lite or remote kernel clients based on the kernel name.
 */
export class HybridKernelClient implements IKernelClient {
  constructor(options: HybridKernelClient.IOptions) {
    this._liteKernelClient = options.liteKernelClient;
    this._liteKernelSpecs = options.kernelSpecs;
    this._serverSettings = options.serverSettings;

    this._liteKernelClient.changed.connect((_, args) => {
      if (args.type === 'add' && args.newValue) {
        this._liteKernelIds.add(args.newValue.id);
      } else if (args.type === 'remove' && args.oldValue) {
        this._liteKernelIds.delete(args.oldValue.id);
      }
      this._changed.emit(args);
    });
  }

  /**
   * The server settings.
   */
  get serverSettings(): ServerConnection.ISettings {
    return this._serverSettings;
  }

  /**
   * Signal emitted when the kernels map changes
   */
  get changed(): ISignal<IKernelClient, IObservableMap.IChangedArgs<IKernel>> {
    return this._changed;
  }

  /**
   * Start a new kernel.
   *
   * Routes to lite or remote kernel client based on the kernel name.
   */
  async startNew(
    options: LiteKernelClient.IKernelOptions = {}
  ): Promise<Kernel.IModel> {
    const { name } = options;
    if (name && this._liteKernelSpecs.specs?.kernelspecs[name]) {
      return this._liteKernelClient.startNew(options);
    }
    return KernelAPI.startNew({ name: name ?? '' }, this._serverSettings);
  }

  /**
   * Restart a kernel.
   */
  async restart(kernelId: string): Promise<void> {
    if (this._isLiteKernel(kernelId)) {
      return this._liteKernelClient.restart(kernelId);
    }
    await KernelAPI.restartKernel(kernelId, this._serverSettings);
  }

  /**
   * Interrupt a kernel.
   */
  async interrupt(kernelId: string): Promise<void> {
    if (this._isLiteKernel(kernelId)) {
      return this._liteKernelClient.interrupt(kernelId);
    }
    await KernelAPI.interruptKernel(kernelId, this._serverSettings);
  }

  /**
   * List running kernels.
   */
  async listRunning(): Promise<Kernel.IModel[]> {
    const liteKernels = await this._liteKernelClient.listRunning();
    try {
      const remoteKernels = await KernelAPI.listRunning(this._serverSettings);
      return [...liteKernels, ...remoteKernels];
    } catch {
      // Remote server might not be available
      return liteKernels;
    }
  }

  /**
   * Shut down a kernel.
   */
  async shutdown(id: string): Promise<void> {
    if (this._isLiteKernel(id)) {
      return this._liteKernelClient.shutdown(id);
    }
    await KernelAPI.shutdownKernel(id, this._serverSettings);
  }

  /**
   * Shut down all kernels.
   */
  async shutdownAll(): Promise<void> {
    await this._liteKernelClient.shutdownAll();
    try {
      const remoteKernels = await KernelAPI.listRunning(this._serverSettings);
      await Promise.all(
        remoteKernels.map(k =>
          KernelAPI.shutdownKernel(k.id, this._serverSettings)
        )
      );
    } catch {
      // Remote server might not be available
    }
  }

  /**
   * Get a kernel model by id.
   */
  async getModel(id: string): Promise<IKernel | undefined> {
    const liteKernel = await this._liteKernelClient.getModel(id);
    if (liteKernel) {
      return liteKernel;
    }
    return undefined;
  }

  /**
   * Handle stdin request received from Service Worker.
   */
  async handleStdin(
    inputRequest: KernelMessage.IInputRequestMsg
  ): Promise<KernelMessage.IInputReplyMsg> {
    return this._liteKernelClient.handleStdin(inputRequest);
  }

  /**
   * Check if a kernel ID corresponds to a lite kernel.
   */
  private _isLiteKernel(id: string): boolean {
    return this._liteKernelIds.has(id);
  }

  /**
   * Track lite kernel IDs for quick lookup.
   */
  private _liteKernelIds = new Set<string>();

  private _liteKernelClient: LiteKernelClient;
  private _liteKernelSpecs: IKernelSpecs;
  private _serverSettings: ServerConnection.ISettings;
  private _changed = new Signal<this, IObservableMap.IChangedArgs<IKernel>>(
    this
  );
}

export namespace HybridKernelClient {
  export interface IOptions {
    /**
     * The lite kernel client for in-browser kernels.
     */
    liteKernelClient: LiteKernelClient;

    /**
     * The in-browser kernel specs.
     */
    kernelSpecs: IKernelSpecs;

    /**
     * The server settings for remote kernels.
     */
    serverSettings: ServerConnection.ISettings;
  }
}
