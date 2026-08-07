import type {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import type { WidgetTracker } from '@jupyterlab/apputils';
import { MainAreaWidget } from '@jupyterlab/apputils';

import { ILauncher } from '@jupyterlab/launcher';

import type {
  ServiceManagerPlugin,
  Terminal,
  ServerConnection
} from '@jupyterlab/services';
import {
  IServerSettings,
  ITerminalManager,
  TerminalAPI
} from '@jupyterlab/services';

import type { ITerminal } from '@jupyterlab/terminal';
import { ITerminalTracker, Terminal as XTerm } from '@jupyterlab/terminal';

import { ITranslator } from '@jupyterlab/translation';

import { terminalIcon } from '@jupyterlab/ui-components';

import { ILiteTerminalAPIClient } from '@jupyterlite/terminal';

import type { HybridTerminal } from './terminal';
import { HybridTerminalManager } from './terminal';

/**
 * The hybrid terminal manager plugin.
 */
export const terminalManagerPlugin: ServiceManagerPlugin<Terminal.IManager> = {
  id: 'jupyterlab-hybrid-kernels:terminal-manager',
  description: 'The terminal manager plugin.',
  autoStart: true,
  provides: ITerminalManager,
  requires: [ILiteTerminalAPIClient],
  optional: [IServerSettings],
  activate: (
    _: null,
    liteTerminalAPIClient: ILiteTerminalAPIClient,
    serverSettings: ServerConnection.ISettings | undefined
  ): Terminal.IManager => {
    console.log('jupyterlab-hybrid-kernels:terminal-manager plugin activated');
    return new HybridTerminalManager({
      serverSettings,
      liteTerminalAPIClient
    });
  }
};

namespace CommandIDs {
  export const createLiteTerminal =
    'jupyterlab-hybrid-kernels:create-lite-terminal';
}

export const terminalLauncherPlugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab-hybrid-kernels:terminal-launcher',
  autoStart: true,
  requires: [ILauncher, ITerminalTracker, ITranslator],
  activate: (
    app: JupyterFrontEnd,
    launcher: ILauncher,
    terminalTracker: ITerminalTracker,
    translator: ITranslator
  ) => {
    console.log('jupyterlab-hybrid-kernels:terminal-launcher plugin activated');
    const { commands, serviceManager } = app;
    const trans = translator.load('jupyterlab');
    const tracker = terminalTracker as WidgetTracker<
      MainAreaWidget<ITerminal.ITerminal>
    >;

    // Slightly modified copy of 'terminal:create-new' command.
    const options: Partial<ITerminal.IOptions> = {};
    commands.addCommand(CommandIDs.createLiteTerminal, {
      label: args =>
        args['isPalette']
          ? trans.__('New Lite Terminal')
          : trans.__('Lite Terminal'),
      caption: trans.__('Start a new Lite terminal session'),
      icon: args => (args['isPalette'] ? undefined : terminalIcon),
      execute: async args => {
        const name = args['name'] as string;
        const cwd = args['cwd'] as string;
        const localPath = cwd
          ? serviceManager.contents.localPath(cwd)
          : undefined;

        let session;
        if (name) {
          const models = await TerminalAPI.listRunning(
            serviceManager.serverSettings
          );
          if (models.map(d => d.name).includes(name)) {
            // we are restoring a terminal widget and the corresponding terminal exists
            // let's connect to it
            session = serviceManager.terminals.connectTo({ model: { name } });
          } else {
            // we are restoring a terminal widget but the corresponding terminal was closed
            // let's start a new terminal with the original name
            session = await serviceManager.terminals.startNew({
              name,
              cwd: localPath,
              lite: true // Request Lite not Lab terminal
            } as HybridTerminal.IOptions);
          }
        } else {
          // we are creating a new terminal widget with a new terminal
          // let the server choose the terminal name
          session = await serviceManager.terminals.startNew({
            cwd: localPath,
            lite: true // Request Lite not Lab terminal
          } as HybridTerminal.IOptions);
        }

        const term = new XTerm(session, options, translator);
        term.title.icon = terminalIcon;
        term.title.label = '...';

        const main = new MainAreaWidget({ content: term, reveal: term.ready });
        app.shell.add(main, 'main', { type: 'Terminal' });
        void tracker.add(main);
        app.shell.activateById(main.id);
        return main;
      },
      describedBy: {
        args: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: trans.__('Terminal session name')
            },
            cwd: {
              type: 'string',
              description: trans.__(
                'Current working directory for the terminal'
              )
            },
            isPalette: {
              type: 'boolean',
              description: trans.__(
                'Whether the command is called from the command palette'
              )
            }
          }
        }
      }
    });

    launcher.add({
      command: CommandIDs.createLiteTerminal,
      category: trans.__('Other'),
      rank: 1
    });
  }
};
