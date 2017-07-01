[![npm](https://img.shields.io/npm/v/ti.transform.svg)](https://www.npmjs.com/package/ti.transform)

# ti.transform
This Titanium CLI plugin keeps track of changes in source files and fires
the CLI hook `ti.transform.file` to allow other plugins to transform
source code the way you want.

__Note 1:__
The plugin is under active development and hasn't been thoroughly tested.
Only use it for projects under source control.

__Note 2:__
The plugin implies that you store your source files in a separate directory.
By default it expects that source files are located in the directory `/src`
and generated files are stored in the directory `/app`.
See the section [Options](#options).

__Note 3:__
The plugin does not transform the source files.
It is a support plugin for other CLI plugins.
See the sections [Existing plugins](#existing-plugins) and [How it works?](#how-it-works).

## Installation & Configuration
### NPM (recommended)
Run this command in a Titanium project directory

```bash
npm install --save-dev ti.transform
```

The plugin will install itself to the project's local `/plugins` directory.

After that you need to enable the plugin in your tiapp.xml.
Add the following XML element to the `<plugins/>` section:
`<plugins/>` section:
```xml
<plugins>
  ...
  <plugin version="0.1.0">ti.transform</plugin>
</plugins>
```
### Manual
At first, download the plugin.

Then copy the plugin code into the project's local `/plugins` directory:
```
${project}/plugins/ti.transform/0.1.0/{plugin_files}
```

After that add the following XML element to the `<plugins/>` section:
```xml
<plugins>
  ...
  <plugin version="0.1.0">ti.transform</plugin>
</plugins>
```
### Options
You can pass options to the plugin by adding properties to your tiapp.xml.

This plugin supports the following options:
* `ti-transform-src-dir`: Default `src`.
The directory, relative to the project root directory, where your source files live in. The plugin tracks files only in this directory.
* `ti-transform-dst-dir`: Default `app`.
The directory, relative to the project root directory, where generated files should be written.

By default this options are set to `src` and `app` respectively,
implying the [Alloy](http://docs.appcelerator.com/platform/latest/#!/guide/Alloy_Framework) project structure.

If you want to maintain other project structure specify `ti.transform` options in your `tiapp.xml`. For example:
```xml
<ti:app xmlns:ti="http://ti.appcelerator.org">
  ...
  <property name="ti-transform-src-dir" type="string">src</property>
  <property name="ti-transform-dst-dir" type="string">Resources</property>
  ...
</ti:app>
```

## Existing plugins
| Plugin | Version | Description |
|--------|---------|-------------|
| [`ti.transform.babel`](https://github.com/vladm3/ti.transform.babel) | [![npm](https://img.shields.io/npm/v/ti.transform.babel.svg)](https://www.npmjs.com/package/ti.transform.babel) | Transforms JS files using [Babel](http://babeljs.io/) |
| [`ti.transform.pug`](https://github.com/vladm3/ti.transform.pug) | [![npm](https://img.shields.io/npm/v/ti.transform.pug.svg)](https://www.npmjs.com/package/ti.transform.pug) | Transforms `*.pug|jade` files using [Pug](https://pugjs.org/) |
| [`ti.transform.stss`](https://github.com/vladm3/ti.transform.stss) | [![npm](https://img.shields.io/npm/v/ti.transform.stss.svg)](https://www.npmjs.com/package/ti.transform.stss) | Transforms style files using [STSS](https://github.com/RonaldTreur/STSS) |

## Example
See the example project [ti.transform-example](https://github.com/vladm3/ti.transform-example)

## How it works?
This plugin binds to the pre-compile [event hook](http://docs.appcelerator.com/platform/latest/#!/guide/Titanium_CLI_Plugins-section-src-37549163_TitaniumCLIPlugins-FunctionandEventHooks),
and every time you run your project the plugin scans your source directory for changes. For each changed file it emits the event `ti.transform.file`, to which other CLI plugins can bind and transform the file.
If no plugin transforms the file, the `ti.transform` plugin will copy it as is, retaining the original relative path and extension, for example:
```
${project}/src/lib/a.js -> ${project}/app/lib/a.js
```

### Tracking changes
The plugin uses a lock file to keep track of source files and to avoid transforming unmodified files. The lock file is stored in your project's `build` directory:
```
${project}/build/.ti.transform.lock
```
It has the following JSON structure:
```json
{
  "${src_file_path}": {
    "gen": [
      "${gen_file1_path}",
      "${gen_file2_path}",
      ...
    ],
    "mtime": "${last_modified_time_of_src_file}"
  }
}
```

### LiveView support
The plugin supports [LiveView](http://docs.appcelerator.com/platform/latest/#!/guide/LiveView) feature.
If you run your project with the flag `--liveview` or by using the LiveView switch in the Appcelerator Studio IDE, the plugin creates a [chokidar](https://github.com/paulmillr/chokidar) instance that watches changes in the source directory.
Upon a modification, the plugin fires the event `ti.transform.file` for each modified file.

## License
MIT