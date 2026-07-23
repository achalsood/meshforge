"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PresenceRecord, RealtimeSignal, WebRTCSignal } from "./protocol";
import { shouldInitiateOffer, signalTargetsPeer } from "./signaling";

type AudioStatus = "idle" | "requesting" | "connecting" | "connected" | "error";
type PeerState = "new" | "connecting" | "connected" | "disconnected" | "failed" | "closed";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function useAudioRoom(roomId: string, selfId: string, presence: PresenceRecord[]) {
  const [status, setStatus] = useState<AudioStatus>("idle");
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState("");
  const [peerStates, setPeerStates] = useState<Record<string, PeerState>>({});
  const stream = useRef<MediaStream | null>(null);
  const signaling = useRef<WebSocket | null>(null);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const audioElements = useRef(new Map<string, HTMLAudioElement>());
  const pendingCandidates = useRef(new Map<string, RTCIceCandidateInit[]>());
  const meter = useRef<{ context: AudioContext; timer: ReturnType<typeof setInterval> } | null>(null);

  const sendSignal = useCallback((signal: WebRTCSignal, targetClientId?: string) => {
    const packet: RealtimeSignal = { type: "signal", roomId, clientId: selfId, targetClientId, signal };
    if (signaling.current?.readyState === WebSocket.OPEN) signaling.current.send(JSON.stringify(packet));
  }, [roomId, selfId]);

  const removePeer = useCallback((peerId: string) => {
    peers.current.get(peerId)?.close();
    peers.current.delete(peerId);
    pendingCandidates.current.delete(peerId);
    const audio = audioElements.current.get(peerId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
      audioElements.current.delete(peerId);
    }
    setPeerStates((current) => {
      const next = { ...current };
      delete next[peerId];
      return next;
    });
  }, []);

  const ensurePeer = useCallback((peerId: string) => {
    const existing = peers.current.get(peerId);
    if (existing) return existing;
    if (!stream.current) throw new Error("Microphone stream is unavailable");
    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS, bundlePolicy: "max-bundle" });
    for (const track of stream.current.getTracks()) connection.addTrack(track, stream.current);
    connection.addEventListener("icecandidate", (event) => {
      if (event.candidate) sendSignal({ kind: "candidate", candidate: event.candidate.toJSON() }, peerId);
    });
    connection.addEventListener("track", (event) => {
      const remoteStream = event.streams[0];
      if (!remoteStream) return;
      let audio = audioElements.current.get(peerId);
      if (!audio) {
        audio = document.createElement("audio");
        audio.autoplay = true;
        audio.playsInline = true;
        audio.dataset.meshforgePeer = peerId;
        audio.hidden = true;
        document.body.appendChild(audio);
        audioElements.current.set(peerId, audio);
      }
      audio.srcObject = remoteStream;
      void audio.play().catch(() => undefined);
    });
    connection.addEventListener("connectionstatechange", () => {
      const next = connection.connectionState as PeerState;
      setPeerStates((current) => ({ ...current, [peerId]: next }));
      if (next === "failed" || next === "closed") removePeer(peerId);
    });
    peers.current.set(peerId, connection);
    setPeerStates((current) => ({ ...current, [peerId]: "new" }));
    return connection;
  }, [removePeer, sendSignal]);

  const createOffer = useCallback(async (peerId: string) => {
    const connection = ensurePeer(peerId);
    if (connection.signalingState !== "stable" || connection.localDescription) return;
    const offer = await connection.createOffer({ offerToReceiveAudio: true });
    await connection.setLocalDescription(offer);
    sendSignal({ kind: "description", description: offer }, peerId);
    setPeerStates((current) => ({ ...current, [peerId]: "connecting" }));
  }, [ensurePeer, sendSignal]);

  const handleSignal = useCallback(async (packet: RealtimeSignal) => {
    if (!signalTargetsPeer(packet, selfId)) return;
    const peerId = packet.clientId;
    if (packet.signal.kind === "leave") {
      removePeer(peerId);
      return;
    }
    if (packet.signal.kind === "ready") {
      if (shouldInitiateOffer(selfId, peerId)) await createOffer(peerId);
      return;
    }
    const connection = ensurePeer(peerId);
    if (packet.signal.kind === "description") {
      await connection.setRemoteDescription(packet.signal.description);
      const queued = pendingCandidates.current.get(peerId) ?? [];
      for (const candidate of queued) await connection.addIceCandidate(candidate);
      pendingCandidates.current.delete(peerId);
      if (packet.signal.description.type === "offer") {
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        sendSignal({ kind: "description", description: answer }, peerId);
      }
      return;
    }
    if (packet.signal.kind === "candidate") {
      if (connection.remoteDescription) await connection.addIceCandidate(packet.signal.candidate);
      else pendingCandidates.current.set(peerId, [...(pendingCandidates.current.get(peerId) ?? []), packet.signal.candidate]);
    }
  }, [createOffer, ensurePeer, removePeer, selfId, sendSignal]);

  const leave = useCallback(() => {
    if (signaling.current?.readyState === WebSocket.OPEN) sendSignal({ kind: "leave" });
    signaling.current?.close();
    signaling.current = null;
    for (const peerId of [...peers.current.keys()]) removePeer(peerId);
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;
    if (meter.current) {
      clearInterval(meter.current.timer);
      void meter.current.context.close();
      meter.current = null;
    }
    setLevel(0);
    setMuted(false);
    setPeerStates({});
    setStatus("idle");
  }, [removePeer, sendSignal]);

  const join = useCallback(async () => {
    if (!selfId || status === "requesting" || status === "connecting" || status === "connected") return;
    setStatus("requesting");
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone access is unavailable in this browser");
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      stream.current = localStream;
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(localStream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const timer = setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
        setLevel(Math.sqrt(sum / samples.length));
      }, 120);
      meter.current = { context, timer };

      setStatus("connecting");
      const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${scheme}//${window.location.host}/api/realtime/${roomId}`);
      signaling.current = socket;
      socket.addEventListener("open", () => {
        setStatus("connected");
        sendSignal({ kind: "ready" });
        for (const peer of presence) if (shouldInitiateOffer(selfId, peer.clientId)) void createOffer(peer.clientId);
      });
      socket.addEventListener("message", (message) => {
        try {
          const packet = JSON.parse(String(message.data)) as RealtimeSignal | { type: string };
          if (packet.type === "signal") void handleSignal(packet as RealtimeSignal).catch(() => undefined);
        } catch { /* malformed signaling messages are ignored */ }
      });
      socket.addEventListener("close", () => {
        if (stream.current) setStatus("error");
      });
      socket.addEventListener("error", () => {
        setError("Could not reach the audio signaling room");
        setStatus("error");
      });
    } catch (cause) {
      const message = cause instanceof DOMException && cause.name === "NotAllowedError"
        ? "Microphone permission was not granted"
        : cause instanceof Error ? cause.message : "Could not start audio";
      setError(message);
      setStatus("error");
    }
  }, [createOffer, handleSignal, presence, roomId, selfId, sendSignal, status]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    for (const track of stream.current?.getAudioTracks() ?? []) track.enabled = !next;
    setMuted(next);
  }, [muted]);

  useEffect(() => () => leave(), [leave]);

  const connectedPeers = Object.values(peerStates).filter((state) => state === "connected").length;
  return { status, muted, level, speaking: status === "connected" && !muted && level > 0.035, error, peerStates, connectedPeers, join, leave, toggleMute };
}
