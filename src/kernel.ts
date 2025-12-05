import type { Kernel } from '@jupyterlab/services';
import {
  BaseManager,
  KernelManager,
  ServerConnection
} from '@jupyterlab/services';

import type { IKernelSpecs, IKernelClient } from '@jupyterlite/services';

import type { ISignal } from '@lumino/signaling';
import { Signal } from '@lumino/signaling';

import { WebSocket } from 'mock-socket';

/**
 * A hybrid kernel manager that combines in-browser (lite) kernels
 * with remote server kernels.
 */
export class HybridKernelManager
  extends BaseManager
  implements Kernel.IManager
{
  /**
   * Construct a new hybrid kernel manager.
   */
  constructor(options: HybridKernelManager.IOptions) {
    super(options);

    const { kernelClient, kernelSpecs, serverSettings } = options;

    this._kernelManager = new KernelManager({
      serverSettings
    });

    this._liteKernelManager = new KernelManager({
      serverSettings: {
        ...ServerConnection.makeSettings(),
        WebSocket
      },
      kernelAPIClient: kernelClient
    });
    this._liteKernelSpecs = kernelSpecs;

    this._liteKernelManager.runningChanged.connect((sender, _) => {
      const running = Array.from(this.running());
      this._runningChanged.emit(running);
    });
    this._kernelManager.runningChanged.connect((sender, _) => {
      const running = Array.from(this.running());
      this._runningChanged.emit(running);
    });
  }

  /**
   * Dispose of the resources used by the manager.
   */
  dispose(): void {
    this._kernelManager.dispose();
    this._liteKernelManager.dispose();
    super.dispose();
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
    return this._liteKernelManager.isReady && this._kernelManager.isReady;
  }

  /**
   * A promise that fulfills when the manager is ready.
   */
  get ready(): Promise<void> {
    return Promise.all([
      this._kernelManager.ready,
      this._liteKernelManager.ready
    ]).then(() => {});
  }

  /**
   * A signal emitted when the running kernels change.
   */
  get runningChanged(): ISignal<this, Kernel.IModel[]> {
    return this._runningChanged;
  }

  /**
   * Connect to a running kernel.
   */
  connectTo(
    options: Kernel.IKernelConnection.IOptions
  ): Kernel.IKernelConnection {
    const model = options.model;
    if (this._isLiteKernel(model)) {
      return this._liteKernelManager.connectTo(options);
    }
    return this._kernelManager.connectTo(options);
  }

  /**
   * Create an iterator over the running kernels.
   */
  running(): IterableIterator<Kernel.IModel> {
    const kernelManager = this._kernelManager;
    const liteKernelManager = this._liteKernelManager;
    function* combinedRunning() {
      yield* kernelManager.running();
      yield* liteKernelManager.running();
    }
    return combinedRunning();
  }

  /**
   * The number of running kernels.
   */
  get runningCount(): number {
    return Array.from(this.running()).length;
  }

  /**
   * Force a refresh of the running kernels.
   */
  async refreshRunning(): Promise<void> {
    await Promise.all([
      this._kernelManager.refreshRunning(),
      this._liteKernelManager.refreshRunning()
    ]);
  }

  /**
   * Start a new kernel.
   */
  async startNew(
    createOptions: Kernel.IKernelOptions = {},
    connectOptions: Omit<
      Kernel.IKernelConnection.IOptions,
      'model' | 'serverSettings'
    > = {}
  ): Promise<Kernel.IKernelConnection> {
    const { name } = createOptions;
    if (name && this._liteKernelSpecs.specs?.kernelspecs[name]) {
      return this._liteKernelManager.startNew(createOptions, connectOptions);
    }
    return this._kernelManager.startNew(createOptions, connectOptions);
  }

  /**
   * Shut down a kernel by id.
   */
  async shutdown(id: string): Promise<void> {
    if (this._isLiteKernel({ id })) {
      return this._liteKernelManager.shutdown(id);
    }
    return this._kernelManager.shutdown(id);
  }

  /**
   * Shut down all kernels.
   */
  async shutdownAll(): Promise<void> {
    await Promise.all([
      this._kernelManager.shutdownAll(),
      this._liteKernelManager.shutdownAll()
    ]);
  }

  /**
   * Find a kernel by id.
   */
  async findById(id: string): Promise<Kernel.IModel | undefined> {
    const kernel = await this._kernelManager.findById(id);
    if (kernel) {
      return kernel;
    }
    return this._liteKernelManager.findById(id);
  }

  /**
   * Check whether the kernel is a lite kernel.
   */
  private _isLiteKernel(model: { id?: string; name?: string }): boolean {
    const { id, name } = model;
    const liteRunning = Array.from(this._liteKernelManager.running());
    const hasSpec = !!this._liteKernelSpecs.specs?.kernelspecs[name ?? ''];
    const running = liteRunning.find(kernel => kernel.id === id);
    return !!running || hasSpec;
  }

  private _kernelManager: Kernel.IManager;
  private _liteKernelManager: Kernel.IManager;
  private _liteKernelSpecs: IKernelSpecs;
  private _runningChanged = new Signal<this, Kernel.IModel[]>(this);
  private _connectionFailure = new Signal<this, Error>(this);
}

export namespace HybridKernelManager {
  /**
   * The options used to initialize a kernel manager.
   */
  export interface IOptions extends BaseManager.IOptions {
    /**
     * The in-browser kernel client.
     */
    kernelClient: IKernelClient;

    /**
     * The lite kernel specs.
     */
    kernelSpecs: IKernelSpecs;
  }
}
