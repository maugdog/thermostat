var tools = require('./tools.js'); // Load misc tools

// Read any command line arguments and establish default options
var args = tools.processCLArgs({
  mode: 'heat', // heat | cool
  units: 'f', // f for Fahrenheit, c for Celsius, k for Kelvin
  temp: 80, // Target temperature in specified units
  tolerance: 2, // Allowable tolerance in degrees of specified units
  frequency: 1000, // Frequency of temperature samples in milliseconds.
  buffer: 2000 // The number of milliseconds that the switch must remain OFF before it can be turned BACK on. Prevents rapid switching cycles that can damage electronics.
});

// Dummy function for testing
function Dummy(options) {
  this.thermostat = options.hasOwnProperty('thermostat') ? options.thermostat : null;
  this.temp = options.start;
  this.increment = options.increment;

  /** Return a random integer! */

  this.readDummyTemp = function(callback) {
    if(thermostat.isOn) {
      this.temp += this.increment;
    } else if(thermostat._lastStateChange) {
      this.temp -= this.increment;
    }

    if(callback) {
      callback(Number((this.temp).toFixed(2)));
    } else {
      console.log('MAX31855: Read request issued with no callback.');
    }
  };

  this.readTempK = this.readDummyTemp;
  this.readTempC = this.readDummyTemp;
  this.readTempF = this.readDummyTemp;
}

// See above args for options
function Thermostat(options) {
  this.isHeater = options.mode === 'heat';
  this.units = options.units;
  this.temp = options.temp;
  this.tolerance = options.tolerance;
  this.frequency = options.frequency;
  this.buffer = options.buffer;
  this.isOn = false;

  this._interval = null;
  //this._max31855 = require('max31855')(); // Load the MAX31855 thermocouple amplifier library
  this._max31855 = new Dummy({start: 30, increment: .5, thermostat: this});
  this._isReading = false;
  this._lastStateChange = 0;
  this._allowTolerance = false;
}

// Set the state to ON
Thermostat.prototype._setState = function(shouldBeOn) {
  if(!this.isOn && shouldBeOn) {
    console.log('Turn the Power Switch Tail ON here');
    this._lastStateChange = new Date().getTime();
    this.isOn = true;
  } else if(this.isOn && !shouldBeOn) {
    console.log('Turn the Power Switch Tail OFF here');
    this._lastStateChange = new Date().getTime();
    this.isOn = false;
  }
};

Thermostat.prototype._setStateForTemp = function(tempReading) {
  var time = new Date().getTime();
  // Make certain that we've waited long enough between state switches
  if(time - this._lastStateChange >= this.buffer) {
    if(this.isHeater && tempReading >= this.temp) {
      this._allowTolerance = true; // Allow the next temperature trigger value to have a tolerance
      this._setState(false);
    } else if(this.isHeater
        && ((!this._allowTolerance && tempReading < this.temp)
        || (this._allowTolerance && tempReading < this.temp-this.tolerance))) {
      this._allowTolerance = false; // The next temperature trigger value may not have a tolerance
      this._setState(true);
    } else if(!this.isHeater
        && ((!this._allowTolerance && tempReading > this.temp)
        || (this._allowTolerance && tempReading > this.temp+this.tolerance))) {
      this._allowTolerance = false; // The next temperature trigger value may not have a tolerance
      this._setState(true);
    } else if(!this.isHeater && tempReading < this.temp) {
      this._allowTolerance = true; // Allow the next temperature trigger value to have a tolerance
      this._setState(false);
    }
  }
};

// Start checking the thermocouple reading on regular intervals
Thermostat.prototype.run = function() {
  var self = this; // Scope closure
  this._interval = setInterval(function () {
    if(!self._isReading) {
      self._isReading = true;
      switch(self.units) {
        case 'c':
          self._max31855.readTempC(function(temp) {
            self._isReading = false;
            self._setStateForTemp(temp);
          });
          break;
        case 'k':
          self._max31855.readTempK(function(temp) {
            self._isReading = false;
            self._setStateForTemp(temp);
          });
          break;
        case 'f':
        default:
          self._max31855.readTempF(function(temp) {
            console.log('Read: ', temp);
            self._isReading = false;
            self._setStateForTemp(temp);
          });
          break;
      }
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
};

var thermostat = new Thermostat(args);
thermostat.run();

//process.stdin.resume();//so the program will not close instantly

var exitHandler = function(options, err) {
  thermostat.stop();

  if (options.cleanup) console.log('clean');
  if (err) console.log(err.stack);
  if (options.exit) process.exit();
};

process.on('exit', exitHandler.bind(null,{cleanup:true})); // Handle app close events
process.on('SIGINT', exitHandler.bind(null, {exit:true})); // Catches ctrl+c event
process.on('uncaughtException', exitHandler.bind(null, {exit:true})); // Catches uncaught exceptions
