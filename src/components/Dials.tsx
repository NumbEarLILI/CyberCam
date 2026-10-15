import { useEffect, useRef, useState } from "react";
import { advanceDial, projectMove } from "../lib/dial";
import { APERTURE_VALUES, ISO_VALUES, SHUTTER_VALUES, formatAperture, formatShutter } from "../lib/exposure";

type Props = {
  iso: number;
  shutter: number;
  aperture: number;
  /** +1 lets in more light. −1 lets in less. */
  onIso: (delta: number) => void;
  onShutter: (delta: number) => void;
  onAperture: (delta: number) => void;
};

const SLOT = 52;

export function ExposureDials({ iso, shutter, aperture, onIso, onShutter, onAperture }: Props) {
  const isoLabels = ISO_VALUES.map(String);
  const shutterLabels = [...SHUTTER_VALUES].reverse().map((item) => item.label);
  const apertureLabels = [...APERTURE_VALUES].reverse().map((item) => formatAperture(item));
  return (
    <div className="meter">
      <Dial label="ISO" labels={isoLabels} value={String(iso)} onStep={onIso} />
      <Dial label="快门" labels={shutterLabels} value={formatShutter(shutter)} onStep={onShutter} />
      <Dial label="光圈" labels={apertureLabels} value={formatAperture(aperture)} onStep={onAperture} />
    </div>
  );
}

function Dial({
  label,
  labels,
  value,
  onStep,
}: {
  label: string;
  labels: string[];
  value: string;
  onStep: (delta: number) => void;
}) {
  const index = Math.max(0, labels.indexOf(value));
  const rootRef = useRef<HTMLDivElement>(null);
  const tapeRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ pointer: -1, x: 0, y: 0, axisX: 1, axisY: 0, carry: 0, index });
  const [preview, setPreview] = useState<number | null>(null);
  const [nudge, setNudge] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const shown = preview ?? index;

  useEffect(() => {
    if (preview != null && index === preview) setPreview(null);
  }, [index, preview]);

  function place(rest: number, axisX: number, axisY: number) {
    const tape = tapeRef.current;
    if (!tape) return;
    const length = Math.hypot(axisX, axisY) || 1;
    const local = screenDeltaToLocal(tape, (-rest * axisX) / length, (-rest * axisY) / length);
    setNudge(local);
  }

  function moveBy(dx: number, dy: number) {
    const gesture = drag.current;
    gesture.carry += projectMove(dx, dy, gesture.axisX, gesture.axisY);
    const turned = advanceDial(gesture.index, labels.length, gesture.carry, SLOT);
    gesture.carry = turned.carry;
    gesture.index = turned.index;
    if (turned.steps !== 0) {
      setPreview(turned.index);
      onStep(turned.steps);
      navigator.vibrate?.(6);
    }
    place(gesture.carry, gesture.axisX, gesture.axisY);
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const axis = dialAxis(event.currentTarget);
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, ...axis, carry: 0, index: shown };
    setDragging(true);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = drag.current;
    if (gesture.pointer !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    gesture.x = event.clientX;
    gesture.y = event.clientY;
    moveBy(dx, dy);
  }

  function endPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (drag.current.pointer !== event.pointerId) return;
    drag.current.pointer = -1;
    drag.current.carry = 0;
    setDragging(false);
    setPreview(drag.current.index);
    setNudge({ x: 0, y: 0 });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      onStep(1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      onStep(-1);
    }
  }

  const prev = shown > 0 ? labels[shown - 1] : "";
  const next = shown < labels.length - 1 ? labels[shown + 1] : "";
  return (
    <div
      ref={rootRef}
      className={dragging ? "chip dial is-dragging" : "chip dial"}
      role="slider"
      tabIndex={0}
      aria-label={`${label}，左右滑动调整`}
      aria-valuemin={0}
      aria-valuemax={labels.length - 1}
      aria-valuenow={shown}
      aria-valuetext={labels[shown]}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onKeyDown={onKeyDown}
    >
      <span className="meta">{label}</span>
      <div className="dial-window">
        <i className="dial-index" aria-hidden="true" />
        <div
          ref={tapeRef}
          className="dial-tape"
          style={{ transform: `translate(calc(-50% + ${nudge.x}px), calc(-50% + ${nudge.y}px))` }}
        >
          <span className={prev ? "is-prev" : "is-empty"}>{prev}</span>
          <span className="is-current">{labels[shown]}</span>
          <span className={next ? "is-next" : "is-empty"}>{next}</span>
        </div>
      </div>
    </div>
  );
}

function dialAxis(root: HTMLElement) {
  const current = root.querySelector(".is-current");
  const next = root.querySelector(".is-next");
  const prev = root.querySelector(".is-prev");
  const currentBox = current?.getBoundingClientRect();
  const nextBox = next?.getBoundingClientRect();
  const prevBox = prev?.getBoundingClientRect();
  const center = (box: DOMRect) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
  if (currentBox && nextBox) {
    const from = center(currentBox);
    const to = center(nextBox);
    return { axisX: to.x - from.x, axisY: to.y - from.y };
  }
  if (currentBox && prevBox) {
    const from = center(prevBox);
    const to = center(currentBox);
    return { axisX: to.x - from.x, axisY: to.y - from.y };
  }
  return { axisX: 1, axisY: 0 };
}

function screenDeltaToLocal(element: HTMLElement, screenX: number, screenY: number) {
  let matrix = new DOMMatrix();
  let node = element.parentElement;
  while (node) {
    const transform = getComputedStyle(node).transform;
    if (transform && transform !== "none") matrix = new DOMMatrix(transform).multiply(matrix);
    node = node.parentElement;
  }
  const inverse = matrix.inverse();
  const point = inverse.transformPoint(new DOMPoint(screenX, screenY));
  const origin = inverse.transformPoint(new DOMPoint(0, 0));
  return { x: point.x - origin.x, y: point.y - origin.y };
}
