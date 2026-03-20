#!/usr/bin/env python3
import argparse
import math
from dataclasses import dataclass
from typing import List, Tuple, Optional

import cv2
import numpy as np

try:
    import fitz  # PyMuPDF
except Exception:  # pragma: no cover - handled in runtime instructions
    fitz = None


Point = Tuple[float, float]


@dataclass
class LineSegment:
    p1: Point
    p2: Point
    length: float
    angle: float  # radians, normalized to [0, pi)


@dataclass
class LineGroup:
    dir: np.ndarray  # unit direction vector
    p0: np.ndarray   # point on the line
    min_t: float
    max_t: float
    segments: List[LineSegment]

    def span_length(self) -> float:
        return max(0.0, self.max_t - self.min_t)

    def coverage_ratio(self) -> float:
        total = sum(s.length for s in self.segments)
        span = self.span_length()
        if span <= 1e-6:
            return 1.0
        return min(1.0, total / span)


@dataclass
class GraphComponent:
    indices: List[int]
    total_length: float


@dataclass
class ArrowHead:
    tip: Point
    direction: np.ndarray  # unit vector from base to tip


def normalize_angle(angle: float) -> float:
    angle = angle % math.pi
    return angle


def segment_from_hough(x1, y1, x2, y2) -> LineSegment:
    dx = x2 - x1
    dy = y2 - y1
    length = math.hypot(dx, dy)
    angle = normalize_angle(math.atan2(dy, dx))
    return LineSegment((x1, y1), (x2, y2), length, angle)


def point_line_distance(p: np.ndarray, p0: np.ndarray, dir_vec: np.ndarray) -> float:
    v = p - p0
    proj = np.dot(v, dir_vec)
    perp = v - proj * dir_vec
    return float(np.hypot(perp[0], perp[1]))


def project_t(p: np.ndarray, p0: np.ndarray, dir_vec: np.ndarray) -> float:
    return float(np.dot(p - p0, dir_vec))


def can_merge(seg: LineSegment, group: LineGroup, angle_thresh: float, dist_thresh: float, gap_thresh: float) -> bool:
    group_angle = math.atan2(group.dir[1], group.dir[0])
    if abs(seg.angle - group_angle) > angle_thresh:
        if abs((seg.angle + math.pi) - group_angle) > angle_thresh:
            return False

    p1 = np.array(seg.p1, dtype=float)
    p2 = np.array(seg.p2, dtype=float)
    d1 = point_line_distance(p1, group.p0, group.dir)
    d2 = point_line_distance(p2, group.p0, group.dir)
    if d1 > dist_thresh or d2 > dist_thresh:
        return False

    t1 = project_t(p1, group.p0, group.dir)
    t2 = project_t(p2, group.p0, group.dir)
    seg_min = min(t1, t2)
    seg_max = max(t1, t2)

    if seg_min <= group.max_t + gap_thresh and seg_max >= group.min_t - gap_thresh:
        return True
    return False


def merge_segment(group: LineGroup, seg: LineSegment) -> None:
    p1 = np.array(seg.p1, dtype=float)
    p2 = np.array(seg.p2, dtype=float)
    t1 = project_t(p1, group.p0, group.dir)
    t2 = project_t(p2, group.p0, group.dir)
    group.min_t = min(group.min_t, t1, t2)
    group.max_t = max(group.max_t, t1, t2)
    group.segments.append(seg)


def build_groups(segments: List[LineSegment], angle_thresh: float, dist_thresh: float, gap_thresh: float) -> List[LineGroup]:
    groups: List[LineGroup] = []
    for seg in segments:
        merged = False
        for grp in groups:
            if can_merge(seg, grp, angle_thresh, dist_thresh, gap_thresh):
                merge_segment(grp, seg)
                merged = True
                break
        if not merged:
            p1 = np.array(seg.p1, dtype=float)
            p2 = np.array(seg.p2, dtype=float)
            dir_vec = p2 - p1
            norm = np.hypot(dir_vec[0], dir_vec[1])
            if norm < 1e-6:
                continue
            dir_vec = dir_vec / norm
            t1 = project_t(p1, p1, dir_vec)
            t2 = project_t(p2, p1, dir_vec)
            grp = LineGroup(dir=dir_vec, p0=p1, min_t=min(t1, t2), max_t=max(t1, t2), segments=[seg])
            groups.append(grp)
    return groups


def skeletonize(binary: np.ndarray) -> np.ndarray:
    skel = np.zeros(binary.shape, np.uint8)
    element = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
    img = binary.copy()
    while True:
        eroded = cv2.erode(img, element)
        temp = cv2.dilate(eroded, element)
        temp = cv2.subtract(img, temp)
        skel = cv2.bitwise_or(skel, temp)
        img = eroded.copy()
        if cv2.countNonZero(img) == 0:
            break
    return skel


def mask_rect_symbols(binary: np.ndarray, min_area: int = 2000, dilate: int = 5) -> np.ndarray:
    # Remove large rectangular/box-like symbols that can be mistaken as pipes.
    mask = np.zeros(binary.shape, dtype=np.uint8)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area:
            continue
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        if len(approx) == 4 and cv2.isContourConvex(approx):
            x, y, w, h = cv2.boundingRect(approx)
            if w < 30 or h < 30:
                continue
            rect_area = float(w * h)
            if rect_area <= 0:
                continue
            rectangularity = area / rect_area
            if rectangularity > 0.75:
                cv2.drawContours(mask, [approx], -1, 255, thickness=cv2.FILLED)
    if dilate > 0:
        k = cv2.getStructuringElement(cv2.MORPH_RECT, (dilate, dilate))
        mask = cv2.dilate(mask, k, iterations=1)
    cleaned = cv2.bitwise_and(binary, cv2.bitwise_not(mask))
    return cleaned


def build_device_mask(
    binary: np.ndarray,
    min_area: int = 3500,
    fill_ratio: float = 0.35,
    dilate: int = 7,
    close_ksize: int = 5,
    open_ksize: int = 5,
) -> np.ndarray:
    # Build a conservative mask for large closed/compact device shapes.
    # Use opening to suppress thin pipelines before closing/filling device bodies.
    open_k = cv2.getStructuringElement(cv2.MORPH_RECT, (open_ksize, open_ksize))
    opened = cv2.morphologyEx(binary, cv2.MORPH_OPEN, open_k, iterations=1)

    close_k = cv2.getStructuringElement(cv2.MORPH_RECT, (close_ksize, close_ksize))
    closed = cv2.morphologyEx(opened, cv2.MORPH_CLOSE, close_k, iterations=1)

    # Fill holes to make closed device outlines solid.
    h, w = closed.shape
    flood = closed.copy()
    mask = np.zeros((h + 2, w + 2), np.uint8)
    # Assume background is 0, foreground is 255
    cv2.floodFill(flood, mask, (0, 0), 255)
    flood_inv = cv2.bitwise_not(flood)
    filled = cv2.bitwise_or(closed, flood_inv)

    device_mask = np.zeros_like(binary)
    contours, _ = cv2.findContours(filled, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area:
            continue
        x, y, bw, bh = cv2.boundingRect(cnt)
        bbox_area = float(bw * bh)
        if bbox_area <= 1.0:
            continue
        ratio = area / bbox_area
        if ratio < fill_ratio:
            continue
        cv2.drawContours(device_mask, [cnt], -1, 255, thickness=cv2.FILLED)

    if dilate > 0:
        k = cv2.getStructuringElement(cv2.MORPH_RECT, (dilate, dilate))
        device_mask = cv2.dilate(device_mask, k, iterations=1)
    return device_mask


def segment_overlaps_mask(seg: LineSegment, mask: np.ndarray, step: int = 4) -> float:
    h, w = mask.shape
    x1, y1 = seg.p1
    x2, y2 = seg.p2
    length = max(1.0, seg.length)
    n = max(2, int(length // step))
    hit = 0
    for i in range(n + 1):
        t = i / n
        x = int(round(x1 + (x2 - x1) * t))
        y = int(round(y1 + (y2 - y1) * t))
        if 0 <= x < w and 0 <= y < h and mask[y, x] > 0:
            hit += 1
    return hit / float(n + 1)


def render_pdf_to_image(pdf_path: str, page_index: int, dpi: int) -> np.ndarray:
    if fitz is None:
        raise RuntimeError("PyMuPDF (fitz) not installed.")
    doc = fitz.open(pdf_path)
    page = doc.load_page(page_index)
    mat = fitz.Matrix(dpi / 72.0, dpi / 72.0)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    if img.shape[2] == 4:
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
    return img


def draw_dashed_line(img: np.ndarray, p1: Point, p2: Point, color: Tuple[int, int, int], thickness: int = 2, dash: int = 12, gap: int = 8) -> None:
    x1, y1 = p1
    x2, y2 = p2
    length = math.hypot(x2 - x1, y2 - y1)
    if length < 1e-6:
        return
    vx = (x2 - x1) / length
    vy = (y2 - y1) / length
    dist = 0.0
    while dist < length:
        start = dist
        end = min(dist + dash, length)
        sx = x1 + vx * start
        sy = y1 + vy * start
        ex = x1 + vx * end
        ey = y1 + vy * end
        cv2.line(img, (int(sx), int(sy)), (int(ex), int(ey)), color, thickness, cv2.LINE_AA)
        dist += dash + gap


def detect_filled_arrows(binary: np.ndarray, min_area: int = 30, max_area: int = 600) -> List[ArrowHead]:
    # Detect filled triangular arrowheads on a binary image (white foreground).
    arrows: List[ArrowHead] = []
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.03 * peri, True)
        if len(approx) != 3:
            continue
        if not cv2.isContourConvex(approx):
            continue
        pts = approx.reshape(-1, 2).astype(float)
        # compute angles at each vertex, find the sharpest (smallest angle)
        angles = []
        for i in range(3):
            p = pts[i]
            p_prev = pts[(i - 1) % 3]
            p_next = pts[(i + 1) % 3]
            v1 = p_prev - p
            v2 = p_next - p
            n1 = np.linalg.norm(v1)
            n2 = np.linalg.norm(v2)
            if n1 < 1e-6 or n2 < 1e-6:
                angle = math.pi
            else:
                cosang = float(np.dot(v1, v2) / (n1 * n2))
                cosang = max(-1.0, min(1.0, cosang))
                angle = math.acos(cosang)
            angles.append(angle)
        tip_idx = int(np.argmin(angles))
        tip = pts[tip_idx]
        if angles[tip_idx] > math.radians(55):
            continue
        base_pts = [pts[(tip_idx + 1) % 3], pts[(tip_idx + 2) % 3]]
        base_center = (base_pts[0] + base_pts[1]) / 2.0
        direction = tip - base_center
        norm = np.linalg.norm(direction)
        if norm < 1e-6:
            continue
        direction = direction / norm
        arrows.append(ArrowHead(tip=(float(tip[0]), float(tip[1])), direction=direction))
    return arrows


def closest_group_for_arrow(groups: List[LineGroup], arrow: ArrowHead, dist_thresh: float, angle_thresh: float) -> Optional[int]:
    tip = np.array(arrow.tip, dtype=float)
    best = None
    best_dist = 1e9
    for i, grp in enumerate(groups):
        # distance from arrow tip to line
        d = point_line_distance(tip, grp.p0, grp.dir)
        if d > dist_thresh:
            continue
        # ensure tip projects near line span
        t = project_t(tip, grp.p0, grp.dir)
        if t < grp.min_t - dist_thresh or t > grp.max_t + dist_thresh:
            continue
        # alignment of arrow direction with line direction
        dir_unit = grp.dir / (np.linalg.norm(grp.dir) + 1e-9)
        cosang = float(np.dot(dir_unit, arrow.direction))
        cosang = max(-1.0, min(1.0, cosang))
        ang = math.acos(cosang)
        if ang > angle_thresh:
            continue
        if d < best_dist:
            best_dist = d
            best = i
    return best


def build_adjacency(groups: List[LineGroup], endpoint_thresh: float) -> List[List[int]]:
    # Build adjacency graph by endpoint proximity
    endpoints: List[Tuple[np.ndarray, int]] = []
    for idx, grp in enumerate(groups):
        p_start = grp.p0 + grp.min_t * grp.dir
        p_end = grp.p0 + grp.max_t * grp.dir
        endpoints.append((p_start, idx))
        endpoints.append((p_end, idx))

    adj = [[] for _ in groups]
    for i in range(len(endpoints)):
        p_i, g_i = endpoints[i]
        for j in range(i + 1, len(endpoints)):
            p_j, g_j = endpoints[j]
            if g_i == g_j:
                continue
            if np.hypot(p_i[0] - p_j[0], p_i[1] - p_j[1]) <= endpoint_thresh:
                adj[g_i].append(g_j)
                adj[g_j].append(g_i)
    return adj


def connected_components(groups: List[LineGroup], endpoint_thresh: float) -> List[GraphComponent]:
    adj = build_adjacency(groups, endpoint_thresh)
    visited = [False] * len(groups)
    components: List[GraphComponent] = []
    for i in range(len(groups)):
        if visited[i]:
            continue
        stack = [i]
        visited[i] = True
        comp = []
        total = 0.0
        while stack:
            cur = stack.pop()
            comp.append(cur)
            total += groups[cur].span_length()
            for nxt in adj[cur]:
                if not visited[nxt]:
                    visited[nxt] = True
                    stack.append(nxt)
        components.append(GraphComponent(indices=comp, total_length=total))
    return components


def main():
    parser = argparse.ArgumentParser(description="Extract straight/dashed pipelines from scanned P&ID image/PDF.")
    parser.add_argument("input", help="Input image/PDF path")
    parser.add_argument("output", help="Output PNG path")
    parser.add_argument("--debug", action="store_true", help="Write debug intermediate images")
    parser.add_argument("--page", type=int, default=0, help="Page index (0-based)")
    parser.add_argument("--dpi", type=int, default=400, help="Render DPI")
    parser.add_argument("--width", type=int, default=0, help="Resize width (pixels), 0 keeps original")
    parser.add_argument("--height", type=int, default=0, help="Resize height (pixels), 0 keeps original")
    parser.add_argument("--min-line-length", type=int, default=30, help="Hough min line length")
    parser.add_argument("--max-line-gap", type=int, default=10, help="Hough max line gap")
    parser.add_argument("--hough-threshold", type=int, default=40, help="Hough threshold")
    parser.add_argument("--angle-thresh", type=float, default=math.radians(5), help="Merge angle threshold (radians)")
    parser.add_argument("--dist-thresh", type=float, default=3.0, help="Merge perpendicular distance threshold (px)")
    parser.add_argument("--gap-thresh", type=float, default=20.0, help="Merge gap threshold (px)")
    parser.add_argument("--min-span-length", type=int, default=80, help="Minimum merged line span to keep")
    parser.add_argument("--min-coverage", type=float, default=0.55, help="Minimum coverage ratio to keep as solid pipe")
    parser.add_argument("--rect-min-area", type=int, default=2000, help="Min area for rectangle symbol masking")
    parser.add_argument("--rect-dilate", type=int, default=5, help="Dilation size for rectangle mask")
    parser.add_argument("--device-min-area", type=int, default=3500, help="Min area for device mask")
    parser.add_argument("--device-fill-ratio", type=float, default=0.35, help="Min fill ratio for device mask")
    parser.add_argument("--device-dilate", type=int, default=7, help="Dilation size for device mask")
    parser.add_argument("--device-close", type=int, default=5, help="Close kernel size for device mask")
    parser.add_argument("--device-open", type=int, default=5, help="Open kernel size for device mask")
    parser.add_argument("--device-overlap", type=float, default=0.3, help="Max allowed overlap of line with device mask")
    parser.add_argument("--endpoint-thresh", type=float, default=12.0, help="Endpoint distance to connect groups (px)")
    parser.add_argument("--component-min-length", type=int, default=160, help="Min total length for connected component")
    parser.add_argument("--arrow-min-area", type=int, default=30, help="Min arrowhead area (px^2)")
    parser.add_argument("--arrow-max-area", type=int, default=600, help="Max arrowhead area (px^2)")
    parser.add_argument("--arrow-line-dist", type=float, default=10.0, help="Max distance from arrow to line (px)")
    parser.add_argument("--arrow-angle", type=float, default=math.radians(20), help="Max angle diff arrow vs line (rad)")
    args = parser.parse_args()

    if args.input.lower().endswith(".pdf"):
        img = render_pdf_to_image(args.input, args.page, args.dpi)
    else:
        img = cv2.imread(args.input)
        if img is None:
            raise RuntimeError(f"Failed to read input image: {args.input}")
    if args.width > 0 and args.height > 0:
        img = cv2.resize(img, (args.width, args.height), interpolation=cv2.INTER_AREA)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.medianBlur(gray, 3)
    binary_raw = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 21, 5
    )

    arrows = detect_filled_arrows(binary_raw, min_area=args.arrow_min_area, max_area=args.arrow_max_area)

    binary = mask_rect_symbols(binary_raw, min_area=args.rect_min_area, dilate=args.rect_dilate)
    device_mask = build_device_mask(
        binary_raw,
        min_area=args.device_min_area,
        fill_ratio=args.device_fill_ratio,
        dilate=args.device_dilate,
        close_ksize=args.device_close,
        open_ksize=args.device_open,
    )
    skel = skeletonize(binary)

    if args.debug:
        cv2.imwrite("debug_binary_raw.png", binary_raw)
        cv2.imwrite("debug_binary_clean.png", binary)
        cv2.imwrite("debug_device_mask.png", device_mask)
        cv2.imwrite("debug_skeleton.png", skel)

    lines = cv2.HoughLinesP(
        skel,
        rho=1,
        theta=np.pi / 180,
        threshold=args.hough_threshold,
        minLineLength=args.min_line_length,
        maxLineGap=args.max_line_gap,
    )

    if args.debug:
        edges_vis = cv2.cvtColor(skel, cv2.COLOR_GRAY2BGR)
        if lines is not None:
            for l in lines:
                x1, y1, x2, y2 = l[0]
                cv2.line(edges_vis, (x1, y1), (x2, y2), (0, 0, 255), 1, cv2.LINE_AA)
        cv2.imwrite("debug_hough.png", edges_vis)

    segments: List[LineSegment] = []
    if lines is not None:
        for l in lines:
            x1, y1, x2, y2 = l[0]
            seg = segment_from_hough(x1, y1, x2, y2)
            if seg.length >= args.min_line_length:
                if segment_overlaps_mask(seg, device_mask) > args.device_overlap:
                    continue
                segments.append(seg)

    groups = build_groups(segments, args.angle_thresh, args.dist_thresh, args.gap_thresh)
    components = connected_components(groups, args.endpoint_thresh)
    keep_group = set()
    for comp in components:
        if comp.total_length >= args.component_min_length:
            for idx in comp.indices:
                keep_group.add(idx)

    out = img.copy()
    arrow_assignments = {}
    for ar in arrows:
        gi = closest_group_for_arrow(groups, ar, args.arrow_line_dist, args.arrow_angle)
        if gi is not None:
            arrow_assignments.setdefault(gi, []).append(ar)

    for gi, grp in enumerate(groups):
        if gi not in keep_group:
            continue
        if grp.span_length() < args.min_span_length:
            continue
        p_start = grp.p0 + grp.min_t * grp.dir
        p_end = grp.p0 + grp.max_t * grp.dir
        p1 = (float(p_start[0]), float(p_start[1]))
        p2 = (float(p_end[0]), float(p_end[1]))

        dashed = (len(grp.segments) >= 3 and grp.coverage_ratio() < args.min_coverage)
        if dashed:
            draw_dashed_line(out, p1, p2, (255, 0, 0), thickness=2, dash=12, gap=8)
        else:
            cv2.line(out, (int(p1[0]), int(p1[1])), (int(p2[0]), int(p2[1])), (0, 0, 255), 2, cv2.LINE_AA)

        # draw flow direction arrows if detected
        if gi in arrow_assignments:
            for ar in arrow_assignments[gi]:
                tip = np.array(ar.tip, dtype=float)
                base = tip - ar.direction * 18.0
                cv2.arrowedLine(
                    out,
                    (int(base[0]), int(base[1])),
                    (int(tip[0]), int(tip[1])),
                    (0, 180, 0),
                    2,
                    cv2.LINE_AA,
                    tipLength=0.4,
                )

    cv2.imwrite(args.output, out)


if __name__ == "__main__":
    main()
