// Every flight uses the same coordinates as its wallet, bed or converter.
export function gardenLayout(compact, count = 6, settings = {}) {
  const w = compact ? 490 : 1000;
  const smallGarden = compact && count <= 2;
  const h = compact ? (smallGarden ? 354 : 460) : 590;
  const fieldCapacity = settings.fieldCapacity ?? 60;
  const energyCapacity = settings.energyCapacity ?? 6;
  const bed = compact
    ? { x: 83, y: smallGarden ? 99 : 189, width: 324, height: 106 }
    : { x: 314, y: 225, width: 372, height: 161 };
  bed.columns = Math.min(
    fieldCapacity,
    Math.ceil(Math.sqrt(fieldCapacity * (compact ? 2.4 : 5 / 3))),
  );
  bed.rows = Math.ceil(fieldCapacity / bed.columns);

  // Clockwise seating keeps the lower row's order consistent during a refill.
  let homes;
  if (compact) {
    const back = smallGarden ? 0 : Math.ceil(count / 2);
    const front = count - back;
    const row = (size, y) =>
      Array.from({ length: size }, (_, i) => [w / 2 + (i - (size - 1) / 2) * 162, y]);
    homes = [...row(back, 98), ...row(front, smallGarden ? 269 : 357).reverse()];
  } else {
    const seats = [
      [188, 210],
      [500, 92],
      [812, 210],
      [797, 426],
      [500, 462],
      [203, 426],
    ];
    const arrangements = [
      [],
      [4],
      [0, 2],
      [1, 3, 5],
      [0, 2, 3, 5],
      [0, 1, 2, 3, 5],
      [0, 1, 2, 3, 4, 5],
    ];
    homes = arrangements[count].map((i) => seats[i]);
    if (count === 2) homes = homes.map(([x]) => [x, 289]);
  }
  return {
    w,
    h,
    compact,
    bed,
    fieldCapacity,
    energyCapacity,
    homes,
    size: compact ? 0.86 : 1.04,
    sun: compact ? [445, 42] : [862, 88],
    converter: compact ? [245, bed.y - 26] : [500, 198],
    plot(n) {
      const cw = (bed.width - 22) / bed.columns;
      const ch = (bed.height - 13) / bed.rows;
      const row = Math.floor(n / bed.columns);
      const rowCount = Math.min(bed.columns, fieldCapacity - row * bed.columns);
      return [
        bed.x + bed.width / 2 + ((n % bed.columns) - (rowCount - 1) / 2) * cw,
        bed.y + 5 + (row + 0.5) * ch,
      ];
    },
    wallet(x, y) {
      return [x, y + (compact ? 42 : 62)];
    },
    pip(x, y, n) {
      const [wx, wy] = this.wallet(x, y);
      if (energyCapacity > 8) return [wx - (compact ? 19 : 25), wy];
      const gap = Math.min(
        compact ? 9.4 : 12.2,
        (compact ? 57 : 73) / Math.max(1, energyCapacity - 1),
      );
      return [wx + (n - (energyCapacity - 1) / 2) * gap, wy];
    },
    counter(x, y) {
      const side = x > w * 0.7 ? -1 : 1;
      return [x + side * (compact ? 37 : 45), y - (compact ? 38 : 42)];
    },
    slot(n, cost = 2) {
      const offset = cost === 1 ? -23 : cost === 2 ? (n === 0 ? -35 : -14) : -38;
      return [this.converter[0] + offset * (compact ? 0.8 : 1), this.converter[1]];
    },
    sprout() {
      return [this.converter[0] + 34 * (compact ? 0.8 : 1), this.converter[1]];
    },
  };
}
