export function _id(c) {
  return function (onError, onSuccess) {
    c.id().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function from(c) {
  return function (image) {
    return function () {
      return c.from(image);
    };
  };
}

export function withExec(c) {
  return function (args) {
    return function () {
      return c.withExec(args);
    };
  };
}

export function _stdout(c) {
  return function (onError, onSuccess) {
    c.stdout().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function _stderr(c) {
  return function (onError, onSuccess) {
    c.stderr().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}
