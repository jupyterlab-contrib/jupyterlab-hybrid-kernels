# jupyterlab-hybrid-kernels

[![Github Actions Status](https://github.com/jtpio/jupyterlab-hybrid-kernels/workflows/Build/badge.svg)](https://github.com/jtpio/jupyterlab-hybrid-kernels/actions/workflows/build.yml)

Use in-browser (JupyterLite) and regular Jupyter kernels together in JupyterLab and Jupyter Notebook.

https://github.com/user-attachments/assets/a6028cce-e613-479c-b56f-d090810e7638

> [!WARNING]
> This extension is in early development and should be considered experimental.

## Requirements

- JupyterLab >= 4.4.0b2 or Jupyter Notebook >= 7.4.0b2

## Install

To install the extension:

```bash
pip install jupyterlab-hybrid-kernels
```

Currently, you also need to install the latest pre-releases of JupyterLab or Jupyter Notebook to use this extension:

```bash
pip install --pre -U jupyterlab notebook
```

By default, installing JupyterLab or Jupyter Notebook will also install `ipykernel` as the default kernel for Python.

For in-browser kernels, you will need to install one of the available JupyterLite kernels. For example, to install the Pyodide kernel:

```bash
pip install jupyterlite-pyodide-kernel
```

## Usage

This extension lets you use in-browser kernels (like Pyodide) and regular Jupyter kernels together in JupyterLab and Jupyter Notebook.

> [!NOTE]
> While regular Jupyter kernels can be used across tabs and persist after reloading the page, in-browser kernels are only available on the page or browser tab where they were started, and destroyed on page reload.

### File system access from in-browser kernels

In-browser kernels like Pyodide (via `jupyterlite-pyodide-kernel`) can access the files shown in the JupyterLab file browser.

To enable this, you need to set additional HTTP headers when serving the JupyterLab instance, for example in a jupyter_server_config.py file:

```python
c.ServerApp.tornado_settings = {
  "headers": {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp"
  }
}
```

Then start JupyterLab with:

```bash
jupyter lab --config jupyter_server_config.py
```

## Uninstall

To remove the extension, execute:

```bash
pip uninstall jupyterlab-hybrid-kernels
```

## Contributing

### Development install

Note: You will need NodeJS to build the extension package.

The `jlpm` command is JupyterLab's pinned version of
[yarn](https://yarnpkg.com/) that is installed with JupyterLab. You may use
`yarn` or `npm` in lieu of `jlpm` below.

```bash
# Clone the repo to your local environment
# Change directory to the jupyterlab_hybrid_kernels directory
# Install package in development mode
pip install -e "."
# Link your development version of the extension with JupyterLab
jupyter labextension develop . --overwrite
# Rebuild extension Typescript source after making changes
jlpm build
```

You can watch the source directory and run JupyterLab at the same time in different terminals to watch for changes in the extension's source and automatically rebuild the extension.

```bash
# Watch the source directory in one terminal, automatically rebuilding when needed
jlpm watch
# Run JupyterLab in another terminal
jupyter lab
```

With the watch command running, every saved change will immediately be built locally and available in your running JupyterLab. Refresh JupyterLab to load the change in your browser (you may need to wait several seconds for the extension to be rebuilt).

By default, the `jlpm build` command generates the source maps for this extension to make it easier to debug using the browser dev tools. To also generate source maps for the JupyterLab core extensions, you can run the following command:

```bash
jupyter lab build --minimize=False
```

### Development uninstall

```bash
pip uninstall jupyterlab_hybrid_kernels
```

In development mode, you will also need to remove the symlink created by `jupyter labextension develop`
command. To find its location, you can run `jupyter labextension list` to figure out where the `labextensions`
folder is located. Then you can remove the symlink named `jupyterlab-hybrid-kernels` within that folder.

### Testing the extension

#### Frontend tests

This extension is using [Jest](https://jestjs.io/) for JavaScript code testing.

To execute them, execute:

```sh
jlpm
jlpm test
```

#### Integration tests

This extension uses [Playwright](https://playwright.dev/docs/intro) for the integration tests (aka user level tests).
More precisely, the JupyterLab helper [Galata](https://github.com/jupyterlab/jupyterlab/tree/master/galata) is used to handle testing the extension in JupyterLab.

More information are provided within the [ui-tests](./ui-tests/README.md) README.

### Packaging the extension

See [RELEASE](RELEASE.md)
