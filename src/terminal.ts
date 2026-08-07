import type { ServerConnection, Terminal } from '@jupyterlab/services';
import { BaseManager, TerminalManager } from '@jupyterlab/services';

import type { ISignal } from '@lumino/signaling';
import { Signal } from '@lumino/signaling';

import type { ILiteTerminalAPIClient } from '@jupyterlite/terminal';

export namespace HybridTerminal {
  /**
   * Options used to start a new terminal.
   */
  export interface IOptions extends Terminal.ITerminal.IOptions {
    lite?: boolean;
  }
}

export namespace HybridTerminalManager {
  /**
   * The options used to initialize a terminal manager.
   */
  export interface IOptions extends BaseManager.IOptions {
    /**
     * The server settings used by the terminal manager.
     */
    serverSettings?: ServerConnection.ISettings;

    /**
     * Lite terminal API client.
     */
    liteTerminalAPIClient: ILiteTerminalAPIClient;
  }
}

/**
 * Hybrid terminal manager that interacts with both the lite and regular terminal managers.
 */
export class HybridTerminalManager
  extends BaseManager
  implements Terminal.IManager
{
  constructor(options: HybridTerminalManager.IOptions) {
    super(options);

    this._terminalManager = new TerminalManager(options);

    const { liteTerminalAPIClient } = options;
    this._liteTerminalManager = new TerminalManager({
      terminalAPIClient: liteTerminalAPIClient,
      serverSettings: liteTerminalAPIClient.serverSettings
    });

    // Forward running changed signals
    this._liteTerminalManager.runningChanged.connect((sender, _) => {
      const running = Array.from(this.running());
      this._runningChanged.emit(running);
    });
    this._terminalManager.runningChanged.connect((sender, _) => {
      const running = Array.from(this.running());
      this._runningChanged.emit(running);
    });
  }

  get connectionFailure(): ISignal<this, Error> {
    return this._connectionFailure;
  }

  connectTo(
    options: Omit<Terminal.ITerminalConnection.IOptions, 'serverSettings'>
  ): Terminal.ITerminalConnection {
    if (this._isLiteTerminal(options.model.name)) {
      return this._liteTerminalManager.connectTo(options);
    }
    return this._terminalManager.connectTo(options);
  }

  isAvailable(): boolean {
    return (
      this._terminalManager.isAvailable() &&
      this._liteTerminalManager.isAvailable()
    );
  }

  get isReady(): boolean {
    return this._terminalManager.isReady && this._liteTerminalManager.isReady;
  }

  get ready(): Promise<void> {
    return Promise.all([
      this._terminalManager.ready,
      this._liteTerminalManager.ready
    ]).then(() => {});
  }

  async refreshRunning(): Promise<void> {
    await Promise.all([
      this._terminalManager.refreshRunning(),
      this._liteTerminalManager.refreshRunning()
    ]);
  }

  running(): IterableIterator<Terminal.IModel> {
    const terminalManager = this._terminalManager;
    const liteTerminalManager = this._liteTerminalManager;
    function* combinedRunning() {
      yield* terminalManager.running();
      yield* liteTerminalManager.running();
    }
    return combinedRunning();
  }

  get runningChanged(): ISignal<this, Terminal.IModel[]> {
    return this._runningChanged;
  }

  async shutdown(name: string): Promise<void> {
    if (this._isLiteTerminal(name)) {
      return this._liteTerminalManager.shutdown(name);
    }
    return this._terminalManager.shutdown(name);
  }

  async shutdownAll(): Promise<void> {
    await Promise.all([
      this._terminalManager.shutdownAll(),
      this._liteTerminalManager.shutdownAll()
    ]);
  }

  async startNew(
    options: HybridTerminal.IOptions = {}
  ): Promise<Terminal.ITerminalConnection> {
    if (!options.name) {
      // If no name specified, choose one so that it is unique across both terminal types.
      options = { ...options, name: this._uniqueName() };
    }

    if (options.lite) {
      return await this._liteTerminalManager.startNew(options);
    } else {
      return await this._terminalManager.startNew(options);
    }
  }

  private _isLiteTerminal(name: string): boolean {
    const runningNames = Array.from(this._liteTerminalManager.running()).map(
      model => model.name
    );
    return runningNames.includes(name);
  }

  private _uniqueName(): string {
    // Find a name that is unique across both lite and regular terminals.
    const runningNames = Array.from(this.running()).map(model => model.name);
    for (let i = 1; ; ++i) {
      const name = `${i}`;
      if (!runningNames.includes(name)) {
        return name;
      }
    }
  }

  private _connectionFailure = new Signal<this, Error>(this);
  private _runningChanged = new Signal<this, Terminal.IModel[]>(this);
  private _terminalManager: Terminal.IManager;
  private _liteTerminalManager: Terminal.IManager;
}
