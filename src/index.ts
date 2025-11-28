import type {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import type {
  Kernel,
  KernelSpec,
  ServiceManagerPlugin,
  Session
} from '@jupyterlab/services';
import {
  IKernelManager,
  IKernelSpecManager,
  ISessionManager
} from '@jupyterlab/services';

import {
  Dialog,
  showDialog,
  ICommandPalette,
  IToolbarWidgetRegistry
} from '@jupyterlab/apputils';

import { URLExt } from '@jupyterlab/coreutils';

import { linkIcon } from '@jupyterlab/ui-components';

import { Widget } from '@lumino/widgets';

import {
  IKernelClient,
  IKernelSpecs,
  KernelSpecs,
  LiteKernelClient
} from '@jupyterlite/services';

import { HybridKernelManager } from './kernel';

import { RemoteServerConfigBody } from './dialogs';

import { HybridKernelSpecManager } from './kernelspec';

import { HybridSessionManager } from './session';

import { IRemoteServerConfig } from './tokens';

import {
  RemoteServerConfig,
  createServerSettings,
  getHybridKernelsMode
} from './config';

/**
 * Command ID for configuring the remote server
 */
const CommandIds = {
  configureRemoteServer: 'hybrid-kernels:configure-remote-server'
};

/**
 * Remote server configuration provider plugin.
 * Provides configuration that reads from/writes to PageConfig.
 */
const configPlugin: ServiceManagerPlugin<IRemoteServerConfig> = {
  id: 'jupyterlab-hybrid-kernels:config',
  description: 'Remote server configuration provider',
  autoStart: true,
  provides: IRemoteServerConfig,
  activate: (_: null): IRemoteServerConfig => {
    return new RemoteServerConfig();
  }
};

/**
 * A custom toolbar widget that shows the remote server connection status.
 */
class RemoteServerStatusWidget extends Widget {
  constructor(options: RemoteServerStatusWidget.IOptions) {
    super();
    this._app = options.app;
    this._remoteConfig = options.remoteConfig;
    this._commandId = options.commandId;
    this.addClass('jp-HybridKernels-status');
    this._updateStatus();

    this._remoteConfig.changed.connect(this._updateStatus, this);

    this.node.style.cursor = 'pointer';
    this.node.addEventListener('click', () => {
      void this._app.commands.execute(this._commandId);
    });
  }

  /**
   * Dispose of the resources held by the widget.
   */
  dispose(): void {
    this._remoteConfig.changed.disconnect(this._updateStatus, this);
    super.dispose();
  }

  /**
   * Update the status display.
   */
  private _updateStatus(): void {
    this.removeClass('jp-HybridKernels-connected');
    this.removeClass('jp-HybridKernels-disconnected');

    if (this._remoteConfig.isConnected) {
      this.addClass('jp-HybridKernels-connected');
    } else {
      this.addClass('jp-HybridKernels-disconnected');
    }

    this.node.innerHTML = '';
    linkIcon.element({ container: this.node });
  }

  private _app: JupyterFrontEnd;
  private _remoteConfig: IRemoteServerConfig;
  private _commandId: string;
}

/**
 * A namespace for RemoteServerStatusWidget statics.
 */
namespace RemoteServerStatusWidget {
  /**
   * Options for creating a RemoteServerStatusWidget.
   */
  export interface IOptions {
    /**
     * The application instance.
     */
    app: JupyterFrontEnd;

    /**
     * The remote server configuration.
     */
    remoteConfig: IRemoteServerConfig;

    /**
     * The command ID to execute when clicked.
     */
    commandId: string;
  }
}

/**
 * Plugin that adds a command to configure the remote server via a dialog.
 */
const configDialogPlugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab-hybrid-kernels:config-dialog',
  description: 'Provides a dialog to configure the remote server',
  autoStart: true,
  requires: [IRemoteServerConfig, IKernelSpecManager, IToolbarWidgetRegistry],
  optional: [ICommandPalette],
  activate: (
    app: JupyterFrontEnd,
    remoteConfig: IRemoteServerConfig,
    kernelSpecManager: KernelSpec.IManager,
    toolbarRegistry: IToolbarWidgetRegistry,
    palette: ICommandPalette | null
  ): void => {
    const isRemoteMode = getHybridKernelsMode() === 'remote';

    if (isRemoteMode) {
      toolbarRegistry.addFactory('TopBar', 'remote-server-status', () => {
        return new RemoteServerStatusWidget({
          app,
          remoteConfig,
          commandId: CommandIds.configureRemoteServer
        });
      });
    }

    app.commands.addCommand(CommandIds.configureRemoteServer, {
      label: 'Configure Remote Jupyter Server',
      caption: 'Configure the remote Jupyter server connection',
      icon: linkIcon,
      isVisible: () => isRemoteMode,
      execute: async () => {
        const body = new RemoteServerConfigBody({
          baseUrl: remoteConfig.baseUrl,
          token: remoteConfig.token
        });

        const result = await showDialog({
          title: 'Remote Server Configuration',
          body,
          buttons: [Dialog.cancelButton(), Dialog.okButton({ label: 'Save' })],
          focusNodeSelector: 'input'
        });

        if (!result.button.accept || !result.value) {
          return;
        }

        const { baseUrl, token } = result.value;

        remoteConfig.update({ baseUrl, token });

        if (baseUrl) {
          try {
            const testUrl = URLExt.join(baseUrl, 'api/kernelspecs');
            const urlWithToken = token
              ? `${testUrl}?token=${encodeURIComponent(token)}`
              : testUrl;
            const response = await fetch(urlWithToken);
            remoteConfig.setConnected(response.ok);
          } catch {
            remoteConfig.setConnected(false);
          }
        } else {
          remoteConfig.setConnected(false);
        }

        await kernelSpecManager.refreshSpecs();
      }
    });

    if (palette) {
      palette.addItem({
        command: CommandIds.configureRemoteServer,
        category: 'Kernel'
      });
    }
  }
};

/**
 * The client for managing in-browser kernels
 */
const kernelClientPlugin: ServiceManagerPlugin<Kernel.IKernelAPIClient> = {
  id: 'jupyterlab-hybrid-kernels:kernel-client',
  description: 'The client for managing in-browser kernels',
  autoStart: true,
  requires: [IKernelSpecs],
  provides: IKernelClient,
  activate: (_: null, kernelSpecs: IKernelSpecs): IKernelClient => {
    const serverSettings = createServerSettings();
    return new LiteKernelClient({ kernelSpecs, serverSettings });
  }
};

/**
 * The kernel manager plugin.
 */
const kernelManagerPlugin: ServiceManagerPlugin<Kernel.IManager> = {
  id: 'jupyterlab-hybrid-kernels:kernel-manager',
  description: 'The kernel manager plugin.',
  autoStart: true,
  provides: IKernelManager,
  requires: [IKernelClient, IKernelSpecs],
  activate: (
    _: null,
    kernelClient: IKernelClient,
    kernelSpecs: IKernelSpecs
  ): Kernel.IManager => {
    const serverSettings = createServerSettings();
    return new HybridKernelManager({
      kernelClient,
      kernelSpecs,
      serverSettings
    });
  }
};

/**
 * The kernel spec manager plugin.
 */
const kernelSpecManagerPlugin: ServiceManagerPlugin<KernelSpec.IManager> = {
  id: 'jupyterlab-hybrid-kernels:kernel-spec-manager',
  description: 'The kernel spec manager plugin.',
  autoStart: true,
  provides: IKernelSpecManager,
  requires: [IKernelSpecs],
  activate: (_: null, kernelSpecs: IKernelSpecs): KernelSpec.IManager => {
    const serverSettings = createServerSettings();
    const manager = new HybridKernelSpecManager({
      kernelSpecs,
      serverSettings
    });
    void manager.refreshSpecs();
    return manager;
  }
};

/**
 * The in-browser kernel spec manager plugin.
 */
const liteKernelSpecManagerPlugin: ServiceManagerPlugin<IKernelSpecs> = {
  id: 'jupyterlab-hybrid-kernels:kernel-specs',
  description: 'The in-browser kernel spec manager plugin.',
  autoStart: true,
  provides: IKernelSpecs,
  activate: (_: null): IKernelSpecs => {
    return new KernelSpecs();
  }
};

/**
 * The session manager plugin.
 */
const sessionManagerPlugin: ServiceManagerPlugin<Session.IManager> = {
  id: 'jupyterlab-hybrid-kernels:session-manager',
  description: 'The session manager plugin.',
  autoStart: true,
  provides: ISessionManager,
  requires: [IKernelClient, IKernelManager, IKernelSpecs],
  activate: (
    _: null,
    kernelClient: IKernelClient,
    kernelManager: Kernel.IManager,
    kernelSpecs: IKernelSpecs
  ): Session.IManager => {
    const serverSettings = createServerSettings();
    return new HybridSessionManager({
      kernelClient,
      kernelManager,
      kernelSpecs,
      serverSettings
    });
  }
};

const plugins = [
  configPlugin,
  configDialogPlugin,
  kernelClientPlugin,
  kernelManagerPlugin,
  kernelSpecManagerPlugin,
  liteKernelSpecManagerPlugin,
  sessionManagerPlugin
];
export default plugins;
