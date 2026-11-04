// Rand i verbindt punt i met het volgende punt, inclusief de sluitrand.
export function edgeBetweenPoints(pointCount, first, second) {
  if (pointCount < 3 || !Number.isInteger(first) || !Number.isInteger(second)
    || first < 0 || second < 0 || first >= pointCount || second >= pointCount || first === second) return null;
  if ((first + 1) % pointCount === second) return first;
  if ((second + 1) % pointCount === first) return second;
  return null;
}

export function editClosedEdges(pointCount, closedEdges, selectedEdges, action) {
  const valid = (edge) => Number.isInteger(edge) && edge >= 0 && edge < pointCount;
  const selected = new Set(selectedEdges.filter(valid));
  const closed = new Set(closedEdges.filter(valid));
  if (selected.size && pointCount >= 3) {
    if (action === "open-rest-closed") {
      closed.clear();
      for (let edge = 0; edge < pointCount; edge += 1) if (!selected.has(edge)) closed.add(edge);
    } else if (action === "open" || action === "close") {
      for (const edge of selected) {
        if (action === "open") closed.delete(edge);
        else closed.add(edge);
      }
    }
  }
  return Array.from(closed).sort((a, b) => a - b);
}
