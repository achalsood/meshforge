"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUDIO_INPUT_STORAGE_KEY,
  AUDIO_OUTPUT_STORAGE_KEY,
  listAudioDevices,
  microphoneConstraints,
  resolveDeviceId,
  type AudioDeviceOption,
} from "./audio-devices";
import type { PresenceRecord, RealtimeSignal, SignalReplayResponse, WebRTCSignal } from "./protocol";
import { shouldInitiateOffer, signalTargetsPeer } from "./signaling";

type AudioStatus = "idle" | "requesting" | "connecting" | "connected" | "error";
type PeerState = "new" | "connecting" | "connected" | "disconnected" | "failed" | "closed";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

interface AudioRoomAccess {
  owner: string;
  repository: string;
  scope: string;
  enabled: boolean;
}

export function useAudioRoom(roomId: string, selfId: string, presence: PresenceRecord[], access: AudioRoomAccess) {
  const { owner, repository, scope, enabled } = access;
  const repositoryQuery = `owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repository)}&scope=${encodeURIComponent(scope)}`;
  const [status, setStatus] = useState<AudioStatus>("idle");
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState("");
  const [deviceError, setDeviceError] = useState("");
  const [inputDevices, setInputDevices] = useState<AudioDeviceOption[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioDeviceOption[]>([]);
  const [inputDeviceId, setInputDeviceId] = useState(() =>
    typeof window === "undefined" ? "" : localStorage.getItem(AUDIO_INPUT_STORAGE_KEY) ?? "",
  );
  const [outputDeviceId, setOutputDeviceId] = useState(() =>
    typeof window === "undefined" ? "" : localStorage.getItem(AUDIO_OUTPUT_STORAGE_KEY) ?? "",
  );
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [outputSelectionSupported] = useState(() =>
    typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype,
  );
  const [peerStates, setPeerStates] = useState<Record<string, PeerState>>({});
  const stream = useRef<MediaStream | null>(null);
  const inputDeviceIdRef = useRef(inputDeviceId);
  const outputDeviceIdRef = useRef(outputDeviceId);
  const signaling = useRef<AbortController | null>(null);
  const signalSequence = useRef(0);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const audioElements = useRef(new Map<string, HTMLAudioElement>());
  const pendingCandidates = useRef(new Map<string, RTCIceCandidateInit[]>());
  const meter = useRef<{ context: AudioContext; timer: ReturnType<typeof setInterval> } | null>(null);

  const stopMeter = useCallback(() => {
    if (!meter.current) return;
    clearInterval(meter.current.timer);
    void meter.current.context.close();
    meter.current = null;
  }, []);

  const startMeter = useCallback((localStream: MediaStream) => {
    stopMeter();
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
  }, [stopMeter]);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    setDevicesLoading(true);
    setDeviceError("");
    try {
      const next = listAudioDevices(await navigator.mediaDevices.enumerateDevices());
      setInputDevices(next.inputs);
      setOutputDevices(next.outputs);
      setInputDeviceId((current) => {
        const resolved = resolveDeviceId(current, next.inputs);
        inputDeviceIdRef.current = resolved;
        if (current && !resolved) localStorage.removeItem(AUDIO_INPUT_STORAGE_KEY);
        return resolved;
      });
      setOutputDeviceId((current) => {
        const resolved = resolveDeviceId(current, next.outputs);
        outputDeviceIdRef.current = resolved;
        if (current && !resolved) localStorage.removeItem(AUDIO_OUTPUT_STORAGE_KEY);
        return resolved;
      });
    } catch {
      setDeviceError("Audio devices could not be listed");
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  const applyOutputDevice = useCallback(async (deviceId: string) => {
    const elements = [...audioElements.current.values()];
    await Promise.all(elements.map(async (audio) => {
      const selectable = audio as HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> };
      if (selectable.setSinkId) await selectable.setSinkId(deviceId);
    }));
  }, []);

  const sendSignal = useCallback(async (signal: WebRTCSignal, targetClientId?: string) => {
    const packet: RealtimeSignal = { type: "signal", roomId, clientId: selfId, targetClientId, signal };
    const response = await fetch(`/api/rooms/${roomId}/signals?${repositoryQuery}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(packet),
    });
    if (!response.ok) throw new Error("Audio signaling request failed");
  }, [repositoryQuery, roomId, selfId]);

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
      if (event.candidate) void sendSignal({ kind: "candidate", candidate: event.candidate.toJSON() }, peerId).catch(() => undefined);
    });
    connection.addEventListener("track", (event) => {
      const remoteStream = event.streams[0];
      if (!remoteStream) return;
      let audio = audioElements.current.get(peerId);
      if (!audio) {
        audio = document.createElement("audio");
        audio.autoplay = true;
        audio.dataset.meshforgePeer = peerId;
        audio.hidden = true;
        document.body.appendChild(audio);
        audioElements.current.set(peerId, audio);
      }
      audio.srcObject = remoteStream;
      const selectable = audio as HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> };
      if (selectable.setSinkId) void selectable.setSinkId(outputDeviceIdRef.current).catch(() => {
        setDeviceError("The selected speaker is unavailable");
      });
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
    await sendSignal({ kind: "description", description: offer }, peerId);
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
        await sendSignal({ kind: "description", description: answer }, peerId);
      }
      return;
    }
    if (packet.signal.kind === "candidate") {
      if (connection.remoteDescription) await connection.addIceCandidate(packet.signal.candidate);
      else pendingCandidates.current.set(peerId, [...(pendingCandidates.current.get(peerId) ?? []), packet.signal.candidate]);
    }
  }, [createOffer, ensurePeer, removePeer, selfId, sendSignal]);

  const leave = useCallback(() => {
    if (stream.current) void sendSignal({ kind: "leave" }).catch(() => undefined);
    signaling.current?.abort();
    signaling.current = null;
    signalSequence.current = 0;
    for (const peerId of [...peers.current.keys()]) removePeer(peerId);
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;
    stopMeter();
    setLevel(0);
    setMuted(false);
    setPeerStates({});
    setStatus("idle");
  }, [removePeer, sendSignal, stopMeter]);

  const join = useCallback(async () => {
    if (!enabled || !selfId || status === "requesting" || status === "connecting" || status === "connected") return;
    setStatus("requesting");
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone access is unavailable in this browser");
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: microphoneConstraints(inputDeviceIdRef.current),
        video: false,
      });
      stream.current = localStream;
      startMeter(localStream);
      await refreshDevices();

      setStatus("connecting");
      const controller = new AbortController();
      signaling.current = controller;
      const baselineResponse = await fetch(`/api/rooms/${roomId}/signals?since=0&${repositoryQuery}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!baselineResponse.ok) throw new Error("Audio signaling request failed");
      const baseline = await baselineResponse.json() as SignalReplayResponse;
      signalSequence.current = baseline.latestSeq;
      await sendSignal({ kind: "ready" });
      setStatus("connected");
      for (const peer of presence) {
        if (shouldInitiateOffer(selfId, peer.clientId)) {
          void createOffer(peer.clientId).catch(() => {
            setError("Audio signaling request failed");
            setStatus("error");
            controller.abort();
          });
        }
      }

      const poll = async () => {
        while (!controller.signal.aborted) {
          try {
            const response = await fetch(`/api/rooms/${roomId}/signals?since=${signalSequence.current}&${repositoryQuery}`, {
              cache: "no-store",
              signal: controller.signal,
            });
            if (!response.ok) throw new Error("Audio signaling request failed");
            const replay = await response.json() as SignalReplayResponse;
            signalSequence.current = Math.max(signalSequence.current, replay.latestSeq);
            for (const packet of replay.signals) await handleSignal(packet);
            await new Promise((resolve) => setTimeout(resolve, 450));
          } catch (cause) {
            if (controller.signal.aborted) return;
            setError(cause instanceof Error ? cause.message : "Could not reach the audio signaling room");
            setStatus("error");
            controller.abort();
          }
        }
      };
      void poll();
    } catch (cause) {
      signaling.current?.abort();
      signaling.current = null;
      for (const track of stream.current?.getTracks() ?? []) track.stop();
      stream.current = null;
      stopMeter();
      setLevel(0);
      const message = cause instanceof DOMException && cause.name === "NotAllowedError"
        ? "Microphone permission was not granted"
        : cause instanceof Error && cause.message === "Audio signaling request failed"
          ? "Could not reach the audio signaling room"
          : cause instanceof Error ? cause.message : "Could not start audio";
      setError(message);
      setStatus("error");
    }
  }, [createOffer, enabled, handleSignal, presence, refreshDevices, repositoryQuery, roomId, selfId, sendSignal, startMeter, status, stopMeter]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    for (const track of stream.current?.getAudioTracks() ?? []) track.enabled = !next;
    setMuted(next);
  }, [muted]);

  const selectInputDevice = useCallback(async (deviceId: string) => {
    setDeviceError("");
    if (!stream.current) {
      inputDeviceIdRef.current = deviceId;
      setInputDeviceId(deviceId);
      if (deviceId) localStorage.setItem(AUDIO_INPUT_STORAGE_KEY, deviceId);
      else localStorage.removeItem(AUDIO_INPUT_STORAGE_KEY);
      return;
    }

    try {
      const replacement = await navigator.mediaDevices.getUserMedia({
        audio: microphoneConstraints(deviceId),
        video: false,
      });
      const nextTrack = replacement.getAudioTracks()[0];
      if (!nextTrack) throw new Error("The selected microphone is unavailable");
      nextTrack.enabled = !muted;
      await Promise.all([...peers.current.values()].map(async (peer) => {
        const sender = peer.getSenders().find((candidate) => candidate.track?.kind === "audio");
        if (sender) await sender.replaceTrack(nextTrack);
      }));
      for (const track of stream.current.getTracks()) track.stop();
      stream.current = replacement;
      startMeter(replacement);
      inputDeviceIdRef.current = deviceId;
      setInputDeviceId(deviceId);
      if (deviceId) localStorage.setItem(AUDIO_INPUT_STORAGE_KEY, deviceId);
      else localStorage.removeItem(AUDIO_INPUT_STORAGE_KEY);
      await refreshDevices();
    } catch (cause) {
      setDeviceError(cause instanceof Error ? cause.message : "The selected microphone is unavailable");
    }
  }, [muted, refreshDevices, startMeter]);

  const selectOutputDevice = useCallback(async (deviceId: string) => {
    setDeviceError("");
    try {
      await applyOutputDevice(deviceId);
      outputDeviceIdRef.current = deviceId;
      setOutputDeviceId(deviceId);
      if (deviceId) localStorage.setItem(AUDIO_OUTPUT_STORAGE_KEY, deviceId);
      else localStorage.removeItem(AUDIO_OUTPUT_STORAGE_KEY);
    } catch {
      setDeviceError("The selected speaker is unavailable");
    }
  }, [applyOutputDevice]);

  useEffect(() => {
    const handleDeviceChange = () => void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", handleDeviceChange);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", handleDeviceChange);
  }, [refreshDevices]);

  useEffect(() => () => leave(), [leave]);

  const connectedPeers = Object.values(peerStates).filter((state) => state === "connected").length;
  return {
    status,
    muted,
    level,
    speaking: status === "connected" && !muted && level > 0.035,
    error,
    deviceError,
    peerStates,
    connectedPeers,
    inputDevices,
    outputDevices,
    inputDeviceId,
    outputDeviceId,
    devicesLoading,
    outputSelectionSupported,
    join,
    leave,
    toggleMute,
    refreshDevices,
    selectInputDevice,
    selectOutputDevice,
  };
}
