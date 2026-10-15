declare module 'rijndael-js' {
  export default class Rijndael {
    constructor(key: Uint8Array, mode: 'cbc');
    encrypt(plaintext: Uint8Array, blockSize: 256, iv: Uint8Array): number[];
    decrypt(ciphertext: Uint8Array, blockSize: 256, iv: Uint8Array): number[];
  }
}
