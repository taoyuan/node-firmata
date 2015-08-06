var Board = require("../lib/firmata").Board;
var a = new Board("/dev/tty.usbmodem1411");
var b = new Board("/dev/tty.usbmodem1421");

a.on("ready", function() {
  var received = [];
  var serialId = a.SERIAL_PORT_IDs.SW_SERIAL0;

  a.serialConfig({
    portId: serialId,
    baud: 9600,
    bytesToRead: 6,
    rxPin: 10,
    txPin: 11
  });

  a.serialRead(serialId, function(data) {
    for (var i = 0; i < data.length; i++) {
      received.push(data[i]);

      if (String.fromCharCode(received[received.length - 1]) === "!") {
        // prints "hello!"
        console.log("%s, the time is %s", new Buffer(received).toString("ascii"), new Date().toTimeString());
        received.length = 0;
      }
    }
  });
});

b.on("ready", function() {
  var serialId = b.SERIAL_PORT_IDs.SW_SERIAL0;

  b.serialConfig({
    portId: serialId,
    baud: 9600,
    bytesToRead: 0,
    rxPin: 10,
    txPin: 11
  });

  setInterval(function() {
    var data = "hello!".split("").map(function(character) {
      return character.charCodeAt(0);
    });
    b.serialWrite(serialId, data);
  }, 2000);
});
