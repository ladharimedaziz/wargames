// There is no sound anywhere in the World Engine. This module keeps the old API so every call site stays valid,
// and nothing is ever played or loaded: no AudioContext is created.
const silent = () => {};
export const audioReady = () => false;
export const unlockAudio = silent;
export const setAudio = silent;
export const sfx = new Proxy({}, { get: () => silent });
