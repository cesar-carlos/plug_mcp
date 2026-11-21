/** Failed termination keeps the renderer unavailable rather than overlapping workers. */
export class PdfRenderSlot {
  private busy = false;
  acquire(): boolean {
    if (this.busy) return false;
    this.busy = true;
    return true;
  }
  async releaseAfter(terminate: () => Promise<unknown>): Promise<void> {
    try {
      await terminate();
      this.busy = false;
    } catch {
      // Keep the slot closed: worker termination was not confirmed.
    }
  }
}
