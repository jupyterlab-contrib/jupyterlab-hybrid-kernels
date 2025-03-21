import {
  BaseManager,
  Kernel,
  KernelManager,
  ServerConnection
} from '@jupyterlab/services';

import {
  LiteKernelManager,
  IKernelSpecs,
  IKernelClient
} from '@jupyterlite/kernel';

import { ISignal, Signal } from '@lumino/signaling';

import { WebSocket } from 'mock-socket';

export class HybridKernelManager
  extends BaseManager
  implements Kernel.IManager
{
  constructor(options: HybridKernelManager.IOptions) {
    super(options);

    const { kernelClient, kernelSpecs, serverSettings } = options;

    this._kernelManager = new KernelManager({
      serverSettings
    });

    // TODO: replace with KernelManager + LiteKernelClient later
    this._liteKernelManager = new LiteKernelManager({
      serverSettings: {
        ...ServerConnection.makeSettings(),
        ...serverSettings,
        WebSocket
      },
      kernelClient,
      kernelSpecs
    });
    this._liteKernelSpecs = kernelSpecs;

    // forward running changed signals
    this._liteKernelManager.runningChanged.connect((sender, _) => {
      const running = Array.from(this.running());
      this._runningChanged.emit(running);
    });
    this._kernelManager.runningChanged.connect((sender, _) => {
      const running = Array.from(this.running());
      this._runningChanged.emit(running);
    });
  }

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

  get runningChanged(): ISignal<this, Kernel.IModel[]> {
    return this._runningChanged;
  }

  connectTo(
    options: Kernel.IKernelConnection.IOptions
  ): Kernel.IKernelConnection {
    const model = options.model;
    if (this._isLiteKernel(model)) {
      return this._liteKernelManager.connectTo(options);
    }
    return this._kernelManager.connectTo(options);
  }

  running(): IterableIterator<Kernel.IModel> {
    const kernelManager = this._kernelManager;
    const liteKernelManager = this._liteKernelManager;
    function* combinedRunning() {
      yield* kernelManager.running();
      yield* liteKernelManager.running();
    }
    return combinedRunning();
  }

  get runningCount(): number {
    return Array.from(this.running()).length;
  }

  async refreshRunning(): Promise<void> {
    await Promise.all([
      this._kernelManager.refreshRunning(),
      this._liteKernelManager.refreshRunning()
    ]);
  }

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

  async shutdown(id: string): Promise<void> {
    if (this._isLiteKernel({ id })) {
      return this._liteKernelManager.shutdown(id);
    }
    return this._kernelManager.shutdown(id);
  }

  async shutdownAll(): Promise<void> {
    await Promise.all([
      this._kernelManager.shutdownAll(),
      this._liteKernelManager.shutdownAll()
    ]);
  }

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
  private _liteKernelManager: LiteKernelManager;
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
     * The server settings used by the kernel manager.
     */
    serverSettings?: ServerConnection.ISettings;

    /**
     * The in-browser kernel client.
     */
    kernelClient: IKernelClient;

    /**
     * The lite kernel specs
     */
    kernelSpecs: IKernelSpecs;
  }
}
