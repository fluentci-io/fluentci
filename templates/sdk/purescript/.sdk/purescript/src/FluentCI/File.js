export function _id(f) {
  return function (onError, onSuccess) {
    f.id().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function _chmod(f) {
  return function (mode) {
    return function () {
      return f.chmod(mode);
    };
  };
}

export function _md5(f) {
  return function (onError, onSuccess) {
    f.md5().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function _path(f) {
  return function (onError, onSuccess) {
    f.path().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function _sha256(f) {
  return function (onError, onSuccess) {
    f.sha256().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function tarCzvf(f) {
  return function () {
    return f.tarCzvf();
  };
}

export function tarXzvf(f) {
  return function (outputDir) {
    return f.tarXzvf(outputDir);
  };
}

export function unzip(f) {
  return function (outputDir) {
    return function () {
      return f.unzip(outputDir);
    };
  };
}

export function zip(f) {
  return function () {
    return function () {
      return f.zip();
    };
  };
}
