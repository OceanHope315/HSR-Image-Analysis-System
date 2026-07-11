let ioInstance = null;

export function setSocketServer(io) {
  ioInstance = io;
}

export function getSocketServer() {
  return ioInstance;
}

export function emitEvent(event, payload) {
  ioInstance?.emit(event, payload);
}
