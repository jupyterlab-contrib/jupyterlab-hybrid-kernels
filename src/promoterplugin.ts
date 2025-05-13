import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { IKernelSpecs } from '@jupyterlite/kernel';
import { KernelPromoter } from './kernelpromoter';
import { IToolbarWidgetRegistry } from '@jupyterlab/apputils';

/**
 * The default settings for the kernel promoter.
 */
const DEFAULT_SETTINGS = {
  autoPromote: true,
  errorPatterns: ['ModuleNotFoundError', 'MemoryError']
};

/**
 * The kernel promoter plugin.
 */
const kernelPromoterPlugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab-hybrid-kernels:kernel-promoter',
  description: 'A plugin for promoting lite kernels to server kernels',
  autoStart: true,
  requires: [INotebookTracker, IKernelSpecs],
  optional: [ISettingRegistry, IToolbarWidgetRegistry],
  activate: (
    app: JupyterFrontEnd,
    notebookTracker: INotebookTracker,
    kernelSpecs: IKernelSpecs,
    settingRegistry: ISettingRegistry | null,
    toolbarRegistry: IToolbarWidgetRegistry | null
  ) => {
    console.log('Activating kernel promoter plugin');

    // Load settings
    let settings = { ...DEFAULT_SETTINGS };

    if (settingRegistry) {
      const loadSettings = () => {
        settingRegistry
          .load('jupyterlab-hybrid-kernels:plugin')
          .then(s => {
            settings = {
              autoPromote: s.get('autoPromote').composite as boolean,
              errorPatterns: s.get('errorPatterns').composite as string[]
            };
            console.log('Kernel promoter settings loaded:', settings);
          })
          .catch(reason => {
            console.error('Failed to load kernel promoter settings', reason);
          });
      };

      // Try to load settings now
      loadSettings();

      // Listen for setting changes
      settingRegistry.pluginChanged.connect((_, id) => {
        loadSettings();
      });
    }

    const { serviceManager } = app;

    // Initialize the promoter
    const promoter = new KernelPromoter({
      notebookTracker,
      kernelSpecs,
      serviceManager,
      autoPromote: settings.autoPromote,
      errorPatterns: settings.errorPatterns
    });

    // Add the toolbar button for all notebooks
    if (toolbarRegistry) {
      toolbarRegistry.addFactory<NotebookPanel>(
        'Notebook',
        'kernelPromoter',
        panel => {
          return promoter.createPromoteButton(panel.sessionContext);
        }
      );
    }
  }
};

export default kernelPromoterPlugin;
