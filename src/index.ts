import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
  IKernelManager,
  IKernelSpecManager,
  IServerSettings,
  ISessionManager,
  Kernel,
  KernelSpec,
  ServerConnection,
  ServiceManagerPlugin,
  Session
} from '@jupyterlab/services';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import {
  IKernelClient,
  IKernelSpecs,
  KernelSpecs,
  LiteKernelClient
} from '@jupyterlite/kernel';

import { HybridKernelManager } from './kernel';

import { HybridKernelSpecManager } from './kernelspec';

import { HybridSessionManager } from './session';

import kernelPromoterPlugin from './promoterplugin';

// TODO: find a better to include these packages, as they are expected to be in the
// shared scope by kernels as singletons
import '@jupyterlite/server';
import '@jupyterlite/contents';

/**
 * Initialization data for the jupyterlab-hybrid-kernels extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab-hybrid-kernels:plugin',
  description: 'Use in-browser and regular kernels in JupyterLab',
  autoStart: true,
  optional: [ISettingRegistry],
  activate: (
    app: JupyterFrontEnd,
    settingRegistry: ISettingRegistry | null
  ) => {
    console.log('JupyterLab extension jupyterlab-hybrid-kernels is activated!');

    if (settingRegistry) {
      settingRegistry
        .load(plugin.id)
        .then(settings => {
          console.log(
            'jupyterlab-hybrid-kernels settings loaded:',
            settings.composite
          );
        })
        .catch(reason => {
          console.error(
            'Failed to load settings for jupyterlab-hybrid-kernels.',
            reason
          );
        });
    }
  }
};

/**
 * The client for managing in-browser kernels
 */
const kernelClientPlugin: ServiceManagerPlugin<Kernel.IKernelAPIClient> = {
  id: '@jupyterlite/services-extension:kernel-client',
  description: 'The client for managing in-browser kernels',
  autoStart: true,
  requires: [IKernelSpecs],
  optional: [IServerSettings],
  provides: IKernelClient,
  activate: (
    _: null,
    kernelSpecs: IKernelSpecs,
    serverSettings?: ServerConnection.ISettings
  ): IKernelClient => {
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
  optional: [IServerSettings],
  activate: (
    _: null,
    kernelClient: IKernelClient,
    kernelSpecs: IKernelSpecs,
    serverSettings: ServerConnection.ISettings | undefined
  ): Kernel.IManager => {
    console.log('Using the HybridKernelManager');
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
  optional: [IServerSettings],
  activate: (
    _: null,
    kernelSpecs: IKernelSpecs,
    serverSettings: ServerConnection.ISettings | undefined
  ): KernelSpec.IManager => {
    console.log('Using HybridKernelSpecManager');
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
  optional: [IServerSettings],
  activate: (
    _: null,
    kernelClient: IKernelClient,
    kernelManager: Kernel.IManager,
    kernelSpecs: IKernelSpecs,
    serverSettings: ServerConnection.ISettings | undefined
  ): Session.IManager => {
    console.log('Using the HybridSessionManager');
    return new HybridSessionManager({
      kernelClient,
      kernelManager,
      kernelSpecs,
      serverSettings
    });
  }
};

const plugins = [
  plugin,
  kernelClientPlugin,
  kernelManagerPlugin,
  kernelSpecManagerPlugin,
  liteKernelSpecManagerPlugin,
  sessionManagerPlugin,
  kernelPromoterPlugin
];
export default plugins;
