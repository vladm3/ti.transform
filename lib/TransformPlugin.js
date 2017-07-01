const path = require('path');
const fs = require('fs-extra');
const chokidar = require('chokidar');
const klawSync = require('klaw-sync');
const pkg = require('../package.json');

class TransformPlugin {
  constructor() {
    this.id = pkg.name;
    this.version = pkg.version;
    this.cliVersion = '>=3.x';

    this.watcher = null;
    this.paths = {};

    this.handleExit = this.handleExit.bind(this);
    this.handlePreConstruct = this.handlePreConstruct.bind(this);
    this.handlePreCompile = this.handlePreCompile.bind(this);
    this.handleTransformFile = this.handleTransformFile.bind(this);
    this.handlePostClean = this.handlePostClean.bind(this);
  }

  init(logger, config, cli) {
    this.logger = logger;
    this.config = config;
    this.cli = cli;

    const srcDir = (this.cli.tiapp.properties['ti-transform-src-dir'] &&
      this.cli.tiapp.properties['ti-transform-src-dir'].value) || 'src';
    const dstDir = (this.cli.tiapp.properties['ti-transform-dst-dir'] &&
      this.cli.tiapp.properties['ti-transform-dst-dir'].value) || 'app';

    this.paths.root = this.cli.argv['project-dir'];
    this.paths.src = path.join(this.paths.root, srcDir);
    this.paths.dst = path.join(this.paths.root, dstDir);
    this.paths.build = path.join(this.paths.root, 'build');
    this.paths.lock = path.join(this.paths.build, '.ti.transform.lock');

    this.addHooks();
  }

  addHooks() {
    process.on('SIGINT', this.handleExit);
    process.on('exit', this.handleExit);

    this.cli.on('build.pre.construct', {
      priority: 100,
      pre: this.handlePreConstruct
    });

    this.cli.on('build.pre.compile', {
      priority: 100,
      pre: this.handlePreCompile
    });

    this.cli.on('ti.transform.file', {
      priority: 10000,
      post: this.handleTransformFile
    });

    this.cli.on('clean.post', this.handlePostClean);
  }

  handlePreConstruct(event, next) {
    if (this.cli.argv.liveview) {
      this.log('Detected LiveView. Starting watcher...');
      this.startWatcher();
    }

    next();
  }

  handlePreCompile(data, next) {
    this.transform()
      .then(() => next())
      .catch(e => next(e));
  }

  handleTransformFile(data, next) {
    if (!data || data.processed) {
      next();
      return;
    }

    this.copyAsset(data.src)
      .then(genPath => {
        data.processed = true;
        data.gen.push(genPath);
        next();
      })
      .catch(e => next(e));
  }

  handlePostClean(event, next) {
    this.clean()
      .then(() => next())
      .catch(e => next(e));
  }

  handleExit() {
    this.stopWatcher();
  }

  transform() {
    return this.readLock()
      .then((lock = {}) => {
        const blacklist = new Set(['.DS_Store', 'Thumbs.db']);
        const currSrcFilesRes = klawSync(this.paths.src, {
          nodir: true,
          filter: ({ path: file }) => !blacklist.has(path.basename(file))
        });
        const newLock = {};
        currSrcFilesRes
          .filter(({ path, stats }) => lock[path] && lock[path].mtime === stats.mtime.getTime())
          .forEach(({ path }) => newLock[path] = lock[path]);

        const changedSrcFiles = currSrcFilesRes
          .filter(({ path, stats }) => !lock[path] || lock[path].mtime !== stats.mtime.getTime());

        return Promise.all(changedSrcFiles.map(({ path: src, stats }) => {
          const data = {
            src,
            gen: [],
            processed: false,
            paths: Object.assign({}, this.paths)
          };

          return this.emit('ti.transform.file', data)
            .then(() => {
              if (!data.processed) {
                return;
              }

              return newLock[src] = {
                gen: data.gen,
                mtime: stats.mtime.getTime()
              };
            });
        }))
          .then(() => ({ lock, newLock, currSrcFilesRes }));
      })
      .then(({ lock, newLock }) => {
        const prevSrcFiles = Object.keys(lock);
        const currSrcFiles = new Set(Object.keys(newLock));
        const removedSrcFiles = prevSrcFiles.filter(file => !currSrcFiles.has(file));
        const removedGenFiles = removedSrcFiles.reduce((prev, file) =>
          prev.concat(lock[file].gen), []);
        const allGenFiles = new Set([...currSrcFiles].reduce((prev, file) =>
          prev.concat(newLock[file].gen), []));
        const genFilesToRemove = removedGenFiles.filter(file => !allGenFiles.has(file));

        return Promise.all(genFilesToRemove.map(file => {
          this.log(`Removing outdated generated file ${file}`);
          return fs.remove(file);
        }))
          .then(() => ({ lock, newLock }));
      })
      .then(({ newLock }) => this.writeLock(newLock));
  }

  copyAsset(srcPath) {
    const relativePath = path.relative(this.paths.src, srcPath);
    const dstPath = path.join(this.paths.dst, relativePath);
    this.log(`Copying source file as is ${srcPath} -> ${dstPath}`);
    return fs.copy(srcPath, dstPath).then(() => dstPath);
  }

  readLock() {
    return fs.pathExists(this.paths.lock)
      .then(exists => {
        if (exists) {
          this.log(`Lock file found at ${this.paths.lock}`);
          return fs.readJson(this.paths.lock);
        }

        this.log(`Lock file not found at ${this.paths.lock}`);
        return this.clean().then(() => ({}));
      });
  }

  writeLock(newLock) {
    this.log(`Writing new lock file to ${this.paths.lock}`);
    return fs.writeJson(this.paths.lock, newLock, { spaces: 2 });
  }

  clean() {
    this.log(`Cleaning generated artifacts ${this.paths.dst}`);
    return fs.remove(this.paths.dst);
  }

  startWatcher() {
    this.watcher = chokidar.watch(this.paths.src, { ignoreInitial: true })
      .on('change', path => {
        this.log(`${path} was changed`);
        this.transform();
      })
      .on('add', path => {
        this.log(`${path} was added`);
        this.transform();
      })
      .on('unlink', path => {
        this.log(`${path} was removed`);
        this.transform();
      });
  }

  stopWatcher() {
    if (this.watcher) {
      this.log('Stopping watcher...');
      this.watcher.close();
      this.watcher = null;
    }
  }

  emit(hookName, context) {
    return new Promise((resolve, reject) => {
      this.cli.emit(hookName, context, (err, result) =>
        err ? reject(err) : resolve(result));
    });
  }

  log(message, level = 'info') {
    level = this.logger[level] ? level : 'info';
    this.logger[level](message);
  }
}

module.exports = TransformPlugin;