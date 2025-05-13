import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { ServiceManager, Session } from '@jupyterlab/services';
import { IKernelSpecs } from '@jupyterlite/kernel';
import { ISignal, Signal } from '@lumino/signaling';
import {
  Dialog,
  ISessionContext,
  showDialog,
  ToolbarButton
} from '@jupyterlab/apputils';
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
  get kernelPromoted(): ISignal<this, void> {
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
   * @param sessionContext - The optional session context to update with the new kernel
   * @returns A promise that resolves when the kernel is promoted
   */
  async promoteKernel(sessionContext: ISessionContext): Promise<boolean> {
    const { session } = sessionContext;
    if (!session || !this.isLiteKernel(session)) {
      return false;
    }

    // Store the current kernel name and session information
    const kernelName = session.kernel?.name ?? '';
    const oldSessionId = session.id;

    try {
      // First shutdown the lite kernel
      await session.shutdown();

      sessionContext.changeKernel({
        name: 'python3'
      });

      // Emit the signal
      this._kernelPromoted.emit();

      // Terminate/cleanup the old lite session
      try {
        // Make sure the old session is fully terminated
        await this._serviceManager.sessions.shutdown(oldSessionId);
      } catch (terminationError) {
        // Ignore any errors during termination, as the session might already be gone
        console.debug(
          'Could not terminate old lite kernel session:',
          terminationError
        );
      }

      // Force a refresh of the running sessions to clean up the UI
      await this._serviceManager.sessions.refreshRunning();

      // Show a success message
      void showDialog({
        title: 'Kernel Promoted',
        body: `Successfully promoted kernel '${kernelName}' from in-browser to server.`,
        buttons: [Dialog.okButton()]
      });

      return true;
    } catch (error) {
      console.error('Failed to promote kernel:', error);

      // Show an error message
      void showDialog({
        title: 'Promotion Failed',
        body: `Failed to promote kernel '${kernelName}': ${error}`,
        buttons: [Dialog.okButton()]
      });

      return false;
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
          await this.promoteKernel(sessionContext);
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
                void this.promoteKernel(panel.sessionContext);
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
  private _kernelPromoted = new Signal<this, void>(this);
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
