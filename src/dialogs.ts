import type { Dialog } from '@jupyterlab/apputils';
import type { TranslationBundle } from '@jupyterlab/translation';
import { Widget } from '@lumino/widgets';

/**
 * Interface for the remote server configuration form values.
 */
export interface IRemoteServerFormValue {
  baseUrl: string;
  token: string;
}

/**
 * Parse a full JupyterHub/Binder URL to extract the base URL and token.
 * Handles URLs like:
 * https://hub.2i2c.mybinder.org/user/jupyterlab-jupyterlab-demo-7r632cge/lab/tree/demo?token=AMJL4AzxSeOAnv0F7gHsKQ
 *
 * @param fullUrl The full URL that may contain /lab/, /tree/, or /notebooks/ paths and a token query param
 * @returns An object with baseUrl and token, or null if parsing fails
 */
function parseJupyterUrl(
  fullUrl: string
): { baseUrl: string; token: string } | null {
  try {
    const url = new URL(fullUrl);

    // Extract the token from query parameters
    const token = url.searchParams.get('token') ?? '';

    // Find the base URL by removing common Jupyter paths
    // Common patterns: /lab, /tree, /notebooks, /edit, /terminals, /consoles
    const pathname = url.pathname;
    const jupyterPathPattern =
      /\/(lab|tree|notebooks|edit|terminals|consoles|doc)(\/|$)/;
    const match = pathname.match(jupyterPathPattern);

    let basePath: string;
    if (match) {
      // Cut off everything from the Jupyter path onwards
      basePath = pathname.substring(0, match.index);
    } else {
      // No recognized Jupyter path, use the full pathname
      basePath = pathname;
    }

    // Ensure basePath ends without trailing slash for consistency
    basePath = basePath.replace(/\/$/, '');

    const baseUrl = `${url.protocol}//${url.host}${basePath}`;

    return { baseUrl, token };
  } catch {
    return null;
  }
}

/**
 * Widget body for the remote server configuration dialog.
 * Follows the JupyterLab pattern from InputDialogBase.
 */
export class RemoteServerConfigBody
  extends Widget
  implements Dialog.IBodyWidget<IRemoteServerFormValue>
{
  constructor(options: RemoteServerConfigBody.IOptions) {
    super();
    this.addClass('jp-HybridKernels-configDialog');

    const trans = options.trans;

    // Full URL input section
    const fullUrlSection = document.createElement('div');
    fullUrlSection.className = 'jp-HybridKernels-formSection';

    const fullUrlLabel = document.createElement('label');
    fullUrlLabel.className = 'jp-HybridKernels-label';
    fullUrlLabel.textContent = trans.__('Paste Full URL (with token)');
    fullUrlLabel.htmlFor = 'hybrid-kernels-full-url';
    fullUrlSection.appendChild(fullUrlLabel);

    this._fullUrlInput = document.createElement('input');
    this._fullUrlInput.type = 'text';
    this._fullUrlInput.id = 'hybrid-kernels-full-url';
    this._fullUrlInput.className = 'jp-mod-styled jp-HybridKernels-input';
    this._fullUrlInput.placeholder =
      'https://hub.example.org/user/name/lab?token=...';
    fullUrlSection.appendChild(this._fullUrlInput);

    const fullUrlHelp = document.createElement('small');
    fullUrlHelp.className = 'jp-HybridKernels-help';
    fullUrlHelp.textContent = trans.__(
      'Paste a full JupyterHub/Binder URL to auto-fill the fields below'
    );
    fullUrlSection.appendChild(fullUrlHelp);

    this.node.appendChild(fullUrlSection);

    // Separator
    const separator = document.createElement('hr');
    separator.className = 'jp-HybridKernels-separator';
    this.node.appendChild(separator);

    // Server URL input section
    const serverUrlSection = document.createElement('div');
    serverUrlSection.className = 'jp-HybridKernels-formSection';

    const serverUrlLabel = document.createElement('label');
    serverUrlLabel.className = 'jp-HybridKernels-label';
    serverUrlLabel.textContent = trans.__('Server URL');
    serverUrlLabel.htmlFor = 'hybrid-kernels-server-url';
    serverUrlSection.appendChild(serverUrlLabel);

    this._serverUrlInput = document.createElement('input');
    this._serverUrlInput.type = 'text';
    this._serverUrlInput.id = 'hybrid-kernels-server-url';
    this._serverUrlInput.className = 'jp-mod-styled jp-HybridKernels-input';
    this._serverUrlInput.placeholder = 'https://example.com/jupyter';
    this._serverUrlInput.value = options.baseUrl;
    serverUrlSection.appendChild(this._serverUrlInput);

    this.node.appendChild(serverUrlSection);

    // Token input section
    const tokenSection = document.createElement('div');
    tokenSection.className = 'jp-HybridKernels-formSection';

    const tokenLabel = document.createElement('label');
    tokenLabel.className = 'jp-HybridKernels-label';
    tokenLabel.textContent = trans.__('Authentication Token');
    tokenLabel.htmlFor = 'hybrid-kernels-token';
    tokenSection.appendChild(tokenLabel);

    this._tokenInput = document.createElement('input');
    this._tokenInput.type = 'password';
    this._tokenInput.id = 'hybrid-kernels-token';
    this._tokenInput.className = 'jp-mod-styled jp-HybridKernels-input';
    this._tokenInput.placeholder = trans.__('Enter token (optional)');
    this._tokenInput.value = options.token;
    tokenSection.appendChild(this._tokenInput);

    this.node.appendChild(tokenSection);

    // Set up event handlers for auto-fill from full URL
    this._fullUrlInput.addEventListener('input', this._handleFullUrlChange);
    this._fullUrlInput.addEventListener('paste', () => {
      setTimeout(this._handleFullUrlChange, 0);
    });
  }

  /**
   * Get the form values.
   */
  getValue(): IRemoteServerFormValue {
    return {
      baseUrl: this._serverUrlInput.value,
      token: this._tokenInput.value
    };
  }

  /**
   * Handle changes to the full URL input.
   */
  private _handleFullUrlChange = (): void => {
    const fullUrl = this._fullUrlInput.value.trim();
    if (fullUrl) {
      const parsed = parseJupyterUrl(fullUrl);
      if (parsed) {
        this._serverUrlInput.value = parsed.baseUrl;
        this._tokenInput.value = parsed.token;
      }
    }
  };

  private _fullUrlInput: HTMLInputElement;
  private _serverUrlInput: HTMLInputElement;
  private _tokenInput: HTMLInputElement;
}

/**
 * A namespace for RemoteServerConfigBody statics.
 */
export namespace RemoteServerConfigBody {
  /**
   * The options used to create a RemoteServerConfigBody.
   */
  export interface IOptions {
    /**
     * The initial base URL value.
     */
    baseUrl: string;

    /**
     * The initial token value.
     */
    token: string;

    /**
     * The translation bundle.
     */
    trans: TranslationBundle;
  }
}
