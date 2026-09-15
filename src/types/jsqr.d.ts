declare module 'jsqr' {
  interface QRCode {
    binaryData: number[]
    data: string
    chunks: unknown[]
    location: {
      topRightFinderPattern: { x: number; y: number }
      topLeftFinderPattern: { x: number; y: number }
      bottomLeftFinderPattern: { x: number; y: number }
    }
  }

  function jsQR(
    data: Uint8ClampedArray | Uint8Array | number[],
    width: number,
    height: number,
    options?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' },
  ): QRCode | null

  export default jsQR
}
