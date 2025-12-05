import type { Session } from '@jupyterlab/services';
import {
  BaseManager,
  ServerConnection,
  SessionManager
} from '@jupyterlab/services';
import type {
  IKernelClient,
  IKernelSpecs,
  LiteKernelClient
} from '@jupyterlite/services';
import { LiteSessionClient } from '@jupyterlite/services';
import type { ISignal } from '@lumino/signaling';
import { Signal } from '@lumino/signaling';

import { HybridKernelClient } from './kernelclient';

/**
 * A hybrid session manager that combines in-browser (lite) sessions
 * with remote server sessions.
 */
export class HybridSessionManager
  extends BaseManager
  implements Session.IManager
{
  /**
   * Construct a new hybrid session manager.
   */
  constructor(options: HybridSessionManager.IOptions) {
    super(options);

    const { kernelClient, kernelManager, kernelSpecs, serverSettings } =
      options;

    this._liteKernelSpecs = kernelSpecs;

    this._sessionManager = new SessionManager({
      kernelManager,
      serverSettings
    });

    const hybridKernelClient = new HybridKernelClient({
      liteKernelClient: kernelClient as LiteKernelClient,
      kernelSpecs,
      serverSettings: serverSettings ?? ServerConnection.makeSettings()
    });

    const sessionClient = new LiteSessionClient({
      serverSettings,
      kernelClient: hybridKernelClient as unknown as LiteKernelClient
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

  /**
   * Dispose of the resources used by the manager.
   */
  dispose(): void {
    this._sessionManager.dispose();
    this._liteSessionManager.dispose();
    super.dispose();
  }

  /**
   * Test whether the manager is ready.
   */
  get isReady(): boolean {
    return this._liteSessionManager.isReady && this._sessionManager.isReady;
  }

  /**
   * A promise that fulfills when the manager is ready.
   */
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

  /**
   * Connect to a running session.
   */
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

  /**
   * Create an iterator over the running sessions.
   */
  running(): IterableIterator<Session.IModel> {
    const sessionManager = this._sessionManager;
    const liteSessionManager = this._liteSessionManager;
    function* combinedRunning() {
      yield* sessionManager.running();
      yield* liteSessionManager.running();
    }
    return combinedRunning();
  }

  /**
   * Force a refresh of the running sessions.
   */
  async refreshRunning(): Promise<void> {
    await Promise.all([
      this._sessionManager.refreshRunning(),
      this._liteSessionManager.refreshRunning()
    ]);
  }

  /**
   * Start a new session.
   */
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

  /**
   * Shut down a session by id.
   */
  async shutdown(id: string): Promise<void> {
    if (this._isLiteSession({ id })) {
      return this._liteSessionManager.shutdown(id);
    }
    return this._sessionManager.shutdown(id);
  }

  /**
   * Shut down all sessions.
   */
  async shutdownAll(): Promise<void> {
    await Promise.all([
      this._sessionManager.shutdownAll(),
      this._liteSessionManager.shutdownAll()
    ]);
  }

  /**
   * Stop a session by path if it exists.
   */
  async stopIfNeeded(path: string): Promise<void> {
    const session = await this.findByPath(path);
    if (session) {
      await this.shutdown(session.id);
    }
  }

  /**
   * Find a session by id.
   */
  async findById(id: string): Promise<Session.IModel | undefined> {
    const session = await this._sessionManager.findById(id);
    if (session) {
      return session;
    }
    return this._liteSessionManager.findById(id);
  }

  /**
   * Find a session by path.
   */
  async findByPath(path: string): Promise<Session.IModel | undefined> {
    const session = await this._sessionManager.findByPath(path);
    if (session) {
      return session;
    }
    return this._liteSessionManager.findByPath(path);
  }

  /**
   * Check if a session is a lite session.
   */
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
