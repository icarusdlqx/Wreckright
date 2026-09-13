/** A page owns sound only while the player is using it. Preferences stay separate. */
export class AudioPlaybackFocus {
  private readonly listeners = new Set<() => void>();
  private readonly id = globalThis.crypto?.randomUUID?.() ?? `audio-${Date.now()}-${Math.random()}`;
  private channel: BroadcastChannel | null = null;
  private latest = { at: 0, id: '' };
  private owned = true;
  private listening = false;

  get active(): boolean { return this.owned && globalThis.document?.visibilityState !== 'hidden'; }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    if (!this.listening) this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  }

  private start(): void {
    const document = globalThis.document;
    if (document === undefined) return;
    this.listening = true;
    this.owned = false;
    try {
      // Retain the original channel so an older open tab cannot double-play audio.
      this.channel = new BroadcastChannel('wreckright-audio-owner');
      this.channel.addEventListener('message', this.receive);
    } catch { this.channel = null; }
    globalThis.addEventListener('focus', this.claim);
    globalThis.addEventListener('blur', this.release);
    globalThis.addEventListener('storage', this.readStorage);
    document.addEventListener('visibilitychange', this.visibility);
    document.addEventListener('pointerdown', this.claim, true);
    document.addEventListener('keydown', this.claim, true);
    if (document.hasFocus()) this.claim();
  }

  private stop(): void {
    if (!this.listening) return;
    this.listening = false;
    this.channel?.removeEventListener('message', this.receive);
    this.channel?.close();
    this.channel = null;
    globalThis.removeEventListener('focus', this.claim);
    globalThis.removeEventListener('blur', this.release);
    globalThis.removeEventListener('storage', this.readStorage);
    globalThis.document?.removeEventListener('visibilitychange', this.visibility);
    globalThis.document?.removeEventListener('pointerdown', this.claim, true);
    globalThis.document?.removeEventListener('keydown', this.claim, true);
    this.owned = true;
  }

  private claim = (): void => {
    if (globalThis.document?.visibilityState === 'hidden') return;
    this.latest = { at: Math.max(Date.now(), this.latest.at + 1), id: this.id };
    this.setOwned(true);
    this.publish();
  };

  private publish(): void {
    if (this.channel !== null) this.channel.postMessage(this.latest);
    else {
      try { globalThis.localStorage?.setItem('ironline.audio-owner', JSON.stringify(this.latest)); }
      catch { /* Focus and visibility still protect browsers without shared storage. */ }
    }
  }

  private release = (): void => { this.setOwned(false); };
  private visibility = (): void => {
    if (globalThis.document?.visibilityState === 'hidden') this.release();
    else if (globalThis.document?.hasFocus()) this.claim();
  };
  private receive = (event: MessageEvent<unknown>): void => { this.accept(event.data); };
  private readStorage = (event: StorageEvent): void => {
    if (event.key !== 'ironline.audio-owner' || event.newValue === null) return;
    try { this.accept(JSON.parse(event.newValue) as unknown); } catch { /* Unrelated malformed value. */ }
  };
  private accept(value: unknown): void {
    if (typeof value !== 'object' || value === null) return;
    const message = value as Record<string, unknown>;
    if (typeof message.id !== 'string' || typeof message.at !== 'number' || !Number.isFinite(message.at)) return;
    if (message.id === this.id) return;
    if (message.at < this.latest.at || (message.at === this.latest.at && message.id <= this.latest.id)) {
      // A just-opened tab may have missed our earlier claim. Reply once with
      // the winning stamp so equal-time claims cannot leave both pages audible.
      if (this.owned) this.publish();
      return;
    }
    this.latest = { at: message.at, id: message.id };
    this.setOwned(false);
  }
  private setOwned(owned: boolean): void {
    if (this.owned === owned) return;
    this.owned = owned;
    for (const listener of this.listeners) listener();
  }
}

export const audioPlaybackFocus = new AudioPlaybackFocus();
