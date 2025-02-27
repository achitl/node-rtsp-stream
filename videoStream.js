var ws = require('ws');
var util = require('util');
var https = require('https');
var events = require('events');
var Mpeg1Muxer = require('./mpeg1muxer');
var STREAM_MAGIC_BYTES = "jsmp"; // Must be 4 bytes

var VideoStream = function(options) {
  this.options = options;
  this.name = options.name;
  this.streamUrl = options.streamUrl;
  this.width = options.width;
  this.height = options.height;
  this.wsPort = options.wsPort;
  this.inputStreamStarted = false;
  this.stream = undefined;
  this.httpsServer = undefined;
  this.startMpeg1Stream();
  this.pipeStreamToSocketServer();
  return this;
}

util.inherits(VideoStream, events.EventEmitter);

VideoStream.prototype.stop = function() {
  this.wsServer.close();
  if(this.httpsServer) this.httpsServer.close(()=>{console.log("Https server closed."); this.httpsServer = undefined;});
  this.stream.kill();
  this.inputStreamStarted = false;
  return this;
}

VideoStream.prototype.startMpeg1Stream = function() {

  this.mpeg1Muxer = new Mpeg1Muxer({
    ffmpegOptions: this.options.ffmpegOptions,
    rtspTransport: this.options.rtspTransport,
    url: this.streamUrl
  });
  
  this.stream = this.mpeg1Muxer.stream;
  
  if (this.inputStreamStarted) {
    return;
  }

  this.mpeg1Muxer.on('mpeg1data', (data) => {
    return this.emit('camdata', data);
  });

  var gettingInputData = false;
  var inputData = [];
  var gettingOutputData = false;
  var outputData = [];

  this.mpeg1Muxer.on('ffmpegStderr', (data) => {
    var size;
    data = data.toString();

    if (data.indexOf('Input #') !== -1) {
      gettingInputData = true;
    }

    if (data.indexOf('Output #') !== -1) {
      gettingInputData = false;
      gettingOutputData = true;
    }

    if (data.indexOf('frame') === 0) {
      gettingOutputData = false;
    }

    if (gettingInputData) {

      inputData.push(data.toString());
      size = data.match(/\d+x\d+/);

      if (size != null) {

        size = size[0].split('x');

        if (this.width == null) {
          this.width = parseInt(size[0], 10);
        }

        if (this.height == null) {
          return this.height = parseInt(size[1], 10);
        }
      }
    }
  });

  this.mpeg1Muxer.on('ffmpegStderr', function(data) {
    return global.process.stderr.write(data);
  });

  this.mpeg1Muxer.on('exitWithError', () => {
    return this.emit('exitWithError');
  });

  return this;
}

VideoStream.prototype.pipeStreamToSocketServer = function() {
  
  if(this.options.cert && this.options.key){
    console.log("wss connection")
    this.httpsServer = https.createServer({
      cert: this.options.cert,
      key: this.options.key,
    }, function (req, res) {
      console.log(new Date() + ' ' +
      req.connection.remoteAddress + ' ' +
      req.method + ' ' + req.url);
      res.writeHead(200);
      res.end("hello foobarbackend\n");
    });

    this.wsServer = new ws.Server({
      server: this.httpsServer,
      perMessageDeflate: false
    });
  }
  else {
    console.log("ws connection");
    this.wsServer = new ws.Server({
      port: this.wsPort
    });
  }

  this.wsServer.on("connection", (socket, request) => {
    return this.onSocketConnect(socket, request);
  });

  this.wsServer.broadcast = function(data, opts) {
    
    var results = [];

    for (let client of this.clients) {
      if (client.readyState === 1) {
        results.push(client.send(data, opts));
      } else {
        results.push(console.log("Error: Client from remoteAddress " + client.remoteAddress + " not connected."));
      }
    }
    return results;
  }

  if(this.options.cert && this.options.key){
    this.httpsServer.listen(this.wsPort);
  }

  return this.on('camdata', (data) => {
    return this.wsServer.broadcast(data);
  });
}

VideoStream.prototype.onSocketConnect = function(socket, request) {
  // Send magic bytes and video size to the newly connected socket
  // struct { char magic[4]; unsigned short width, height;}
  var streamHeader = new Buffer(8);
  streamHeader.write(STREAM_MAGIC_BYTES);
  streamHeader.writeUInt16BE(this.width, 4);
  streamHeader.writeUInt16BE(this.height, 6);
  socket.send(streamHeader, {
    binary: true
  });

  console.log(`${this.name}: New WebSocket Connection (` + this.wsServer.clients.size + " total)");

  socket.remoteAddress = request.connection.remoteAddress;

  return socket.on("close", (code, message) => {
    return console.log(`${this.name}: Disconnected WebSocket (` + this.wsServer.clients.size + " total)");
  });
}

module.exports = VideoStream;