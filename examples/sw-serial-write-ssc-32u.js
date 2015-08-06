var Board = require("../lib/firmata").Board;
var board = new Board("/dev/tty.usbmodem1421");

board.on("ready", function() {
  var SW_SERIAL0 = board.SERIAL_PORT_IDs.SW_SERIAL0;

  board.serialConfig({
    portId: SW_SERIAL0,
    baud: 9600,
    bytesToRead: 0,
    rxPin: 10,
    txPin: 11
  });

  var commands = [
    "#0 P1500 T100",
    "#0 P2400 T500",
    "#0 P600 T1000",
    "#0 P2400 T1000",
    "#0 P1500 T100",
  ];

  var index = 0;

  function update() {
    var command = commands[index];
    var delay = Number(/T(\d.+)/.exec(command)[1]);
    var data = command.split("").map(function(character) {
      return character.charCodeAt(0);
    });

    // Add lf, cr
    data.push(10, 13);
    board.serialWrite(SW_SERIAL0, data);

    index++;

    if (index === commands.length) {
      index = 0;
    }

    setTimeout(update, delay);
  }

  update();
});
