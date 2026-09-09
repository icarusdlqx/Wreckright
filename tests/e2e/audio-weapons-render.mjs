import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const folder = process.env.SHOT_DIR ?? 'reports/audio-upgrade';
const withMusic = process.env.AUDIO_MUSIC === '1';
const noiseSeed = Number(process.env.AUDIO_SEED ?? 0x12345678) >>> 0 || 1;
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'], executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const page = await browser.newPage();
  // The audio module runs in an empty same-origin document, outside the game's HMR and active score.
  await page.route('**/__audio_preview__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Offline audio render</title>' }));
  await page.goto(`${process.env.BASE_URL ?? 'http://127.0.0.1:5250/'}__audio_preview__`, { waitUntil: 'load' });
  for (const version of (process.env.AUDIO_BASELINE === '1' ? ['before', 'after'] : ['after'])) {
    const result = await page.evaluate(async ({ version, folder, withMusic, noiseSeed }) => {
      const prefix = version === 'before' ? `/${folder}/before/` : '/src/ui/';
      const weapons = await import(`${prefix}audioWeapons.ts`);
      const voices = await import(`${prefix}audioVoices.ts`);
      const sampleRate = 44_100;
      const cases = [];
      const placement = { level: 0.85, distance: 40, pan: 0 };
      for (const style of ['tracer', 'missile', 'slug', 'beam', 'pulse', 'bolt', 'flame']) {
        for (const faction of ['linewrought', 'aurelian']) {
          cases.push({ name: `${faction}-${style}`, seconds: 1.3, play: bus => weapons.playWeapon(bus, faction, style, 6, placement) });
        }
      }
      for (const faction of ['linewrought', 'aurelian']) {
        for (const surface of ['road', 'rough', 'water']) cases.push({ name: `${faction}-step-${surface}`, seconds: 0.8,
          play: bus => voices.playFootfall(bus, faction, surface, placement, 85) });
      }
      cases.push({ name: 'part-loss', seconds: 1, play: bus => weapons.playCrunch(bus, placement) });
      cases.push({ name: 'ammunition-rupture', seconds: 1.3, play: bus => weapons.playDestruction(bus, { kind: 'ammo', damage: 60 }, placement) });
      cases.push({ name: 'terminal-and-ground-impact', seconds: 2.4, play: bus => {
        weapons.playDestruction(bus, { kind: 'terminal', tonnage: 100 }, placement);
        voices.playCollapse(bus, placement, 100, 0.62, 'terminal');
      } });
      cases.push({ name: 'saturated-volley', seconds: 2.6, play: bus => {
        for (const style of ['tracer', 'missile', 'slug', 'beam', 'pulse', 'bolt']) weapons.playWeapon(bus, 'aurelian', style, 12, { ...placement, level: 1 });
        weapons.playDestruction(bus, { kind: 'terminal', tonnage: 135 }, { ...placement, level: 1 });
        voices.playCollapse(bus, { ...placement, level: 1 }, 135, 0.62, 'terminal');
      } });
      for (const style of ['tracer', 'missile', 'slug', 'beam', 'pulse', 'bolt', 'flame']) {
        cases.push({ name: `saturated-${style}`, seconds: 2.2, play: bus => {
          for (let i = 0; i < 6; i++) weapons.playWeapon(bus, 'aurelian', style, 12, { ...placement, level: 1 });
          weapons.playDestruction(bus, { kind: 'terminal', tonnage: 135 }, { ...placement, level: 1 });
          voices.playCollapse(bus, { ...placement, level: 1 }, 135, 0.62, 'terminal');
        } });
      }
      const seconds = 0.2 + cases.reduce((total, entry) => total + entry.seconds, 0);
      const context = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -18; compressor.ratio.value = 8; compressor.connect(context.destination);
      const master = context.createGain(); master.gain.value = 0.5; master.connect(compressor);
      let music = null;
      if (withMusic) {
        const { loadScoreBuffers } = await import('/src/ui/audioScoreAssets.ts');
        const { SCORE_LEVEL, coreLayerLevel, rhythmLayerLevel } = await import('/src/ui/audioScoreGraph.ts');
        const { scoreCultureAt } = await import('/src/ui/audioScoreVoicing.ts');
        const buffers = await loadScoreBuffers(context, new AbortController().signal);
        const channels = buffers.map(buffer => Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i)));
        let peak = -Infinity, peakAt = 0, selectedGains = [], selectedShare = 0, selectedChannel = 0;
        for (const share of [0, 0.5, 1]) {
          const culture = scoreCultureAt(share);
          const gains = [coreLayerLevel(1), rhythmLayerLevel(1) * culture.ironwork, rhythmLayerLevel(1) * culture.monolith].map(value => value * SCORE_LEVEL);
          for (let channel = 0; channel < 2; channel++) for (let i = Math.ceil(sampleRate * 0.1); i < buffers[0].length; i++) {
            const sample = channels.reduce((sum, stem, j) => sum + stem[Math.min(channel, stem.length - 1)][i] * gains[j], 0);
            if (sample > peak) { peak = sample; peakAt = i / sampleRate; selectedGains = gains; selectedShare = share; selectedChannel = channel; }
          }
        }
        music = { buffers, gains: selectedGains, peak, peakAt, share: selectedShare, channel: selectedChannel };
      }
      const noise = context.createBuffer(1, sampleRate, sampleRate);
      let seed = noiseSeed;
      const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4_294_967_296; };
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
      let now = 0.2;
      let stress = false;
      const bus = { begin(placement) {
        const out = context.createGain(); out.gain.value = Math.min(1, placement.level);
        const air = context.createBiquadFilter(); air.type = 'lowpass'; air.frequency.value = Math.max(600, 18_000 - (placement.distance ?? 0) * 22);
        const stereo = context.createStereoPanner();
        stereo.pan.value = stress ? (music?.channel === 1 ? 0.8 : -0.8) : (placement.pan ?? 0);
        out.connect(air).connect(stereo).connect(master);
        return { context, noise, now, out, random };
      } };
      const timing = [];
      for (const entry of cases) {
        stress = entry.name.startsWith('saturated');
        timing.push({ name: entry.name, at: now, seconds: entry.seconds });
        if (music !== null && entry.name.startsWith('saturated')) {
          music.buffers.forEach((buffer, i) => {
            const source = context.createBufferSource(); source.buffer = buffer; source.loop = true;
            const gain = context.createGain(); gain.gain.value = music.gains[i];
            source.connect(gain).connect(master);
            // Preserve stem phase, placing the loudest decoded passage on the pressure transient.
            source.start(now - 0.05, music.peakAt - 0.065);
            source.stop(now + entry.seconds - 0.05);
          });
        }
        entry.play(bus); now += entry.seconds;
      }
      const rendered = await context.startRendering();
      const channels = Array.from({ length: rendered.numberOfChannels }, (_, i) => rendered.getChannelData(i));
      const stats = timing.map(entry => {
        const start = Math.floor(entry.at * sampleRate);
        const stop = Math.min(rendered.length, Math.floor((entry.at + entry.seconds) * sampleRate));
        let peak = 0, squares = 0, clipped = 0, nonfinite = 0, bass = 0, difference = 0;
        const alpha = 1 - Math.exp(-2 * Math.PI * 200 / sampleRate);
        for (const samples of channels) {
          let low = 0, previous = 0;
          for (let i = start; i < stop; i++) {
            const sample = samples[i]; if (!Number.isFinite(sample)) nonfinite++;
            peak = Math.max(peak, Math.abs(sample)); squares += sample * sample;
            if (Math.abs(sample) >= 1) clipped++;
            low += alpha * (sample - low); bass += low * low;
            difference += (sample - previous) ** 2; previous = sample;
          }
        }
        return { ...entry, peak, rms: Math.sqrt(squares / ((stop - start) * channels.length)), clipped, nonfinite,
          bassShare: bass / Math.max(squares, 1e-12), brightness: difference / Math.max(squares, 1e-12) };
      });
      const pcm = new Int16Array(rendered.length * channels.length);
      for (let i = 0; i < rendered.length; i++) for (let channel = 0; channel < channels.length; channel++) {
        pcm[i * channels.length + channel] = Math.round(Math.max(-1, Math.min(1, channels[channel][i])) * 32767);
      }
      const bytes = new Uint8Array(pcm.buffer);
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      return { sampleRate, channels: channels.length, seconds, noiseSeed, stats, pcm: btoa(binary), music: music === null ? null : { peak: music.peak, peakAt: music.peakAt, share: music.share, gains: music.gains, channel: music.channel } };
    }, { version, folder, withMusic, noiseSeed });
    const label = `${version}${withMusic ? '-music' : ''}${process.env.AUDIO_SEED === undefined ? '' : `-seed${noiseSeed}`}`;
    const pcm = Buffer.from(result.pcm, 'base64');
    const header = Buffer.alloc(44);
    header.write('RIFF', 0); header.writeUInt32LE(pcm.length + 36, 4); header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(result.channels, 22);
    header.writeUInt32LE(result.sampleRate, 24); header.writeUInt32LE(result.sampleRate * 2 * result.channels, 28);
    header.writeUInt16LE(2 * result.channels, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
    await writeFile(`${folder}/combat-sound-${label}.wav`, Buffer.concat([header, pcm]));
    const previewLength = Math.round(result.stats.find(entry => entry.name === 'saturated-volley').at * result.sampleRate) * 2 * result.channels;
    const previewHeader = Buffer.from(header);
    previewHeader.writeUInt32LE(previewLength + 36, 4); previewHeader.writeUInt32LE(previewLength, 40);
    await writeFile(`${folder}/combat-preview-${label}.wav`, Buffer.concat([previewHeader, pcm.subarray(0, previewLength)]));
    delete result.pcm;
    await writeFile(`${folder}/combat-sound-${label}.json`, JSON.stringify(result, null, 2));
    const peak = Math.max(...result.stats.map(entry => entry.peak));
    const clipped = result.stats.reduce((total, entry) => total + entry.clipped, 0);
    if (result.stats.some(entry => entry.nonfinite !== 0 || entry.peak <= 0) || (version !== 'before' && clipped > 0)) throw new Error(`${version}: silent, clipped or nonfinite sound`);
    console.log(`${label}: ${result.stats.length} actual Web Audio clips, ${result.seconds.toFixed(1)}s, peak ${peak.toFixed(3)}, ${clipped} clipped samples, no nonfinite samples`);
  }
} finally { await browser.close(); }
