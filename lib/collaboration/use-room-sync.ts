"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatPayload, PresenceRecord, RealtimeBatch, ReplayResponse, RoomEvent } from "./protocol";
import { ReplicatedText, type TextOperation } from "./rga";

type SyncStatus = "connecting" | "live" | "recovering" | "offline";

interface SyncedChat extends ChatPayload {
  eventId: string;
  createdAt: number;
  clientId: string;
}

const COLORS = ["mint", "coral", "violet", "lilac"];

function createClientId(): string {
  const bytes = new Uint8Array(6);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function useRoomSync(roomId: string, initialText: string) {
  const [text, setText] = useState(initialText);
  const [status, setStatus] = useState<SyncStatus>("connecting");
  const [presence, setPresence] = useState<PresenceRecord[]>([]);
  const [chats, setChats] = useState<SyncedChat[]>([]);
  const [latency, setLatency] = useState(0);
  const [appliedOperations, setAppliedOperations] = useState(0);
  const [selfId, setSelfId] = useState("");
  const replica = useRef(ReplicatedText.fromText(initialText));
  const clientId = useRef("");
  const sequence = useRef(0);
  const latestSeq = useRef(0);
  const socket = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const seenEvents = useRef(new Set<string>());
  const selection = useRef({ from: 0, to: 0 });

  const processEvents = useCallback((events: RoomEvent[]) => {
    let documentChanged = false;
    let operationCount = 0;
    const incomingChats: SyncedChat[] = [];
    for (const event of events) {
      if (seenEvents.current.has(event.eventId)) continue;
      seenEvents.current.add(event.eventId);
      if (event.seq) latestSeq.current = Math.max(latestSeq.current, event.seq);
      if (event.kind === "operations" && "operations" in event.payload) {
        const operations = event.payload.operations as TextOperation[];
        operationCount += replica.current.applyAll(operations);
        documentChanged = true;
      } else if (event.kind === "chat" && "body" in event.payload) {
        incomingChats.push({ ...event.payload, eventId: event.eventId, createdAt: event.createdAt, clientId: event.clientId });
      }
    }
    if (documentChanged) setText(replica.current.toString());
    if (operationCount) setAppliedOperations((count) => count + operationCount);
    if (incomingChats.length) setChats((current) => [...current, ...incomingChats].sort((a, b) => a.createdAt - b.createdAt).slice(-100));
  }, []);

  const postFallback = useCallback(async (events: RoomEvent[]) => {
    const started = performance.now();
    const response = await fetch(`/api/rooms/${roomId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
    });
    if (!response.ok) throw new Error("Event persistence failed");
    setLatency(Math.max(1, Math.round(performance.now() - started)));
  }, [roomId]);

  const sendEvents = useCallback((events: RoomEvent[]) => {
    const batch: RealtimeBatch = { type: "batch", roomId, clientId: clientId.current, events };
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(batch));
    else void postFallback(events).catch(() => setStatus("offline"));
  }, [postFallback, roomId]);

  const heartbeat = useCallback(() => {
    if (!clientId.current) return;
    const event: RoomEvent = {
      eventId: `${clientId.current}:presence:${Date.now()}`,
      clientId: clientId.current,
      kind: "presence",
      createdAt: Date.now(),
      payload: {
        name: `You · ${clientId.current.slice(0, 4)}`,
        color: COLORS[sequence.current % COLORS.length],
        cursorFrom: selection.current.from,
        cursorTo: selection.current.to,
      },
    };
    sendEvents([event]);
  }, [sendEvents]);

  useEffect(() => {
    replica.current = ReplicatedText.fromText(initialText);
    seenEvents.current.clear();
    latestSeq.current = 0;
    sequence.current = 0;
    clientId.current = createClientId();
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    queueMicrotask(() => {
      if (cancelled) return;
      setText(initialText);
      setPresence([]);
      setChats([]);
      setAppliedOperations(0);
      setSelfId(clientId.current);
    });

    const replay = async () => {
      const started = performance.now();
      const response = await fetch(`/api/rooms/${roomId}/events?since=${latestSeq.current}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Replay failed");
      const data = await response.json() as ReplayResponse;
      if (cancelled) return;
      processEvents(data.events);
      latestSeq.current = Math.max(latestSeq.current, data.latestSeq);
      setPresence(data.presence);
      setLatency(Math.max(1, Math.round(performance.now() - started)));
    };

    const connect = () => {
      if (cancelled) return;
      setStatus(reconnectAttempt.current ? "recovering" : "connecting");
      const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${scheme}//${window.location.host}/api/realtime/${roomId}`);
      socket.current = ws;
      ws.addEventListener("open", () => {
        reconnectAttempt.current = 0;
        setStatus("live");
        heartbeat();
        void replay();
      });
      ws.addEventListener("message", (message) => {
        try {
          const data = JSON.parse(String(message.data)) as RealtimeBatch | { type: string };
          if (data.type === "batch") processEvents((data as RealtimeBatch).events);
        } catch { /* malformed peer messages are ignored */ }
      });
      ws.addEventListener("close", () => {
        if (cancelled) return;
        setStatus("recovering");
        const delay = Math.min(10_000, 400 * 2 ** reconnectAttempt.current) + Math.random() * 250;
        reconnectAttempt.current += 1;
        reconnectTimer = setTimeout(connect, delay);
      });
      ws.addEventListener("error", () => ws.close());
    };

    void replay().catch(() => setStatus("recovering"));
    connect();
    const replayTimer = setInterval(() => void replay().catch(() => setStatus("recovering")), 1_500);
    const heartbeatTimer = setInterval(heartbeat, 5_000);
    return () => {
      cancelled = true;
      clearInterval(replayTimer);
      clearInterval(heartbeatTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket.current?.close();
    };
  }, [heartbeat, initialText, processEvents, roomId]);

  const edit = useCallback((nextText: string) => {
    const before = replica.current.toString();
    const operations = replica.current.edit(before, nextText, clientId.current, () => ++sequence.current);
    setText(replica.current.toString());
    if (!operations.length) return;
    setAppliedOperations((count) => count + operations.length);
    const event: RoomEvent = {
      eventId: `${clientId.current}:ops:${++sequence.current}`,
      clientId: clientId.current,
      kind: "operations",
      payload: { operations },
      createdAt: Date.now(),
    };
    seenEvents.current.add(event.eventId);
    sendEvents([event]);
  }, [sendEvents]);

  const updateSelection = useCallback((from: number, to: number) => {
    selection.current = { from, to };
  }, []);

  const sendChat = useCallback((body: string) => {
    const payload: ChatPayload = { body: body.slice(0, 1000), name: "You", initials: "AS", color: "mint" };
    const event: RoomEvent = {
      eventId: `${clientId.current}:chat:${++sequence.current}`,
      clientId: clientId.current,
      kind: "chat",
      payload,
      createdAt: Date.now(),
    };
    seenEvents.current.add(event.eventId);
    setChats((current) => [...current, { ...payload, eventId: event.eventId, createdAt: event.createdAt, clientId: event.clientId }].slice(-100));
    sendEvents([event]);
  }, [sendEvents]);

  return { text, status, presence, chats, latency, appliedOperations, selfId, edit, updateSelection, sendChat };
}
