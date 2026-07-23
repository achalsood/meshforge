export type IconName =
  | "branch" | "chevron" | "code" | "search" | "more" | "share"
  | "folder" | "file" | "git" | "book" | "mic" | "headphones"
  | "settings" | "phone" | "send" | "sparkles" | "users" | "activity"
  | "radio" | "check" | "plus" | "panel";

const paths: Record<IconName, string> = {
  branch: "M6 3v12a4 4 0 0 0 4 4h2M6 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0-14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 0v6a4 4 0 0 1-4 4h-2",
  chevron: "m9 18 6-6-6-6",
  code: "m8 9-3 3 3 3m8-6 3 3-3 3m-2-10-4 14",
  search: "m21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  share: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10-4v6m3-3h-6",
  folder: "M3 6h6l2 2h10v11H3V6Z",
  file: "M6 2h8l4 4v16H6V2Zm8 0v5h5",
  git: "M9 18a3 3 0 1 0-6 0 3 3 0 0 0 6 0Zm12-12a3 3 0 1 0-6 0 3 3 0 0 0 6 0ZM8 16 16 8",
  book: "M4 5a3 3 0 0 1 3-3h5v19H7a3 3 0 0 0-3 3V5Zm16 0a3 3 0 0 0-3-3h-5v19h5a3 3 0 0 1 3 3V5Z",
  mic: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0M12 18v4m-4 0h8",
  headphones: "M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v7H4v-7Zm13 0h3v7h-3v-7Z",
  settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0-13v2m0 15v2M4.6 4.6 6 6m12 12 1.4 1.4M2.5 12h2m15 0h2M4.6 19.4 6 18M18 6l1.4-1.4",
  phone: "M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24l4 1.34a1 1 0 0 1 .68.95V21a1 1 0 0 1-1 1C10.1 22 2 13.9 2 4a1 1 0 0 1 1-1h3.75a1 1 0 0 1 .95.68l1.34 4a1 1 0 0 1-.24 1l-2.2 2.12Z",
  send: "m22 2-7 20-4-9-9-4 20-7Zm-11 11 5-5",
  sparkles: "m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm7 10 .8 2.2L22 16l-2.2.8L19 19l-.8-2.2L16 16l2.2-.8L19 13ZM5 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z",
  users: "M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm11.5 10v-2a4 4 0 0 0-3-3.87m-1-12a4 4 0 0 1 0 7.75",
  activity: "M3 12h4l2-7 4 14 2-7h6",
  radio: "M5.6 18.4a9 9 0 0 1 0-12.8m12.8 0a9 9 0 0 1 0 12.8M9 15a4 4 0 0 1 0-6m6 0a4 4 0 0 1 0 6m-3-1a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  check: "m5 12 4 4L19 6",
  plus: "M12 5v14M5 12h14",
  panel: "M3 4h18v16H3V4Zm13 0v16",
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
