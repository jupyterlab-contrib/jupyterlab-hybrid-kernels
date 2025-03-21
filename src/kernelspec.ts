import {
  BaseManager,
  KernelSpec,
  KernelSpecManager,
  ServerConnection
} from '@jupyterlab/services';

import { IKernelSpecs, LiteKernelSpecs } from '@jupyterlite/kernel';
import { ISignal, Signal } from '@lumino/signaling';

export class HybridKernelSpecManager
  extends BaseManager
  implements KernelSpec.IManager
{
  constructor(options: HybridKernelSpecManager.IOptions) {
    super(options);
    this._kernelSpecManager = new KernelSpecManager({
      serverSettings: options.serverSettings
    });
    this._liteKernelSpecManager = new LiteKernelSpecs({
      kernelSpecs: options.kernelSpecs,
      serverSettings: options.serverSettings
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
    await this._kernelSpecManager.refreshSpecs();
    await this._liteKernelSpecManager.refreshSpecs();
    const newSpecs = this._kernelSpecManager.specs;
    const newLiteSpecs = this._liteKernelSpecManager.specs;
    if (!newSpecs && !newLiteSpecs) {
      return;
    }
    const specs: KernelSpec.ISpecModels = {
      default: newSpecs?.default ?? newLiteSpecs?.default ?? '',
      kernelspecs: {
        ...newSpecs?.kernelspecs,
        ...newLiteSpecs?.kernelspecs
      }
    };
    this._specs = specs;
    this._specsChanged.emit(specs);
  }

  private _kernelSpecManager: KernelSpec.IManager;
  private _liteKernelSpecManager: LiteKernelSpecs;
  private _isReady = false;
  private _connectionFailure = new Signal<this, Error>(this);
  private _ready: Promise<void> = Promise.resolve(void 0);
  private _specsChanged = new Signal<this, KernelSpec.ISpecModels>(this);
  private _specs: KernelSpec.ISpecModels | null = null;
}

export namespace HybridKernelSpecManager {
  /**
   * The options used to initialize a kernel spec manager.
   */
  export interface IOptions {
    /**
     * The in-browser kernel specs.
     */
    kernelSpecs: IKernelSpecs;

    /**
     * The server settings.
     */
    serverSettings?: ServerConnection.ISettings;
  }
}
