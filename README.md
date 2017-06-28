# H264 Converter

This library convert raw H.264 video streaming to fragmented mp4 for the Media Source Extensions of browser.

## Install

```bash
npm install --save h264-converter
```

## Usage

```js
import VideoConverter from 'h264-converter';

// setup
const element = document.getElementById('videoTagId');
const converter = new VideoConverter(element, 30, 6);

// start streaming
fetch('/h264/raw/stream').then((res) => {
  if (res.body) {
    const reader = res.body.getReader();
    reader.read().then(function processResult(result) {
      function decode(value) {
        converter.appendRawData(value);
      }

      if (result.done) {
        decode([]);
        console.log('Video Stream is done.');
        return Promise.resolve();
      }
      decode(result.value);

      return reader.read().then(processResult);
    });
    converter.play();
    this.canceler = (message?: string) => {
      reader.cancel();
      console.log('Video Stream Request Canceled', message);
    };
  }
}).catch((err) => {
  console.error('Video Stream Request error', err);
});
```

## API

### class `VideoConverter`

#### `constructor(videoElement: HTMLVideoElement, fps: number, fpf?: number)`

- videoElement: the `video` element for display video streaming by Media Source Extensions API.
- fps: frames per second of video stream.
- fpf: frames per fragment of mp4.

#### `appendRawData(data: ArrayLike<number>): void`

append raw h264 data from streaming.

- data: the received data from streaming.

#### `play(): void`

start to play the converted video.

#### `pause(): void`

pause the video.

#### `reset(): void`

reset inner state for changing stream.


### debugging

#### `setLogger(log: Logger, error?: Logger): void`

set logger for output debugging log.

- log: info logger, such as `console.log`.
- error: error logger, such as `console.error`. default is same sa `log` value.
