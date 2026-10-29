/** One foreground clock for a lesson's result and daily learning allowance. */
export class LessonTime {
  private total = 0;
  private since: number | null = null;

  constructor(private readonly now = () => performance.now()) {}

  reset(savedMs: unknown = 0) {
    // Old startedAt is wall time: it cannot recover foreground time safely.
    this.total = typeof savedMs === 'number' && Number.isFinite(savedMs) ? Math.max(0, savedMs) : 0;
    this.since = null;
  }

  start() {
    if (this.since === null) this.since = this.now();
  }

  private span() {
    // Heartbeats run every 15s. Bound an unannounced OS sleep / frozen tab gap.
    return this.since === null ? 0 : Math.min(30_000, Math.max(0, this.now() - this.since));
  }

  snapshot() { return this.total + this.span(); }

  checkpoint(pause = false) {
    const deltaMs = this.span();
    this.total += deltaMs;
    if (this.since !== null) this.since = pause ? null : this.now();
    return { deltaMs, totalMs: this.total };
  }
}
