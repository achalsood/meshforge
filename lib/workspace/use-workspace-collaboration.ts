"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { SessionPayload } from "@/lib/auth/types";
import { useAudioRoom } from "@/lib/collaboration/use-audio-room";
import { roomSlug } from "@/lib/collaboration/room-id";
import { useRoomSync } from "@/lib/collaboration/use-room-sync";
import type { RepositorySnapshot } from "@/lib/repository/types";
import type { AuthState } from "./use-workspace-session";

interface WorkspaceCollaborationOptions {
  activeContent: string;
  activeFile: string;
  authState: AuthState;
  canAudio: boolean;
  canChat: boolean;
  canCommit: boolean;
  repository: RepositorySnapshot | null;
  session: SessionPayload | null;
}

export function useWorkspaceCollaboration(options: WorkspaceCollaborationOptions) {
  const {
    activeContent, activeFile, authState, canAudio, canChat, canCommit, repository, session,
  } = options;
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const owner = repository?.owner ?? "";
  const repositoryName = repository?.name ?? "";
  const branch = repository?.branch ?? "main";

  const sync = useRoomSync(
    roomSlug(`${owner || "none"}:${repositoryName || "none"}:${branch}:${activeFile}`),
    activeContent,
    {
      owner,
      repository: repositoryName,
      scope: `${branch}:${activeFile}`,
      displayName: session?.user.displayName ?? "Signed-in user",
      initials: session?.user.initials ?? "MF",
      canWrite: canCommit && canChat,
      enabled: authState === "ready" && Boolean(repository),
    },
  );

  const audio = useAudioRoom(
    roomSlug(`${owner || "none"}:${repositoryName || "none"}:audio`),
    sync.selfId,
    sync.presence,
    { owner, repository: repositoryName, scope: "audio", enabled: canAudio },
  );
  const sendChat = sync.sendChat;

  const messages = useMemo(() => sync.chats.map((message) => ({
    who: message.name,
    initials: message.initials,
    color: message.color,
    time: new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    body: message.body,
  })), [sync.chats]);

  const sendMessage = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !canChat) return;
    sendChat(body);
    setDraft("");
  }, [canChat, draft, sendChat]);

  useEffect(() => {
    if (!deviceMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDeviceMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [deviceMenuOpen]);

  return {
    actualPeers: Math.max(1, sync.presence.length),
    audio,
    canAudio,
    canChat,
    deviceMenuOpen,
    draft,
    messages,
    setDeviceMenuOpen,
    setDraft,
    sendMessage,
    sync,
  };
}
