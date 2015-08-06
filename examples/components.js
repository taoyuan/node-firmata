var fs = require("fs");
var argv = require("minimist")(process.argv.slice(2));
var Board = require("../lib/firmata").Board;
var board = new Board("/dev/tty.usbmodem1411");
var savepath = __dirname.indexOf("examples") !== -1 ? __dirname.replace("/examples", "") : __dirname;

if (typeof argv.h !== "undefined" || typeof argv.help !== "undefined") {
  console.log("\n");
  console.log("Usage: node examples/components <option>");
  console.log("\n");
  console.log("where <option> is one of:");
  console.log("     description, help, time, serial");
  console.log("\n");

  console.log("node examples/components -h");
  console.log("node examples/components --help");
  console.log("     Display this information");
  console.log("\n");

  console.log("node examples/components --time=<n>");
  console.log("     Set time to run program for, in <n> seconds");
  console.log("\n");

  console.log("node examples/components --author='<you name>'");
  console.log("     Sign off on your test records.");
  console.log("\n");

  console.log("node examples/components --description='<short description>'");
  console.log("     Add a description to be included in the saved results.");
  console.log("\n");

  console.log("node examples/components --display");
  console.log("     Display each 'punch in'");
  console.log("\n");

  console.log("node examples/components --serial");
  console.log("     Enable serial read/write portion of test program");
  console.log("\n");

  process.exit();
}

if (typeof argv.author === "undefined") {
  argv.author = "None Specified";
}

if (typeof argv.description === "undefined") {
  argv.description = "None Specified";
}

if (typeof argv.display === "undefined") {
  argv.display = false;
}

if (typeof argv.time === "undefined") {
  argv.time = 5;
}

if (typeof argv.serial === "undefined") {
  argv.serial = false;
}

board.on("ready", function() {
  var SW_SERIAL0 = board.SERIAL_PORT_IDs.SW_SERIAL0;
  var state = 1;
  var timesheet = {};
  var log = [];

  function punchIn(which) {
    var now = Date.now();
    var lapse;

    if (!timesheet[which]) {
      timesheet[which] = {
        previous: now,
        lapses: []
      };

      return;
    }

    lapse = now - timesheet[which].previous;

    timesheet[which].lapses.push(lapse);
    timesheet[which].previous = now;

    if (argv.display) {
      console.log("%d, %s, %d", now, which, lapse);
    }

    log.push([now, which, lapse].join(", "));
  }

  function summary() {
    Object.keys(timesheet).forEach(function(key) {
      timesheet[key].average = average(timesheet[key].lapses);
      timesheet[key].total = timesheet[key].lapses.length;
      delete timesheet[key].lapses;
      delete timesheet[key].previous;
    });

    var output = {
      description: argv.description,
      serial: argv.serial,
      time: argv.time,
      timesheet: timesheet,
      log: log
    };

    fs.writeFileSync(savepath + "/results/" + Date.now() + ".json", JSON.stringify(output, null, 2));
    process.reallyExit();
  }

  // Port 0
  // OUT
  board.pinMode(7, board.MODES.OUTPUT);
  // IN
  board.pinMode(2, board.MODES.INPUT);
  board.digitalRead(2, function(data) {
    punchIn("D2");
  });

  // Port 1
  // OUT
  board.pinMode(8, board.MODES.OUTPUT);
  // IN
  board.pinMode(9, board.MODES.INPUT);
  board.digitalRead(9, function(data) {
    punchIn("D9");
  });

  // Read all analog pins (floating)
  [0, 1, 2, 3].forEach(function(pin) {
    board.analogRead(pin, function() {
      punchIn("A" + pin);
    });
  });

  // I2C
  board.i2cConfig();

  // BLINKM
  board.i2cWrite(0x09, [0x6F]);
  board.i2cRead(0x09, 0x67, 3, function(data) {
    punchIn("BLINKM");
  });

  // ADXL345
  board.i2cWrite(0x53, 0x2D, 0);
  board.i2cWrite(0x53, 0x2D, 8);
  board.i2cWrite(0x53, 0x31, 8);
  board.i2cRead(0x53, 0x32, 6, function(data) {
    punchIn("ADXL345");
  });

  if (argv.serial) {
    board.serialConfig({
      portId: SW_SERIAL0,
      baud: 9600,
      bytesToRead: 10,
      rxPin: 10,
      txPin: 11
    });

    // This appears to prevent reading from SW_SERIAL0?
    // board.serialConfig({
    //   portId: board.SERIAL_PORT_IDs.SW_SERIAL1,
    //   baud: 9600,
    //   bytesToRead: 0,
    //   rxPin: 4,
    //   txPin: 5
    // });

    // Connect some readable serial component
    board.serialRead(SW_SERIAL0, function() {
      board.serialFlush()
      punchIn("SW_SERIAL0");
    });
  }

  // Initiate all the writes.
  setInterval(function() {
    state ^= 1;

    // Write digital out, Port 0, HIGH/LOW
    board.digitalWrite(7, state);

    // Write digital out, Port 1, HIGH/LOW
    board.digitalWrite(8, state);

    // Write BlinkM Color, RGB
    board.i2cWrite(0x09, [0x6E, state ? 255 : 0, 0, 0]);

    if (argv.serial) {
      // This appears to create "hiccups" for the i2c write
      // board.serialWrite(board.SERIAL_PORT_IDs.SW_SERIAL1, [1, 2, 3, 4]);
    }
  }, 20);

  process.on("SIGINT", summary);

  setTimeout(summary, argv.time * 1000);
});

function average(list) {
  return (list.reduce(function(a, b) { return a + b; }) / list.length) | 0;
}
