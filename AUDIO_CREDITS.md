# Audio credits

The portal capture uses a real vocal recording: **Male Screams [1]** by
**marc3122**, released under **Creative Commons Zero (CC0 1.0)**.

- Source: https://freesound.org/people/marc3122/sounds/556976/
- License: https://creativecommons.org/publicdomain/zero/1.0/
- Source preview: https://cdn.freesound.org/previews/556/556976_12497831-hq.mp3

The app embeds an excerpt from 0.60–1.75 seconds as mono PCM16 at 16 kHz,
with an 80 Hz high-pass filter and an 8 ms entrance fade. It plays for 700 ms
starting at the hands' grab cue, then cuts off as the player is pulled into
the portal. A 4 ms ending ramp prevents a digital click; there is no echo tail.
The recording works offline, without downloads or speech-synthesis support.

“Help me!” uses the browser/device speech voice when available. Portal and
explosion effects are synthesized locally with Web Audio. Mute, Skip, and Esc
stop active sounds immediately.
