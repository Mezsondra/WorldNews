export function wrapVisualText(value: string, limit: number) {
  const rows: string[] = [];
  const words = value
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .flatMap((word) => word.match(new RegExp(`.{1,${limit}}`, "gu")) || []);
  for (const word of words) {
    if (rows.length && rows.at(-1)!.length + word.length + 1 <= limit)
      rows[rows.length - 1] += " " + word;
    else rows.push(word);
  }
  return rows;
}
