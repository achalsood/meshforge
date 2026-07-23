export interface AudioDeviceOption {
  deviceId: string;
  label: string;
}

export interface AudioDeviceLists {
  inputs: AudioDeviceOption[];
  outputs: AudioDeviceOption[];
}

type AudioDeviceLike = Pick<MediaDeviceInfo, "deviceId" | "kind" | "label">;

export const AUDIO_INPUT_STORAGE_KEY = "meshforge.audio.input";
export const AUDIO_OUTPUT_STORAGE_KEY = "meshforge.audio.output";

export function listAudioDevices(devices: AudioDeviceLike[]): AudioDeviceLists {
  const seen = new Set<string>();
  const inputs: AudioDeviceOption[] = [];
  const outputs: AudioDeviceOption[] = [];
  let inputIndex = 0;
  let outputIndex = 0;

  for (const device of devices) {
    if ((device.kind !== "audioinput" && device.kind !== "audiooutput") || seen.has(`${device.kind}:${device.deviceId}`)) continue;
    seen.add(`${device.kind}:${device.deviceId}`);
    if (device.kind === "audioinput") {
      inputIndex += 1;
      inputs.push({ deviceId: device.deviceId, label: device.label || `Microphone ${inputIndex}` });
    } else {
      outputIndex += 1;
      outputs.push({ deviceId: device.deviceId, label: device.label || `Speaker ${outputIndex}` });
    }
  }

  return { inputs, outputs };
}

export function resolveDeviceId(preferredDeviceId: string, devices: AudioDeviceOption[]): string {
  return preferredDeviceId && devices.some((device) => device.deviceId === preferredDeviceId)
    ? preferredDeviceId
    : "";
}

export function microphoneConstraints(deviceId: string): MediaTrackConstraints {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
  };
}
