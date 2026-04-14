export interface PathResult {
  path: { x: number; y: number }[];
  totalApCost: number;
  valid: boolean;
}

export function manhattanDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

export function findPath(
  map: { width: number; height: number; tiles: { x: number; y: number; ap_cost: number }[] },
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  occupiedPositions: Set<string> = new Set()
): PathResult {
  const { width, height, tiles } = map;
  const getTile = (x: number, y: number) => tiles[y * width + x];

  // Validate bounds
  if (startX < 0 || startX >= width || startY < 0 || startY >= height ||
      endX < 0 || endX >= width || endY < 0 || endY >= height) {
    return { path: [], totalApCost: 0, valid: false };
  }

  const endTile = getTile(endX, endY);
  if (endTile.ap_cost < 0) return { path: [], totalApCost: 0, valid: false };

  // Destination occupied by another combatant
  const endKey = `${endX},${endY}`;
  if (occupiedPositions.has(endKey)) return { path: [], totalApCost: 0, valid: false };

  if (startX === endX && startY === endY) {
    return { path: [], totalApCost: 0, valid: true };
  }

  // A* search
  interface Node {
    x: number;
    y: number;
    g: number;  // cost so far
    f: number;  // g + heuristic
    parent: Node | null;
  }

  const openSet: Node[] = [{ x: startX, y: startY, g: 0, f: manhattanDistance(startX, startY, endX, endY), parent: null }];
  const closedSet = new Set<string>();

  while (openSet.length > 0) {
    // Find lowest f score
    let bestIdx = 0;
    for (let i = 1; i < openSet.length; i++) {
      if (openSet[i].f < openSet[bestIdx].f) bestIdx = i;
    }
    const current = openSet.splice(bestIdx, 1)[0];
    const key = `${current.x},${current.y}`;

    if (current.x === endX && current.y === endY) {
      // Reconstruct path (exclude start position)
      const path: { x: number; y: number }[] = [];
      let node: Node | null = current;
      while (node && (node.x !== startX || node.y !== startY)) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return { path, totalApCost: current.g, valid: true };
    }

    closedSet.add(key);

    // 4-directional neighbors
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      const nKey = `${nx},${ny}`;
      if (closedSet.has(nKey)) continue;

      const tile = getTile(nx, ny);
      if (tile.ap_cost < 0) continue;

      // Can't move through occupied tiles (unless it's the destination)
      if (occupiedPositions.has(nKey) && nKey !== endKey) continue;

      const g = current.g + tile.ap_cost;
      const existing = openSet.find(n => n.x === nx && n.y === ny);
      if (existing) {
        if (g < existing.g) {
          existing.g = g;
          existing.f = g + manhattanDistance(nx, ny, endX, endY);
          existing.parent = current;
        }
      } else {
        openSet.push({ x: nx, y: ny, g, f: g + manhattanDistance(nx, ny, endX, endY), parent: current });
      }
    }
  }

  return { path: [], totalApCost: 0, valid: false };
}
