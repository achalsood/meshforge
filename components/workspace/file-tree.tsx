import { Icon, type IconName } from "./icon";
import type { TreeItem } from "@/lib/workspace/build-file-tree";

interface FileTreeProps {
  activeFile: string;
  dirtyPaths: ReadonlySet<string>;
  items: TreeItem[];
  onOpenFile: (path: string) => void;
}

export function FileTree({ activeFile, dirtyPaths, items, onOpenFile }: FileTreeProps) {
  return (
    <div className="file-tree">
      {items.map((item) => (
        <button
          key={item.path}
          style={{ paddingLeft: 13 + item.depth * 20 }}
          className={`tree-row ${activeFile === item.path ? "active" : ""}`}
          onClick={() => !item.type.startsWith("folder") && onOpenFile(item.path)}
        >
          {item.type.startsWith("folder") && <span className={`tree-caret ${item.type === "folder-open" ? "open" : ""}`}>›</span>}
          {item.type === "ts"
            ? <span className="ts-icon">TS</span>
            : <Icon name={item.type.startsWith("folder") ? "folder" : item.type as IconName} size={17} />}
          <span>{item.name}</span>
          {dirtyPaths.has(item.path) && <em>M</em>}
        </button>
      ))}
    </div>
  );
}
