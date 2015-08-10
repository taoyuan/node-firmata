var fs = require("fs");
var argv = require("minimist")(process.argv.slice(2));
var SerialPort = require("serialport");
var Board = require("../lib/firmata").Board;
var rport = /usb|acm|^com/i;
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

  console.log("node examples/components --serial='hw'");
  console.log("node examples/components --serial='sw'");
  console.log("     Enable hardware or software serial read/write portion of test program");
  console.log("\n");

  console.log("node examples/components -w");
  console.log("     Enable the 'write' portion of the serial measurement. This will disable the digital read and write measurements on Port 0.");
  console.log("\n");

  console.log("node examples/components -r");
  console.log("     Enable the 'read' portion of the serial measurement. This will disable the digital read and write measurements on Port 1.");
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

  // If the -r or -w flags were set, but no serial
  // measurement specified, shut them off.
  if (argv.r) {
    argv.r = false;
    console.log("Warning: serial read measurement flag detected, but no serial type specified. No measurement will be run or recorded.");
  }

  if (argv.w) {
    argv.w = false;
    console.log("Warning: serial write measurement flag detected, but no serial type specified. No measurement will be run or recorded.");
  }
}

if (argv.serial) {
  // If the serial measurement was specified, but no -r or -w flag
  // was set, print a warning.
  if (typeof argv.r === "undefined") {
    argv.r = false;
    console.log("Warning: no serial read measurement flag provided. No measurement will be run or recorded.");
  }

  if (typeof argv.w === "undefined") {
    argv.w = false;
    console.log("Warning: no serial write measurement flag provided. No measurement will be run or recorded.");
  }
}



SerialPort.list(function(error, devices) {
  var device = devices.reduce(function(accum, found) {
    if (rport.test(found.comName)) {
      return found;
    }
    return accum;
  }, null);


  if (!device) {
    console.log("No board attached.");
    return;
  }

  var board = new Board(device.comName);

  board.on("ready", function() {
    var SW_R = board.SERIAL_PORT_IDs.SW_SERIAL0;
    var SW_W = board.SERIAL_PORT_IDs.SW_SERIAL1;
    var HW_R = board.SERIAL_PORT_IDs.HW_SERIAL1;
    var HW_W = board.SERIAL_PORT_IDs.HW_SERIAL2;

    var isSoftSerial = argv.serial === "sw";
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
        flags: {
          read: argv.r,
          write: argv.w,
        },
        time: argv.time,
        timesheet: timesheet,
        log: log
      };

      fs.writeFileSync(savepath + "/results/" + Date.now() + ".json", JSON.stringify(output, null, 2));
      process.reallyExit();
    }

    if (!argv.w) {
      // Port 0
      // OUT
      board.pinMode(5, board.MODES.OUTPUT);
      // IN
      board.pinMode(6, board.MODES.INPUT);
      board.digitalRead(6, function(data) {
        punchIn("D6");
      });
    }

    if (!argv.r) {
      // Port 1
      // OUT
      board.pinMode(8, board.MODES.OUTPUT);
      // IN
      board.pinMode(9, board.MODES.INPUT);
      board.digitalRead(9, function(data) {
        punchIn("D9");
      });
    }

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

    if (argv.serial && argv.r) {
      board.serialConfig({
        portId: isSoftSerial ? SW_R : HW_R,
        baud: 9600,
        bytesToRead: 10,
        rxPin: 10,
        txPin: 11
      });

      // Connect some readable serial component
      board.serialRead(isSoftSerial ? SW_R : HW_R, function() {
        board.serialFlush();
        punchIn("SW_SERIAL0");
      });
    }

    if (argv.serial && argv.w) {
      board.serialConfig({
        portId: isSoftSerial ? SW_W : HW_W,
        baud: 9600,
        bytesToRead: 0,
        rxPin: 2,
        txPin: 3
      });
    }

    // Initiate all the writes.
    setInterval(function() {
      state ^= 1;

      // If this is not a serial write measurement...
      if (!argv.w) {
        // Write digital out, Port 0, HIGH/LOW
        board.digitalWrite(5, state);
      }

      // If this is not a serial read measurement...
      if (!argv.r) {
        // Write digital out, Port 1, HIGH/LOW
        board.digitalWrite(8, state);
      }

      // Write BlinkM Color, RGB
      board.i2cWrite(0x09, [0x6E, state ? 255 : 0, 0, 0]);

      if (argv.serial && argv.w) {
        board.serialWrite(isSoftSerial ? SW_W : HW_W, [1, 2, 3, 4]);
      }
    }, 20);

    process.on("SIGINT", summary);

    setTimeout(summary, argv.time * 1000);
  });
});

function average(list) {
  return (list.reduce(function(a, b) { return a + b; }) / list.length) | 0;
}
