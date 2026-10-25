#!/usr/bin/env python3
"""Генерирует тестовое видео броска мяча с известным g.

Масштаб: 500 пикс = 1 м (линейка 1 м нарисована внизу кадра, x = 140…640, y = 660).
Мяч стартует из (140, 600) пикс через LEAD секунд после начала видео.

    python3 tools/make_test_video.py out.mp4 --fps 30
Требуется numpy и ffmpeg.
"""
import argparse
import json
import subprocess

import numpy as np

W, H = 1280, 720
S = 500.0             # пикс/м
X0, Y0 = 140.0, 600.0  # старт мяча, пикс
R = 22.0               # радиус мяча, пикс


def ball_pos(t, a):
    """Положение мяча (пикс) в момент t от начала видео."""
    tf = 2 * a.vy / a.g  # время полёта
    tt = min(max(t - a.lead, 0.0), tf)
    x = X0 + a.vx * tt * S
    y = Y0 - (a.vy * tt - 0.5 * a.g * tt * tt) * S
    return x, y


def background():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    img = np.zeros((H, W, 3), np.float32)
    img[..., 0] = 214 + 18 * yy / H
    img[..., 1] = 226 + 10 * yy / H
    img[..., 2] = 240 - 6 * xx / W
    grid = ((xx % 50) < 1) | ((yy % 50) < 1)
    img[grid] *= 0.93
    # Пол.
    img[int(Y0 + R):, :] = (150, 140, 160)
    # Линейка 1 м: жёлтая полоса с делениями каждые 10 см.
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
    p.add_argument('--vx', type=float, default=1.5)
    p.add_argument('--vy', type=float, default=4.2)
    p.add_argument('--lead', type=float, default=0.2)
    p.add_argument('--duration', type=float, default=1.5)
    p.add_argument('--noise', type=float, default=2.0)
    a = p.parse_args()

    bg = background()
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    rng = np.random.default_rng(1)
    n = int(round(a.duration * a.fps))
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
           '-s', f'{W}x{H}', '-r', str(a.fps), '-i', '-',
           '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', a.out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    truth = []
    for i in range(n):
        t = i / a.fps
        bx, by = ball_pos(t, a)
        truth.append({'frame': i, 't': t, 'x': bx, 'y': by})
        img = bg.copy()
        d = np.hypot(xx - bx, yy - by)
        cov = np.clip(R + 0.5 - d, 0, 1)[..., None]           # сглаженный край
        shade = np.clip(1 - 0.35 * (d / R), 0.6, 1)[..., None]  # объём
        ball = np.array([255, 110, 40], np.float32) * shade
        img = img * (1 - cov) + ball * cov
        if a.noise:
            img += rng.normal(0, a.noise, img.shape)
        proc.stdin.write(np.clip(img, 0, 255).astype(np.uint8).tobytes())
    proc.stdin.close()
    proc.wait()
    with open(a.out + '.json', 'w') as f:
        json.dump({'fps': a.fps, 'g': a.g, 'scale_px_per_m': S, 'origin_px': [X0, Y0],
                   'lead': a.lead, 'flight': 2 * a.vy / a.g, 'frames': truth}, f, indent=1)
    print(f'{a.out}: {n} кадров, полёт {a.lead:.3f}…{a.lead + 2 * a.vy / a.g:.3f} с')


if __name__ == '__main__':
    main()
