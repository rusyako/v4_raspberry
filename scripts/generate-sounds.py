import struct
import wave
import math
import os

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'frontend', 'public', 'audio')
SAMPLE_RATE = 44100
BITS = 16
MAX_AMP = 32767
FADE_MS = 30

# Sound definitions: (name, list of (freq_hz, duration_ms, amp_factor))
SOUNDS = {
    'access-granted':  [(523, 200, 0.8), (659, 200, 0.8), (784, 300, 0.9)],       # C5→E5→G5 ascending
    'access-denied':   [(392, 200, 0.8), (330, 200, 0.8), (262, 350, 0.9)],       # G4→E4→C4 descending
    'select-action':   [(523, 180, 0.7), (0, 120, 0), (659, 180, 0.7)],            # C5 ... E5
    'take-scan':       [(392, 350, 0.7)],                                           # G4 mid tone
    'return-scan':     [(330, 350, 0.7)],                                           # E4 mid-low tone
    'success-take':    [(523, 180, 0.7), (659, 180, 0.7), (784, 350, 0.8)],       # C5 E5 G5 asc
    'success-return':  [(784, 180, 0.7), (659, 180, 0.7), (523, 350, 0.8)],       # G5 E5 C5 desc
    'close-door':      [(262, 200, 0.6)],                                           # C4 short low
}

LANGS = ['ru', 'kz', 'en']


def fade(samples, fade_samples):
    if fade_samples <= 0 or len(samples) < 2 * fade_samples:
        return samples
    for i in range(fade_samples):
        factor = i / fade_samples
        samples[i] = int(samples[i] * factor)
        samples[-1 - i] = int(samples[-1 - i] * factor)
    return samples


def generate_tone(freq, duration_ms, amp_factor):
    num_samples = int(SAMPLE_RATE * duration_ms / 1000.0)
    samples = []
    for i in range(num_samples):
        t = i / SAMPLE_RATE
        if freq > 0:
            val = int(MAX_AMP * amp_factor * math.sin(2 * math.pi * freq * t))
        else:
            val = 0
        samples.append(val)
    fade_len = int(SAMPLE_RATE * FADE_MS / 1000.0)
    return fade(samples, fade_len)


def write_wav(filepath, all_samples):
    with wave.open(filepath, 'w') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(BITS // 8)
        wf.setframerate(SAMPLE_RATE)
        packed = struct.pack(f'<{len(all_samples)}h', *all_samples)
        wf.writeframes(packed)


def normalize(samples):
    if not samples:
        return samples
    peak = max(abs(s) for s in samples)
    if peak == 0:
        return samples
    factor = MAX_AMP * 0.9 / peak
    return [int(s * factor) for s in samples]


def main():
    for lang in LANGS:
        lang_dir = os.path.join(OUT_DIR, lang)
        os.makedirs(lang_dir, exist_ok=True)

    for name, segments in SOUNDS.items():
        all_samples = []
        for freq, dur, amp in segments:
            all_samples.extend(generate_tone(freq, dur, amp))
        normalized = normalize(all_samples)

        for lang in LANGS:
            filepath = os.path.join(OUT_DIR, lang, f'{name}.wav')
            write_wav(filepath, normalized)
            size_kb = os.path.getsize(filepath) / 1024
            print(f'  {lang}/{name}.wav ({size_kb:.1f} KB)')

    print(f'\nDone: {len(SOUNDS)} sounds x {len(LANGS)} langs = {len(SOUNDS) * len(LANGS)} files')
    print(f'Output: {OUT_DIR}')


if __name__ == '__main__':
    main()
