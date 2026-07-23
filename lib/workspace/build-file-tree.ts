export interface TreeItem {
  type: "folder-open" | "ts" | "git" | "book" | "file";
  name: string;
  path: string;
  depth: number;
}

export function buildFileTree(paths: string[]): TreeItem[] {
  const items: TreeItem[] = [];
  const folders = new Set<string>();

  for (const path of [...paths].sort()) {
    const segments = path.split("/");
    for (let index = 0; index < segments.length - 1; index += 1) {
      const folderPath = segments.slice(0, index + 1).join("/");
      if (!folders.has(folderPath)) {
        folders.add(folderPath);
        items.push({ type: "folder-open", name: segments[index], path: folderPath, depth: index });
      }
    }
    const name = segments.at(-1) ?? path;
    const type = name === "README.md" ? "book" : name === ".gitignore" ? "git" : /\.(ts|tsx|json)$/.test(name) ? "ts" : "file";
    items.push({ type, name, path, depth: segments.length - 1 });
  }

  return items;
}
