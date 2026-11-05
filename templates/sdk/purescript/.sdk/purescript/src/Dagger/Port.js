export function _id(c) {
  return function (onError, onSuccess) {
    c.id().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function _description(c) {
  return function (onError, onSuccess) {
    c.description().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function _experimentalSkipHealthCheck(c) {
  return function (onError, onSuccess) {
    c.experimentalSkipHealthCheck().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function _port(c) {
  return function (onError, onSuccess) {
    c.port().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function _protocol(c) {
  return function (onError, onSuccess) {
    c.protocol().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}
