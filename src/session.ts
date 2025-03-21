import { BaseManager, Session, SessionManager } from '@jupyterlab/services';
import {
  IKernelClient,
  IKernelSpecs,
  LiteKernelClient
} from '@jupyterlite/kernel';
import { LiteSessionClient } from '@jupyterlite/session';
import { ISignal, Signal } from '@lumino/signaling';

export class HybridSessionManager
  extends BaseManager
  implements Session.IManager
{
  constructor(options: HybridSessionManager.IOptions) {
    super(options);

    const { kernelClient, kernelManager, kernelSpecs, serverSettings } =
      options;

    this._liteKernelSpecs = kernelSpecs;

    this._sessionManager = new SessionManager({
      kernelManager,
      serverSettings
    });

    const sessionClient = new LiteSessionClient({
      serverSettings,
      kernelClient: kernelClient as LiteKernelClient
    });
    this._liteSessionManager = new SessionManager({
      kernelManager,
      serverSettings,
      sessionAPIClient: sessionClient
    });

    // forward running changed signals
    this._liteSessionManager.runningChanged.connect((sender, _) => {
      const running = Array.from(this.running());
      this._runningChanged.emit(running);
    });
    this._sessionManager.runningChanged.connect((sender, _) => {
      const running = Array.from(this.running());
      this._runningChanged.emit(running);
    });
  }

  dispose(): void {
    this._sessionManager.dispose();
    this._liteSessionManager.dispose();
    super.dispose();
  }

  get isReady(): boolean {
    return this._liteSessionManager.isReady && this._sessionManager.isReady;
  }

  get ready(): Promise<void> {
    return Promise.all([
      this._sessionManager.ready,
      this._liteSessionManager.ready
    ]).then(() => {});
  }

  /**
   * A signal emitted when the running sessions change.
   */
  get runningChanged(): ISignal<this, Session.IModel[]> {
    return this._runningChanged;
  }

  /**
   * A signal emitted when there is a connection failure.
   */
  get connectionFailure(): ISignal<this, Error> {
    return this._connectionFailure;
  }

  connectTo(
    options: Omit<
      Session.ISessionConnection.IOptions,
      'connectToKernel' | 'serverSettings'
    >
  ): Session.ISessionConnection {
    const model = options.model;
    if (this._isLiteSession(model)) {
      return this._liteSessionManager.connectTo(options);
    }
    return this._sessionManager.connectTo(options);
  }

  running(): IterableIterator<Session.IModel> {
    const sessionManager = this._sessionManager;
    const liteSessionManager = this._liteSessionManager;
    function* combinedRunning() {
      yield* sessionManager.running();
      yield* liteSessionManager.running();
    }
    return combinedRunning();
  }

  async refreshRunning(): Promise<void> {
    await Promise.all([
      this._sessionManager.refreshRunning(),
      this._liteSessionManager.refreshRunning()
    ]);
  }

  async startNew(
    createOptions: Session.ISessionOptions,
    connectOptions: Omit<
      Session.ISessionConnection.IOptions,
      'model' | 'connectToKernel' | 'serverSettings'
    > = {}
  ): Promise<Session.ISessionConnection> {
    const name = createOptions.kernel?.name;
    if (name && this._liteKernelSpecs.specs?.kernelspecs[name]) {
      return this._liteSessionManager.startNew(createOptions, connectOptions);
    }
    return this._sessionManager.startNew(createOptions, connectOptions);
  }

  async shutdown(id: string): Promise<void> {
    if (this._isLiteSession({ id })) {
      return this._liteSessionManager.shutdown(id);
    }
    return this._sessionManager.shutdown(id);
  }

  async shutdownAll(): Promise<void> {
    await Promise.all([
      this._sessionManager.shutdownAll(),
      this._liteSessionManager.shutdownAll()
    ]);
  }

  async stopIfNeeded(path: string): Promise<void> {
    // TODO
  }

  async findById(id: string): Promise<Session.IModel | undefined> {
    const session = await this._sessionManager.findById(id);
    if (session) {
      return session;
    }
    return this._liteSessionManager.findById(id);
  }

  async findByPath(path: string): Promise<Session.IModel | undefined> {
    const session = await this._sessionManager.findByPath(path);
    if (session) {
      return session;
    }
    return this._liteSessionManager.findByPath(path);
  }

  private _isLiteSession(model: Pick<Session.IModel, 'id'>): boolean {
    const running = Array.from(this._liteSessionManager.running()).find(
      session => session.id === model.id
    );
    return !!running;
  }

  private _sessionManager: SessionManager;
  private _liteSessionManager: SessionManager;
  private _liteKernelSpecs: IKernelSpecs;
  private _runningChanged = new Signal<this, Session.IModel[]>(this);
  private _connectionFailure = new Signal<this, Error>(this);
}

export namespace HybridSessionManager {
  export interface IOptions extends SessionManager.IOptions {
    /**
     * The kernel client for in-browser sessions.
     */
    kernelClient: IKernelClient;

    /**
     * The in-browser kernel specs.
     */
    kernelSpecs: IKernelSpecs;
  }
}
