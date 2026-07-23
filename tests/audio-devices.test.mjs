import assert from "node:assert/strict";
import test from "node:test";

import {
  listAudioDevices,
  microphoneConstraints,
  resolveDeviceId,
} from "../lib/collaboration/audio-devices.ts";

test("groups audio devices and supplies labels when permissions hide them", () => {
  const devices = listAudioDevices([
    { kind: "audioinput", deviceId: "mic-a", label: "Studio mic" },
    { kind: "audioinput", deviceId: "mic-b", label: "" },
    { kind: "audiooutput", deviceId: "speaker-a", label: "" },
    { kind: "videoinput", deviceId: "camera-a", label: "Camera" },
  ]);

  assert.deepEqual(devices.inputs, [
    { deviceId: "mic-a", label: "Studio mic" },
    { deviceId: "mic-b", label: "Microphone 2" },
  ]);
  assert.deepEqual(devices.outputs, [
    { deviceId: "speaker-a", label: "Speaker 1" },
  ]);
});

test("deduplicates device records and drops unavailable saved selections", () => {
  const devices = listAudioDevices([
    { kind: "audioinput", deviceId: "mic-a", label: "Mic" },
    { kind: "audioinput", deviceId: "mic-a", label: "Mic duplicate" },
  ]);

  assert.equal(devices.inputs.length, 1);
  assert.equal(resolveDeviceId("mic-a", devices.inputs), "mic-a");
  assert.equal(resolveDeviceId("unplugged", devices.inputs), "");
});

test("uses a preferred microphone without disabling audio processing", () => {
  assert.deepEqual(microphoneConstraints("mic-a"), {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    deviceId: { ideal: "mic-a" },
  });
  assert.equal("deviceId" in microphoneConstraints(""), false);
});
