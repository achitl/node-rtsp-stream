var child_process = require('child_process');
var util = require('util');
var events = require('events');

var Mpeg1Muxer = function(options) {
  
  var key;
  this.url = options.url;
  this.ffmpegOptions = options.ffmpegOptions;
  this.exitCode = undefined;
  this.rtspTransport = options.rtspTransport;
  this.additionalFlags = [];

  if (this.ffmpegOptions) {
    for (key in this.ffmpegOptions) {
      this.additionalFlags.push(key);
      if (String(this.ffmpegOptions[key]) !== '') {
        this.additionalFlags.push(String(this.ffmpegOptions[key]));
      }
    }
  }

  if(this.rtspTransport){
    this.spawnOptions = [
      "-rtsp_transport",
      this.rtspTransport,
      "-i",
      this.url,
      '-f',
      'mpegts',
      '-codec:v',
      'mpeg1video',
      // additional ffmpeg options go here
      ...this.additionalFlags,
      '-'
    ]
  }
  else {
    this.spawnOptions = [
      "-i",
      this.url,
      '-f',
      'mpegts',
      '-codec:v',
      'mpeg1video',
      // additional ffmpeg options go here
      ...this.additionalFlags,
      '-'
    ]
  }

  this.stream = child_process.spawn("ffmpeg", this.spawnOptions, {
    detached: false
  });

  this.inputStreamStarted = true;

  this.stream.stdout.on('data', (data) => {
    return this.emit('mpeg1data', data)
  });

  this.stream.stderr.on('data', (data) => {
    return this.emit('ffmpegStderr', data)
  });

  this.stream.on('exit', (code, signal) => {
    if (code === 1) {
      console.error('RTSP stream exited with error');
      this.exitCode = 1;
      return this.emit('exitWithError');
    }
  });
  
  return this;
}

util.inherits(Mpeg1Muxer, events.EventEmitter);

module.exports = Mpeg1Muxer;
