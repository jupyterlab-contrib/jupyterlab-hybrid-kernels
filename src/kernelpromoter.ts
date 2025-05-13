import { ISessionContext } from '@jupyterlab/apputils';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { ServiceManager, Session } from '@jupyterlab/services';
import { IKernelSpecs } from '@jupyterlite/kernel';
import { ISignal, Signal } from '@lumino/signaling';
import { Dialog, showDialog } from '@jupyterlab/apputils';
import { ToolbarButton } from '@jupyterlab/apputils';
import { fileUploadIcon } from '@jupyterlab/ui-components';
import { Widget } from '@lumino/widgets';

/**
 * A class to handle kernel promotion from lite to server
 */
export class KernelPromoter {
  /**
   * Create a new KernelPromoter
   *
   * @param options - The options for creating the kernel promoter
   */
  constructor(options: KernelPromoter.IOptions) {
    this._notebookTracker = options.notebookTracker;
    this._kernelSpecs = options.kernelSpecs;
    this._serviceManager = options.serviceManager;
    this._autoPromote = options.autoPromote ?? true;
    this._errorPatterns = options.errorPatterns ?? [
      'ModuleNotFoundError',
      'MemoryError'
    ];

    // Watch for execution errors to trigger promotion
    if (this._autoPromote) {
      this._setupAutoPromotion();
    }
  }

  /**
   * A signal emitted when a kernel is promoted from lite to server
   */
  get kernelPromoted(): ISignal<this, Session.ISessionConnection> {
    return this._kernelPromoted;
  }

  /**
   * Check if a session is using a lite kernel
   *
   * @param session - The session to check
   * @returns Whether the session is using a lite kernel
   */
  isLiteKernel(session: Session.ISessionConnection | null): boolean {
    if (!session) {
      return false;
    }
    // Check if the kernel name is in the lite kernel specs
    const kernelName = session.kernel?.name;
    if (!kernelName) {
      return false;
    }
    return !!this._kernelSpecs.specs?.kernelspecs[kernelName];
  }

  /**
   * Promote a session's kernel from lite to server
   *
   * @param session - The session to promote
   * @returns A promise that resolves when the kernel is promoted
   */
  async promoteKernel(
    session: Session.ISessionConnection
  ): Promise<Session.ISessionConnection> {
    if (!this.isLiteKernel(session)) {
      return session;
    }

    // Store the current kernel name
    const kernelName = session.kernel?.name ?? '';
    const path = session.path;
    const type = session.type;
    const name = path;

    try {
      // Kill the lite kernel
      await session.shutdown();

      // Start a server kernel with the same name using the service manager
      const newSession = await this._serviceManager.sessions.startNew({
        path,
        type,
        name,
        kernel: {
          name: kernelName
        }
      });

      // Emit the signal
      this._kernelPromoted.emit(newSession);

      // Show a success message
      void showDialog({
        title: 'Kernel Promoted',
        body: `Successfully promoted kernel '${kernelName}' from in-browser to server.`,
        buttons: [Dialog.okButton()]
      });

      return newSession;
    } catch (error) {
      console.error('Failed to promote kernel:', error);

      // Show an error message
      void showDialog({
        title: 'Promotion Failed',
        body: `Failed to promote kernel '${kernelName}': ${error}`,
        buttons: [Dialog.okButton()]
      });

      return session;
    }
  }

  /**
   * Create a toolbar button for promoting a kernel
   *
   * @param sessionContext - The session context to use
   * @returns A toolbar button widget
   */
  createPromoteButton(sessionContext: ISessionContext): Widget {
    const button = new ToolbarButton({
      tooltip: 'Promote to Server Kernel',
      icon: fileUploadIcon,
      onClick: async () => {
        const session = sessionContext.session;
        if (session && this.isLiteKernel(session)) {
          await this.promoteKernel(session);
        } else {
          void showDialog({
            title: 'Cannot Promote Kernel',
            body: 'This is not an in-browser kernel, or no kernel is running.',
            buttons: [Dialog.okButton()]
          });
        }
      }
    });

    // Update button visibility based on current kernel
    const updateButtonVisibility = () => {
      button.node.style.display = this.isLiteKernel(sessionContext.session)
        ? ''
        : 'none';
    };

    // Listen for kernel changes
    sessionContext.kernelChanged.connect(updateButtonVisibility);
    updateButtonVisibility();

    return button;
  }

  /**
   * Set up automatic kernel promotion based on execution errors
   */
  private _setupAutoPromotion(): void {
    this._notebookTracker.widgetAdded.connect((_, panel: NotebookPanel) => {
      // Listen for execution errors
      panel.sessionContext.iopubMessage.connect((_, msg) => {
        if (
          msg.header.msg_type === 'error' &&
          this.isLiteKernel(panel.sessionContext.session)
        ) {
          const content = msg.content as any;
          const traceback = content.traceback?.join('\n') ?? '';
          const shouldPromote = this._errorPatterns.some(pattern =>
            traceback.includes(pattern)
          );

          if (shouldPromote) {
            // Ask the user if they want to promote
            void showDialog({
              title: 'Promote Kernel?',
              body: 'This operation requires features not available in the in-browser kernel. Would you like to switch to a server kernel?',
              buttons: [
                Dialog.cancelButton(),
                Dialog.okButton({ label: 'Promote' })
              ]
            }).then(result => {
              if (result.button.accept) {
                void this.promoteKernel(panel.sessionContext.session!);
              }
            });
          }
        }
      });
    });
  }

  private _notebookTracker: INotebookTracker;
  private _kernelSpecs: IKernelSpecs;
  private _serviceManager: ServiceManager.IManager;
  private _autoPromote: boolean;
  private _errorPatterns: string[];
  private _kernelPromoted = new Signal<this, Session.ISessionConnection>(this);
}

/**
 * The namespace for the KernelPromoter class
 */
export namespace KernelPromoter {
  /**
   * The options used to initialize a kernel promoter
   */
  export interface IOptions {
    /**
     * The notebook tracker
     */
    notebookTracker: INotebookTracker;

    /**
     * The kernel specs
     */
    kernelSpecs: IKernelSpecs;

    /**
     * The service manager
     */
    serviceManager: ServiceManager.IManager;

    /**
     * Whether to automatically prompt for promotion
     */
    autoPromote?: boolean;

    /**
     * Error patterns that should trigger promotion
     */
    errorPatterns?: string[];
  }
}
