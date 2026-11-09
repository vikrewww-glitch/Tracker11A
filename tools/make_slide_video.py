#!/usr/bin/env python3
"""Генерирует видео: брусок толкают, и он скользит по столу, тормозя только из-за трения.

Разгон рукой с ускорением PUSH до скорости v0, затем торможение a = −μ·g до остановки.
Масштаб и линейка — как в make_test_video.py (500 пикс = 1 м, линейка x = 140…640, y = 660).

    python3 tools/make_slide_video.py out.mp4 --v0 1.6 --mu 0.31
Требуется numpy и ffmpeg.
"""
import argparse
import json
import subprocess

import numpy as np

W, H = 1280, 720
S = 500.0              # пикс/м
X0, Y0 = 150.0, 600.0  # центр бруска в начале, пикс
BW, BH = 64, 40        # размер бруска, пикс
PUSH = 6.0             # ускорение при толчке, м/с²


def position(t, a):
    """Координата центра бруска (м от старта) в момент t от начала видео."""
    dec = a.mu * a.g
    t1 = a.v0 / PUSH            # конец толчка
    t2 = t1 + a.v0 / dec        # остановка
    tt = t - a.lead
    if tt <= 0:
        return 0.0
    if tt <= t1:
        return 0.5 * PUSH * tt * tt
    s1 = 0.5 * PUSH * t1 * t1
    u = min(tt, t2) - t1
    return s1 + a.v0 * u - 0.5 * dec * u * u


def background():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    img = np.zeros((H, W, 3), np.float32)
    img[..., 0] = 222 + 12 * yy / H
    img[..., 1] = 226 + 8 * yy / H
    img[..., 2] = 232 - 6 * xx / W
    # Стол.
    img[int(Y0 + BH / 2):, :] = (176, 150, 120)
    img[int(Y0 + BH / 2):int(Y0 + BH / 2) + 3, :] = (120, 100, 80)
    # Линейка 1 м.
    img[650:671, 140:641] = (255, 214, 64)
    for i in range(11):
        x = int(140 + i * 50)
        h = 20 if i % 5 == 0 else 10
        img[650:650 + h, max(140, x - 1):min(641, x + 1)] = (40, 30, 20)
    return img


def main():
    p = argparse.ArgumentParser()
    p.add_argument('out')
    p.add_argument('--fps', type=float, default=30)
    p.add_argument('--g', type=float, default=9.8)
    p.add_argument('--mu', type=float, default=0.31)
    p.add_argument('--v0', type=float, default=1.6)
    p.add_argument('--lead', type=float, default=0.3)
    p.add_argument('--tail', type=float, default=0.4)
    p.add_argument('--noise', type=float, default=2.0)
    a = p.parse_args()

    dec = a.mu * a.g
    t1 = a.lead + a.v0 / PUSH
    t2 = t1 + a.v0 / dec
    duration = t2 + a.tail
    bg = background()
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    rng = np.random.default_rng(int(a.v0 * 100))
    n = int(round(duration * a.fps))
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
           '-s', f'{W}x{H}', '-r', str(a.fps), '-i', '-',
           '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', a.out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    truth = []
    for i in range(n):
        t = i / a.fps
        cx = X0 + position(t, a) * S
        truth.append({'frame': i, 't': t, 'x': cx, 'y': Y0})
        # Брусок со сглаженными краями: синий корпус и светлая полоса-метка.
        cov = (np.clip(BW / 2 + 0.5 - np.abs(xx - cx), 0, 1) * np.clip(BH / 2 + 0.5 - np.abs(yy - Y0), 0, 1))[..., None]
        body = np.where((np.abs(xx - cx) < 6)[..., None], np.array([240, 240, 250], np.float32), np.array([40, 90, 200], np.float32))
        img = bg * (1 - cov) + body * cov
        if a.noise:
            img += rng.normal(0, a.noise, img.shape)
        proc.stdin.write(np.clip(img, 0, 255).astype(np.uint8).tobytes())
    proc.stdin.close()
    proc.wait()
    with open(a.out + '.json', 'w') as f:
        json.dump({'fps': a.fps, 'g': a.g, 'mu': a.mu, 'v0': a.v0, 'scale_px_per_m': S,
                   'push_end': t1, 'stop': t2, 'frames': truth}, f, indent=1)
    print(f'{a.out}: {n} кадров, толчок до {t1:.3f} с, остановка в {t2:.3f} с, a = {-dec:.3f} м/с²')


if __name__ == '__main__':
    main()
