// Night Courier — the three levels: tile maps plus guard patrols.
//
// Legend for the maps (24 columns x 16 rows, one char per tile):
//   #  wall (blocks movement and sight)      .  floor
//   s  shadow floor (hard to be seen)        l  lit floor (easy to be seen)
//   C  crate, H shelf (cover: block movement and sight)
//   P  player start   E  exit door           o  secret document to steal
//   1..5  a guard's spawn tile; its patrol loop is listed below it.
//
// Guard patrols are loops of tile coordinates [col, row]. Guards walk them
// with breadth-first pathfinding on the tile grid, so every leg of a loop
// must be reachable through open floor — validateLevels checks that.

export const LEVELS = [
  {
    name: '1 · The Archive',
    par: 75,
    map: [
      '########################',
      '#P..ss.....#....o...3..#',
      '#..........#...........#',
      '#.C..ss....#..C..ss....#',
      '#..........#...........#',
      '#.####.....#....####...#',
      '#....#........#....#...#',
      '#.o..#...C....#...1#...#',
      '#....#........#....#...#',
      '#.####...ss#..#....#...#',
      '#..........#...........#',
      '#..C.......#..C....ss..#',
      '#....ss....#......C....#',
      '#..o.......#....2......#',
      '#....ss.......ss...E...#',
      '########################'
    ],
    patrols: [
      [[18, 7], [18, 11], [16, 11], [16, 7]],
      [[16, 13], [21, 13], [21, 10], [16, 10]],
      [[20, 1], [20, 4], [15, 4], [15, 1]],
    ],
    briefing:
      'Steal the 3 archive files, then slip out the green exit. Stay out of the yellow cones — shadows hide you, lamplight exposes you.',
  },
  {
    name: '2 · The Server Vault',
    par: 90,
    map: [
      '########################',
      '#P...l.....#....o......#',
      '#....l.....#.....l.....#',
      '#.C..l.l...#..C..l.l...#',
      '#....l.....#.....l.....#',
      '#.#####....#....#####..#',
      '#.....3................#',
      '#.o....C...#..l...1....#',
      '#................l.....#',
      '#.#####....#....#####..#',
      '#......................#',
      '#..l.......#..C....l...#',
      '#.o...l....#.....l..2..#',
      '#....l.....#..l....l...#',
      '#..C.......#.....o..E..#',
      '########################'
    ],
    patrols: [
      [[18, 7], [18, 8], [13, 8], [13, 7]],
      [[20, 12], [20, 14], [15, 14], [15, 12]],
      [[6, 6], [6, 8], [2, 8], [2, 6]],
    ],
    briefing:
      'The vault is brightly lit and the patrols overlap. Run and they hear you — sneak, and toss a pebble (Q or click) to pull a guard away.',
  },
  {
    name: '3 · The Rooftop Run',
    par: 100,
    map: [
      '########################',
      '#P..ss4....#.....o.....#',
      '#..........#.....C.....#',
      '#.C...ss...#..ss....C..#',
      '#......................#',
      '#.####.....#.####...1..#',
      '#....#.....#....#......#',
      '#.o..#..C..#..o.#...C..#',
      '#....#.....#....#......#',
      '#.####.....#.####......#',
      '#................ss....#',
      '#..C..ss...#..C.....2..#',
      '#....ss....#....ss.....#',
      '#.o........#....C..E...#',
      '#....C.....#..3....ss..#',
      '########################'
    ],
    patrols: [
      [[20, 5], [20, 9], [17, 9], [17, 5]],
      [[20, 11], [20, 14], [15, 14], [15, 11]],
      [[14, 14], [14, 12], [12, 12], [12, 14]],
      [[6, 1], [6, 3], [3, 3], [3, 1]],
    ],
    briefing:
      'Four guards, one way out. Learn the patrols, wait for the gap, and never let the meter fill — a ghost run is worth 300 extra.',
  },
];

/** Parse one level map into tiles, the player start, documents, exit and guards. */
export function parseLevel(def) {
  const tiles = [];
  let player = null;
  let exit = null;
  const documents = [];
  const guardSpawns = [];
  for (let row = 0; row < def.map.length; row += 1) {
    const line = def.map[row];
    const tilesRow = [];
    for (let col = 0; col < line.length; col += 1) {
      const ch = line[col];
      let kind = 'floor';
      if (ch === '#') kind = 'wall';
      else if (ch === 's') kind = 'shadow';
      else if (ch === 'l') kind = 'lit';
      else if (ch === 'C') kind = 'crate';
      else if (ch === 'H') kind = 'shelf';
      tilesRow.push(kind);
      const cx = col * 40 + 20;
      const cy = row * 40 + 20;
      if (ch === 'P') player = { x: cx, y: cy };
      else if (ch === 'E') exit = { x: cx, y: cy };
      else if (ch === 'o') documents.push({ x: cx, y: cy, taken: false });
      else if (ch >= '1' && ch <= '5') guardSpawns.push({ x: cx, y: cy, index: ch.charCodeAt(0) - 49 });
    }
    tiles.push(tilesRow);
  }
  return { tiles, player, exit, documents, guardSpawns, def };
}

/** A tile blocks movement and sight. */
export function isBlockingTile(tiles, col, row) {
  if (row < 0 || row >= tiles.length || col < 0 || col >= tiles[0].length) return true;
  const kind = tiles[row][col];
  return kind === 'wall' || kind === 'crate' || kind === 'shelf';
}

/** A tile blocks sight only (same set, kept separate so levels can differ later). */
export function blocksSight(tiles, col, row) {
  return isBlockingTile(tiles, col, row);
}
