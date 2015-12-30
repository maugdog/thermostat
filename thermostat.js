var tools = require('./tools.js'); // Load misc tools
var max31855 = require('max31855');
var util = require('util');
var clc = require('cli-color');

// Read any command line arguments and establish default options
var args = tools.processCLArgs({
  mode: 'heat', // heat || cool.
  units: 'f', // f for Fahrenheit, c for Celsius, k for Kelvin.
  temp: 80, // Target temperature in specified units.
  time: -1, // If greater than -1, then specifies the length of time (in ms) to hold the target temp.
  tolerance: 2, // Allowable tolerance in degrees of specified units.
  frequency: 1000, // Frequency of temperature samples in milliseconds.
  buffer: 2000 // The number of milliseconds that the switch must remain OFF before it can be turned BACK on. Prevents rapid switching cycles that can damage electronics.
});

// Dummy function for testing
function Dummy(options) {
  this.thermostat = options.hasOwnProperty('thermostat') ? options.thermostat : null;
  this.temp = options.start;
  this.increment = options.increment;
  this.decrement = options.decrement;

  /** Return a random integer! */

  this.readDummyTemp = function(callback) {
    if(thermostat.isOn) {
      this.temp += this.increment * (thermostat.isHeater ? 1 : -1);
    } else if(thermostat._lastStateChange) {
      this.temp -= this.decrement * (thermostat.isHeater ? 1 : -1);
    }

    if(callback) {
      callback(Number((this.temp).toFixed(2)));
    } else {
      console.log('Error: Read request issued with no callback.');
    }
  };

  this.readTemp = this.readDummyTemp;
}

function max31855Units(unitString) {
  switch(unitString) {
    case 'c':
      return max31855.UNITS.CELSIUS;
    case 'k':
      return max31855.UNITS.KELVIN;
    case 'f':
    default:
      return max31855.UNITS.FAHRENHEIT;
  }
}

// See above args for options
function Thermostat(options) {
  this.isHeater = options.mode === 'heat';
  this._units = options.units;
  this.currentTemp = NaN;
  this.targetTemp = parseFloat(options.temp);
  this.holdTime = parseInt(options.time,10);
  this.tolerance = parseFloat(options.tolerance);
  this.frequency = parseInt(options.frequency,10);
  this.buffer = parseInt(options.buffer,10);
  this.isOn = false;

  this._interval = null;
  //this._thermoSensor = new max31855.ThermoSensor({units: max31855Units(this._units)}); // Load the MAX31855 thermocouple amplifier library
  this._thermoSensor = new Dummy({start: 40, increment: .5, decrement: .2, thermostat: this});
  this._isReading = false;
  this._timeTargetTempReached = 0; // The time at which target temp was first reached
  this._lastStateChange = 0;
  this._allowTolerance = false;
}

// Set the units for the thermostat
Thermostat.prototype._setUnits = function(units) {
  this._units = units;
  this._thermoSensor.units = max31855Units(this._units);
}

Thermostat.prototype._flipSwitch = function(shouldBeOn) {
  // Flip the relay switch here!
}

// Set the state to ON
Thermostat.prototype._setState = function(shouldBeOn) {
  var currentTime = new Date().getTime();
  if(!this.isOn && shouldBeOn) {
    this._lastStateChange = currentTime;
    this.isOn = true;
    this._flipSwitch(true);
  } else if(this.isOn && !shouldBeOn) {
    this._lastStateChange = currentTime;
    this.isOn = false;
    this._flipSwitch(false);
  }
};

Thermostat.prototype._setStateForTemp = function(tempReading) {
  var currentTime = new Date().getTime();
  // Make certain that we've waited long enough between state switches
  if(currentTime - this._lastStateChange >= this.buffer) {
    if(this.isHeater && tempReading >= this.targetTemp) {
      this._allowTolerance = true; // Allow the next temperature trigger value to have a tolerance
      this._setState(false);
    } else if(this.isHeater
        && ((!this._allowTolerance && tempReading < this.targetTemp)
        || (this._allowTolerance && tempReading < this.targetTemp-this.tolerance))) {
      this._allowTolerance = false; // The next temperature trigger value may not have a tolerance
      this._setState(true);
    } else if(!this.isHeater
        && ((!this._allowTolerance && tempReading > this.targetTemp)
        || (this._allowTolerance && tempReading > this.targetTemp+this.tolerance))) {
      this._allowTolerance = false; // The next temperature trigger value may not have a tolerance
      this._setState(true);
    } else if(!this.isHeater && tempReading < this.targetTemp) {
      this._allowTolerance = true; // Allow the next temperature trigger value to have a tolerance
      this._setState(false);
    }
  }

  // If just reaching target temp for the first time, the set the reach time
  if(this.holdTime >= 0 && !this._timeTargetTempReached
      && ((this.isHeater && tempReading >= this.targetTemp)
      || (!this.isHeater && tempReading <= this.targetTemp))) {
    this._timeTargetTempReached = currentTime;
  }
};

// Start checking the thermocouple reading on regular intervals
Thermostat.prototype.run = function() {
  var self = this; // Scope closure
  this._interval = setInterval(function () {
    // Make sure that the hold time hasn't been reached
    var currentTime = new Date().getTime();
    if(self.holdTime >= 0 && self._timeTargetTempReached && currentTime - self._timeTargetTempReached >= self.holdTime) {
      self.stop();
    }

    if(!self._isReading) {
      self._isReading = true;
      self._thermoSensor.readTemp(function(temp) {
        self.currentTemp = temp;
        self._isReading = false;
        self._setStateForTemp(temp);
        self._outputStateToCLI();
      });
    } else {
      console.error('Error: Still waiting for temperature from SPI bus. Perhaps your read frequency is too high, or your MAX31855 board is not connected properly?');
    }
  }, args.frequency);
};

// Stops the thermostat, setting the switch off, and canceling the temperature check intervals
Thermostat.prototype.stop = function() {
  if(this._interval) {
    clearInterval(this._interval);
    this._interval = null;
  }
  this._setState(false);
};

Thermostat.prototype._timeRemainingLabel = function() {
  if(this.holdTime >= 0) {
    var timeRemaining = this.holdTime;
    if(this._timeTargetTempReached) {
      var currentTime = new Date().getTime();
      timeRemaining = Math.floor(Math.max(0, this.holdTime - (currentTime - this._timeTargetTempReached))/1000);
    } else {
      Math.floor(timeRemaining /= 1000);
    }

    var hours   = Math.floor(timeRemaining / 3600);
    var minutes = Math.floor((timeRemaining - (hours * 3600)) / 60);
    var seconds = timeRemaining - (hours * 3600) - (minutes * 60);

    // Pad single digit nums
    if (hours   < 10) {hours   = '0' + hours;}
    if (minutes < 10) {minutes = '0' + minutes;}
    if (seconds < 10) {seconds = '0' + seconds;}

    return util.format('Remaining: %s:%s:%s\t\t', hours, minutes, seconds);
  }
  return '';
}

Thermostat.prototype._outputStateToCLI = function() {
  process.stdout.write(clc.erase.screen);
  process.stdout.write(clc.move.to(0, 0));
  var stateText = null;
  var stateLabel = this.isHeater ? "Heater" : "Chiller";
  if(this.isHeater) {
    stateText = this.isOn ? clc.xterm(202)('ON') : clc.green('OFF');
  } else {
    stateText = this.isOn ? clc.blue('ON') : clc.green('OFF');
  }
  process.stdout.write(util.format('%sTemp(°%s): %s\t\t%s: %s\n\n', this._timeRemainingLabel(), this._units, this.currentTemp, stateLabel, clc.bold(stateText)));
}

var thermostat = new Thermostat(args);
thermostat.run();

var exitHandler = function(options, err) {
  thermostat.stop();

  if (options.cleanup) console.log('clean');
  if (err) console.log(err.stack);
  if (options.exit) process.exit();
};

process.on('exit', exitHandler.bind(null,{cleanup:true})); // Handle app close events
process.on('SIGINT', exitHandler.bind(null, {exit:true})); // Catches ctrl+c event
process.on('uncaughtException', exitHandler.bind(null, {exit:true})); // Catches uncaught exceptions
