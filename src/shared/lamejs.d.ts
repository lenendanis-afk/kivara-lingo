/**
 * Minimal type declaration for `lamejs`. The published package ships only
 * JS without types and DefinitelyTyped doesn't have an entry for it, so
 * we declare the surface we actually use (`Mp3Encoder`).
 *
 * Reference: https://github.com/zhuker/lamejs#api
 */
declare module 'lamejs' {
  /**
   * Streaming MP3 encoder. Accepts Int16Array PCM blocks of size 1152
   * (the LAME frame size) and emits Int8Array MP3 chunks.
   */
  export class Mp3Encoder {
    constructor(channels: number, sampleRate: number, bitrateKbps: number);
    encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
    flush(): Int8Array;
  }

  // The package also re-exports a handful of helpers (BitStream, …) that
  // we don't need; leaving the rest as `any` keeps the types tight on
  // the parts we actually consume.
  const _default: { Mp3Encoder: typeof Mp3Encoder };
  export default _default;
}
