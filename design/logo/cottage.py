"""Draws the stone cottage logo variants as SVG: line-drawn stone walls, a red roof,
a chimney, and one stone shaped like a heart."""
import math
import random
import sys

INK = '#1d1d1b'
RED = '#b8432f'
PAPER = '#f6f1e6'


def smooth(points, tension=0.5):
    """Closed Catmull-Rom curve through the points, as an SVG path."""
    n = len(points)
    d = f'M{points[0][0]:.1f},{points[0][1]:.1f}'
    for i in range(n):
        p0, p1, p2, p3 = points[i - 1], points[i], points[(i + 1) % n], points[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) * tension / 3, p1[1] + (p2[1] - p0[1]) * tension / 3)
        c2 = (p2[0] - (p3[0] - p1[0]) * tension / 3, p2[1] - (p3[1] - p1[1]) * tension / 3)
        d += f' C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}'
    return d + 'Z'


def stone(rng, x0, y0, x1, y1, gap, wob):
    """A dressed stone: a softly rounded block, each corner a little different."""
    x0, y0, x1, y1 = x0 + gap, y0 + gap, x1 - gap, y1 - gap
    m = min(x1 - x0, y1 - y0)
    j = lambda: rng.uniform(-wob, wob) * 0.5
    c = [(x0 + j(), y0 + j()), (x1 + j(), y0 + j()), (x1 + j(), y1 + j()), (x0 + j(), y1 + j())]
    r = [m * rng.uniform(0.22, 0.42) for _ in range(4)]
    def toward(a, b, d):
        L = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
        return (a[0] + (b[0] - a[0]) * d / L, a[1] + (b[1] - a[1]) * d / L)
    d = ''
    for i in range(4):
        p, prev, nxt = c[i], c[i - 1], c[(i + 1) % 4]
        a, b = toward(p, prev, r[i]), toward(p, nxt, r[i])
        d += (f'M{a[0]:.1f},{a[1]:.1f}' if i == 0 else f' L{a[0]:.1f},{a[1]:.1f}') + f' Q{p[0]:.1f},{p[1]:.1f} {b[0]:.1f},{b[1]:.1f}'
    return d + 'Z'


def heart(cx, cy, w, h):
    """A heart-shaped stone, a little soft so it reads as a stone, not an emoji."""
    t, b = cy - h * 0.42, cy + h * 0.5
    l, r = cx - w / 2, cx + w / 2
    return (f'M{cx:.1f},{cy - h * 0.18:.1f} '
            f'C{cx - w * 0.08:.1f},{t:.1f} {l:.1f},{t - h * 0.02:.1f} {l + w * 0.02:.1f},{cy - h * 0.05:.1f} '
            f'C{l + w * 0.05:.1f},{cy + h * 0.2:.1f} {cx - w * 0.2:.1f},{cy + h * 0.32:.1f} {cx:.1f},{b:.1f} '
            f'C{cx + w * 0.2:.1f},{cy + h * 0.32:.1f} {r - w * 0.05:.1f},{cy + h * 0.2:.1f} {r - w * 0.02:.1f},{cy - h * 0.05:.1f} '
            f'C{r:.1f},{t - h * 0.02:.1f} {cx + w * 0.08:.1f},{t:.1f} {cx:.1f},{cy - h * 0.18:.1f}Z')


def wall(rng, x0, x1, y0, y1, course, wmin, wmax, holes, gap, wob):
    """Rows of stones between the openings. Returns (paths, cells)."""
    cells = []
    course = (y1 - y0) / max(1, round((y1 - y0) / course))
    y = y1
    row = 0
    while y - course > y0 - 0.5:
        ya, yb = y - course, y
        spans = [(x0, x1)]
        for hx0, hy0, hx1, hy1 in holes:
            if hy0 < yb - 1 and hy1 > ya + 1:
                nxt = []
                for a, b in spans:
                    if hx1 <= a or hx0 >= b:
                        nxt.append((a, b))
                    else:
                        if hx0 > a: nxt.append((a, hx0))
                        if hx1 < b: nxt.append((hx1, b))
                spans = nxt
        for a, b in spans:
            x = a
            first = True
            while b - x > 1:
                w = rng.uniform(wmin, wmax)
                if first and row % 2: w *= 0.55
                first = False
                if b - (x + w) < wmin * 0.6: w = b - x
                cells.append((x, ya, x + w, yb))
                x += w
        y -= course
        row += 1
    return cells


def cottage(seed=4, course=26, wmin=30, wmax=52, sw=3.2, gap=2.4, wob=2.2, smoke=False, roof='solid', heart_at=(0.72, 0.55), frame=True):
    rng = random.Random(seed)
    W = 400
    # Walls, door, window
    wx0, wx1, wy0, wy1 = 78, 322, 196, 352
    door = (172, 274, 228, wy1)
    win = (104, 236, 150, 286)
    holes = [door, win]
    cells = wall(rng, wx0, wx1, wy0, wy1, course, wmin, wmax, holes, gap, wob)
    # The heart: the cell nearest the chosen spot, right of the door, made a little bigger.
    tx, ty = wx0 + (wx1 - wx0) * heart_at[0], wy0 + (wy1 - wy0) * heart_at[1]
    real = (wy1 - wy0) / max(1, round((wy1 - wy0) / course))
    fits = [i for i, c in enumerate(cells) if 0.95 * real <= c[2] - c[0] <= 1.7 * real] or list(range(len(cells)))
    hi = min(fits, key=lambda i: (sum(cells[i][::2]) / 2 - tx) ** 2 + (sum(cells[i][1::2]) / 2 - ty) ** 2)
    out = []
    add = out.append
    add(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {W}" width="{W}" height="{W}">')
    if frame:
        add(f'<rect x="0" y="0" width="{W}" height="{W}" rx="88" fill="{PAPER}"/>')
    g = f'fill="none" stroke="{INK}" stroke-width="{sw}" stroke-linejoin="round" stroke-linecap="round"'
    # Chimney (behind the roof), made of stones
    cx0, cx1, cy0, cy1 = 254, 300, 96, 170
    ch_course = (cy1 - cy0) / max(2, round((cy1 - cy0) / (course * 0.95)))
    ch = []
    y, k = cy0, 0
    while y < cy1 - 1:
        split = cx0 + (cx1 - cx0) * (0.42 if k % 2 else 0.58)
        ch += [(cx0, y, split, y + ch_course), (split, y, cx1, y + ch_course)]
        y += ch_course
        k += 1
    add(f'<g {g}>')
    add(f'<rect x="{cx0}" y="{cy0}" width="{cx1 - cx0}" height="{cy1 - cy0}" fill="{PAPER}"/>')
    for c in ch:
        add(f'<path d="{stone(rng, *c, gap * 0.8, wob * 0.6)}" fill="{PAPER}"/>')
    add(f'<line x1="{cx0}" y1="{cy0}" x2="{cx0}" y2="{cy1}"/><line x1="{cx1}" y1="{cy0}" x2="{cx1}" y2="{cy1}"/>')
    add(f'<rect x="{cx0 - 6}" y="{cy0 - 10}" width="{cx1 - cx0 + 12}" height="11" rx="2" fill="{PAPER}"/>')
    if smoke:
        sx = (cx0 + cx1) / 2
        add(f'<path d="M{sx},{cy0 - 18} C{sx - 12},{cy0 - 30} {sx + 10},{cy0 - 40} {sx - 2},{cy0 - 54} C{sx - 10},{cy0 - 64} {sx + 6},{cy0 - 72} {sx + 2},{cy0 - 84}" stroke-width="{sw * 0.9}"/>')
    add('</g>')
    # Roof
    eave_l, eave_r, eave_y, apex = (52, 348, 202, (200, 92))
    roof_d = f'M{eave_l},{eave_y} L{apex[0]},{apex[1]} L{eave_r},{eave_y} Z'
    if roof == 'solid':
        add(f'<path d="{roof_d}" fill="{RED}" stroke="{INK}" stroke-width="{sw * 1.1}" stroke-linejoin="round"/>')
    else:  # red lines on paper, like a pen sketch of tiles
        add(f'<path d="{roof_d}" fill="{PAPER}" stroke="{INK}" stroke-width="{sw * 1.1}" stroke-linejoin="round"/>')
        add(f'<clipPath id="r{seed}"><path d="{roof_d}"/></clipPath><g clip-path="url(#r{seed})" stroke="{RED}" stroke-width="{sw * 1.6}" stroke-linecap="round">')
        y = eave_y - 10
        while y > apex[1]:
            add(f'<line x1="40" y1="{y}" x2="360" y2="{y}"/>')
            y -= 15
        add('</g>')
        add(f'<path d="{roof_d}" fill="none" stroke="{INK}" stroke-width="{sw * 1.1}" stroke-linejoin="round"/>')
    # Walls
    add(f'<g {g}>')
    for i, c in enumerate(cells):
        if i == hi:
            x0, y0, x1, y1 = c
            hh = (y1 - y0) - gap * 1.2
            add(f'<path d="{heart((x0 + x1) / 2, (y0 + y1) / 2 + hh * 0.04, min(x1 - x0 - gap * 2, hh * 1.2), hh)}" fill="{PAPER}"/>')
        else:
            add(f'<path d="{stone(rng, *c, gap, wob)}" fill="{PAPER}"/>')
    # Door: arched, planked
    dx0, dy0, dx1, dy1 = door
    r = (dx1 - dx0) / 2
    add(f'<path d="M{dx0 + 3},{dy1} L{dx0 + 3},{dy0 + r} A{r - 3},{r - 3} 0 0 1 {dx1 - 3},{dy0 + r} L{dx1 - 3},{dy1}" fill="{PAPER}"/>')
    add(f'<line x1="{(dx0 + dx1) / 2}" y1="{dy0 + 6}" x2="{(dx0 + dx1) / 2}" y2="{dy1}" stroke-width="{sw * 0.8}"/>')
    add(f'<circle cx="{dx1 - 13}" cy="{dy1 - 38}" r="{sw * 0.9}" fill="{INK}"/>')
    # Window with cross bars
    x0, y0, x1, y1 = win
    add(f'<rect x="{x0 + 3}" y="{y0 + 3}" width="{x1 - x0 - 6}" height="{y1 - y0 - 6}" rx="3" fill="{PAPER}"/>')
    add(f'<line x1="{(x0 + x1) / 2}" y1="{y0 + 3}" x2="{(x0 + x1) / 2}" y2="{y1 - 3}"/>')
    add(f'<line x1="{x0 + 3}" y1="{(y0 + y1) / 2}" x2="{x1 - 3}" y2="{(y0 + y1) / 2}"/>')
    # Ground line
    add(f'<path d="M60,{wy1 + 2} L340,{wy1 + 2}" stroke-width="{sw * 1.2}"/>')
    add('</g></svg>')
    return '\n'.join(out)


VARIANTS = {
    'a-classic': dict(seed=4),
    'b-bold': dict(seed=11, course=40, wmin=46, wmax=74, sw=6, gap=3.2, wob=2.6, heart_at=(0.74, 0.5)),
    'c-smoke': dict(seed=7, course=31, wmin=36, wmax=60, sw=4.4, gap=2.8, smoke=True, heart_at=(0.76, 0.6)),
    'd-sketch-roof': dict(seed=9, course=31, wmin=36, wmax=60, sw=4.4, gap=2.8, roof='lines', heart_at=(0.76, 0.6)),
}

if __name__ == '__main__':
    outdir = sys.argv[1]
    for name, kw in VARIANTS.items():
        open(f'{outdir}/{name}.svg', 'w').write(cottage(**kw))
        print(name)
