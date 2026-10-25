# Tracker

Video motion analysis for physics class, right in your phone's browser — a lightweight, mobile-first take on [Tracker](https://physlets.org/tracker/).

**Live:** https://vikrewww-glitch.github.io/video-tracker/

Everything runs locally. The video never leaves the device, and there is no sign-up.

## How it works
1. **Video**
   - Choose a video from your library or record a new one.
   - A built-in sample shows a ball in projectile motion.
2. **Calibrate**
   - The frame rate is read from the file automatically.
   - Pick the start and end frames.
   - Set the scale from an object of known length.
   - Place the origin and rotate the axes.
3. **Track**
   - Manual: tap the object and the video advances to the next frame.
   - Automatic: tap the object once and template matching follows it.
4. **Results**
   - Charts of x, y, vₓ, v_y, v, aₓ and a_y.
   - A data table.
   - Copy for Excel, CSV download, or save the chart as an image.

Velocity and acceleration use central differences. Smoothing is a local quadratic (Savitzky–Golay) fit, which leaves uniformly accelerated motion undistorted.

## Deploy
It is a static site with no build step. Push it to GitHub and enable **Settings → Pages → Deploy from a branch → `main` / root**.

To run it locally, use any static server (ES modules don't load from `file://`):

```sh
python3 -m http.server 8000
```

## Accuracy test
- `tools/make_test_video.py` renders a projectile with a known g.
- `tools/accuracy-test.mjs` drives the whole flow in headless Chrome on an emulated phone. It checks:
  - frame-accurate seeking;
  - g from manual taps (exact and jittered);
  - g from automatic tracking;
  - the layout (no horizontal scrolling).

```sh
python3 tools/make_test_video.py /tmp/throw30.mp4 --fps 30   # needs numpy + ffmpeg
npm i puppeteer-core
python3 -m http.server 8765 &
node tools/accuracy-test.mjs /tmp/throw30.mp4 /tmp/shots      # WIDTH=360 for a narrower screen
```

Typical results with g = 9.8 m/s²:

| Method | a_y |
| --- | --- |
| Automatic tracking | −9.81 ± 0.05 m/s² |
| Manual, exact taps | −9.82 m/s² |
| Manual, taps with ~4 mm jitter, strong smoothing | −9.86 m/s² |

## Notes
- HEVC video (the iPhone default) plays in Safari but may not open in Chrome on Android or Windows. Set **Settings → Camera → Formats → Most Compatible** to record H.264.
- The frame rate is read exactly from MP4/MOV files. For other formats it is estimated during playback, so double-check it in Calibrate.
