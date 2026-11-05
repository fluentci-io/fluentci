export function _id(c) {
  return function (onError, onSuccess) {
    c.id().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function _contents(c) {
  return function (onError, onSuccess) {
    c.contents().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function _digest(c) {
  return function (onError, onSuccess) {
    c.digest().then(onSuccess).catch(onError);
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

export function _name(c) {
  return function (onError, onSuccess) {
    c.name().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function _size(c) {
  return function (onError, onSuccess) {
    c.size().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function _sync(c) {
  return function (onError, onSuccess) {
    c.sync().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function withName(c) {
  return function (name) {
    return function () {
      return c.withName(name);
    };
  };
}

export function withTimestamps(c) {
  return function (timestamps) {
    return function () {
      return c.withTimestamps(timestamps);
    };
  };
}
