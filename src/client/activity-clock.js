// Time advances only with rendered, unpaused frames after the current load.
export class ActivityClock {
  token = 0
  remaining = 0
  playing = false
  begin(seconds) { this.token++; this.remaining = seconds; this.playing = false; return this.token }
  ready(token) { if (token === this.token && this.remaining > 0) this.playing = true }
  advance(delta) {
    if (!this.playing || !Number.isFinite(delta) || delta <= 0) return false
    this.remaining -= delta
    if (this.remaining > 0) return false
    this.playing = false; this.remaining = 0; return true
  }
  cancel() { this.token++; this.remaining = 0; this.playing = false }
}
