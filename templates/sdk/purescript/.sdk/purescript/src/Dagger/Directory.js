export function _id(c) {
  return function (onError, onSuccess) {
    c.id().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function asModule(c) {
  return function () {
    return c.asModule();
  };
}

export function diff(c) {
  return function (other) {
    return function () {
      return c.diff(other);
    };
  };
}

export function directory(c) {
  return function (path) {
    return function () {
      return c.directory(path);
    };
  };
}

export function dockerBuild(c) {
  return function () {
    return c.dockerBuild();
  };
}

export function _entries(c) {
  return function (onError, onSuccess) {
    c.entries().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function _export(c) {
  return function (path) {
    return function (onError, onSuccess) {
      c.export_(path).then(onSuccess).catch(onError);
      return function (cancelError, onCancelerError, onCancelerSuccess) {
        onCancelerSuccess();
      };
    };
  };
}

export function file(c) {
  return function (path) {
    return function () {
      return c.file(path);
    };
  };
}

export function _glob(c) {
  return function (pattern) {
    return function (onError, onSuccess) {
      c.glob(pattern).then(onSuccess).catch(onError);
      return function (cancelError, onCancelerError, onCancelerSuccess) {
        onCancelerSuccess();
      };
    };
  };
}

export function pipeline(c) {
  return function (name) {
    return function () {
      return c.pipeline(name);
    };
  };
}

export function sync(c) {
  return function () {
    return c.sync();
  };
}

export function terminal(c) {
  return function () {
    return c.terminal();
  };
}

export function withDirectory(c) {
  return function (path) {
    return function () {
      return c.withDirectory(path);
    };
  };
}

export function withFile(c) {
  return function (source) {
    return function () {
      return c.withFile(source);
    };
  };
}

export function withFiles(c) {
  return function (sources) {
    return function () {
      return c.withFiles(source);
    };
  };
}

export function withNewDirectory(c) {
  return function (path) {
    return function () {
      return c.withNewDirectory(path);
    };
  };
}

export function withNewFile(c) {
  return function (path) {
    return function (contents) {
      return function () {
        return c.withNewFile(path, contents);
      };
    };
  };
}

export function withTimestamps(c) {
  return function (timestamp) {
    return function () {
      return c.withTimestamps(timestamp);
    };
  };
}

export function withoutDirectory(c) {
  return function (path) {
    return function () {
      return c.withoutDirectory(path);
    };
  };
}

export function withoutFile(c) {
  return function (path) {
    return function () {
      return c.withoutFile;
    };
  };
}
