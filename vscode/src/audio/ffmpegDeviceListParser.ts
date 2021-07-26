import IDeviceParser from "../environment/IDeviceParser";

//Heavily based on: https://github.com/syumai/ffmpeg-device-list-parser
const exec = require('child_process').exec;
const platform = process.platform;

// DEPRECATED
function getOldDeviceList(
  options: { ffmpegPath?: string } = {},
  callback?: (value: unknown) => void,
): Promise<DeviceList> {
  if (typeof options === 'function') {
    callback = options;
    options = null;
  }
  const ffmpegPath = options?.ffmpegPath || 'ffmpeg';

  // Set parsers.
  let inputDevice: string;
  let prefix: RegExp;
  let audioSeparator: RegExp;
  let alternativeName: RegExp;
  let deviceParams: RegExp;
  switch (platform) {
    case 'win32':
      inputDevice = 'dshow';
      prefix = /\[dshow/;
      audioSeparator = /DirectShow\saudio\sdevices/;
      alternativeName = /Alternative\sname\s*?\"(.*?)\"/;
      deviceParams = /\"(.*?)\"/;
      break;
    case 'darwin':
      inputDevice = 'avfoundation';
      prefix = /^\[AVFoundation/;
      audioSeparator = /AVFoundation\saudio\sdevices/;
      deviceParams = /^\[AVFoundation.*?\]\s\[(\d*?)\]\s(.*)$/;
      break;
  }

  const searchPrefix = (line: string) => line.search(prefix) > -1;
  const searchAudioSeparator = (line: string) => isVideo && line.search(audioSeparator) > -1;
  const searchAlternativeName = (line: string) => platform === 'win32' && line.search(/Alternative\sname/) > -1;

  const videoDevices: Device[] = [];
  const audioDevices: Device[] = [];
  let isVideo = true;

  // Parse
  const execute = (fulfill?: (value: unknown) => void) => {
    exec(`${ffmpegPath} -f ${inputDevice} -list_devices true -i ""`, (err, stdout, stderr) => {
      stderr
        .split('\n')
        .filter(searchPrefix)
        .forEach((line: string) => {
          const deviceList = isVideo ? videoDevices : audioDevices;

          // Check for when audio devices are encountered.
          if (searchAudioSeparator(line)) {
            isVideo = false;
            return;
          }

          // Check for when alternative name is reached on Windows
          // and set last device found alternativeName to it.
          if (searchAlternativeName(line)) {
            const lastDevice = deviceList[deviceList.length - 1];
            lastDevice.alternativeName = line.match(alternativeName)[1];
            return;
          }

          // Get device parameters.
          const params = line.match(deviceParams);
          if (params) {
            let device: Device;
            switch (platform) {
              case 'win32':
                device = {
                  name: params[1],
                };
                break;
              case 'darwin':
                device = {
                  id: parseInt(params[1]),
                  name: params[2],
                };
                break;
            }

            deviceList.push(device);
          }
        });

      fulfill({ videoDevices, audioDevices });
    });
  };

  if (typeof callback === 'function') {
    execute(callback);
  } else {
    return new Promise(execute) as Promise<DeviceList>;
  }
}

/**
 * Get a list of input (audio and video) devices found.
 * @param deviceParser A device parser to help parsing OS specific output. 
 * @param callback Optional callback to alert requester when parsing is done.
 * @returns A DeviceList containing audio and video input devices found.
 */
function getDeviceList(
  deviceParser: IDeviceParser,
  callback?: (value: unknown) => void,
): Promise<DeviceList> {
  const videoDevices: Device[] = [];
  const audioDevices: Device[] = [];

  // Parse
  const execute = (fulfill?: (value: unknown) => void) => {
    exec(deviceParser.cmd, (err, stdout, stderr) => {
      stderr
        .split('\n')
        .filter(deviceParser.searchPrefix)
        .forEach((line: string) => {
          const result: Record<string, string | Device> | undefined = deviceParser.lineParser(line);
          const deviceList = result?.type === 'video' ? videoDevices : audioDevices;
          if (result) {
            console.log('getDeviceList result', result);
            deviceList.push(result.device as Device);
          }
        });

      fulfill({ videoDevices, audioDevices });
    });
  };

  if (typeof callback === 'function') {
    execute(callback);
  } else {
    return new Promise(execute) as Promise<DeviceList>;
  }
}

export { getDeviceList };
