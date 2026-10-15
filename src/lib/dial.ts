/** How far a finger has turned a dial. Positive carry moves toward the higher stop. */
export function advanceDial(index: number, count: number, carry: number, stepPx: number) {
  const rubber = 18;
  const size = Math.max(1, stepPx);
  let next = index;
  let rest = carry;
  let steps = 0;
  if (count <= 1) return { index, carry: 0, steps: 0 };
  while (rest >= size && next < count - 1) {
    rest -= size;
    next += 1;
    steps += 1;
  }
  while (rest <= -size && next > 0) {
    rest += size;
    next -= 1;
    steps -= 1;
  }
  if (next >= count - 1 && rest > rubber) rest = rubber;
  if (next <= 0 && rest < -rubber) rest = -rubber;
  return { index: next, carry: rest, steps };
}

/** Finger movement along the dial, in pixels. Positive points from the current stop toward the next one. */
export function projectMove(dx: number, dy: number, axisX: number, axisY: number) {
  const length = Math.hypot(axisX, axisY);
  if (length < 1) return dx;
  return (dx * axisX + dy * axisY) / length;
}
