// See above args for options
function Thermostat(options) {
  this.isHeater = options.hasOwnProperty('isHeater') ? options.isHeater : true;
  this.targetTemp = options.hasOwnProperty('targetTemp') ? options.targetTemp : 80;
  this.holdTime = options.hasOwnProperty('holdTime') ? options.holdTime : -1;
  this.tolerance = options.hasOwnProperty('tolerance') ? options.tolerance : 2;
  this.frequency = options.hasOwnProperty('frequency') ? options.frequency : 1000;
  this.buffer = options.hasOwnProperty('buffer') ? options.buffer : 2000;

  this.currentTemp = NaN;

  /** The thermoSensor object must define a readTemp(callback) method that passes the current
    temperature value as a float (in degrees celsius) to the callback.
  */
  this.thermoSensor = null;

  /** The powerswitch object must define an isOn property, as well as setOn() and setOff() methods. */
  this.powerswitch = null;

  /** If defined, this handler will be called on each read of the thermoSensor.
    It is passed the calling ThermoStat instance as its only param. */
  this.afterTempRead = null;

  // Private
  // The setInterval object used as a timer for sensor probing
  this._interval = null;
  this._isReading = false;
  this._timeTargetTempReached = 0; // The time at which target temp was first reached
  this._lastStateChange = 0;
  this._allowTolerance = false;
}

// Updates the thermostat's options
Thermostat.prototype.updateOptions = function(options) {
  if(options.hasOwnProperty('isHeater')) { this.isHeater = options.isHeater; }
  if(options.hasOwnProperty('targetTemp')) { this.targetTemp = options.targetTemp; }
  if(options.hasOwnProperty('holdTime')) { this.holdTime = options.holdTime; }
  if(options.hasOwnProperty('tolerance')) { this.tolerance = options.tolerance; }
  if(options.hasOwnProperty('frequency')) { this.frequency = options.frequency; }
  if(options.hasOwnProperty('buffer')) { this.buffer = options.buffer; }
}

// Set the state to ON
Thermostat.prototype._setState = function(shouldBeOn) {
  var currentTime = new Date().getTime();
  if(!this.powerswitch.isOn && shouldBeOn) {
    this._lastStateChange = currentTime;
    this.powerswitch.setOn();
  } else if(this.powerswitch.isOn && !shouldBeOn) {
    this._lastStateChange = currentTime;
    this.powerswitch.setOff();
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

  // If just reaching target temp for the first time, then set _timeTargetTempReached
  if(this.holdTime >= 0 && !this._timeTargetTempReached
      && ((this.isHeater && tempReading >= this.targetTemp)
      || (!this.isHeater && tempReading <= this.targetTemp))) {
    this._timeTargetTempReached = currentTime;
  }
};

// Returns the time remaining in milliseconds
Thermostat.prototype.timeRemaining = function() {
  var timeRemaining = this.holdTime;
  if(this.holdTime >= 0 && this._timeTargetTempReached) {
    var currentTime = new Date().getTime();
    timeRemaining = Math.max(0, this.holdTime - (currentTime - this._timeTargetTempReached));
  }
  return timeRemaining;
}

// Start checking the thermoSensor reading on regular intervals
Thermostat.prototype.run = function() {
  if(this.thermoSensor) {
    if(!this.powerswitch) {
      console.error('Thermostat warning: No switch object provided. Will run as a thermometer until you set the powerswitch property.');
    }

    // Good to go, start running this thing!
    var self = this; // Scope closure
    this._interval = setInterval(function () {
      // Make sure that the hold time hasn't been reached
      var currentTime = new Date().getTime();
      if(self.holdTime >= 0 && self._timeTargetTempReached && currentTime - self._timeTargetTempReached >= self.holdTime) {
        self.stop();
      }

      if(!self._isReading) {
        self._isReading = true;
        self.thermoSensor.readTemp(function(temp) {
          self.currentTemp = temp;
          self._isReading = false;
          if(self.powerswitch) { self._setStateForTemp(temp); }

          // Call the afterTempRead handler
          if(self.afterTempRead) {self.afterTempRead(self);}
        });
      } else {
        console.error('Thermostat error: Still waiting for temperature from thermoSensor. Perhaps your read frequency is too high, or your sensor is not connected properly.');
      }
    }, this.frequency);
  } else {
    console.error('Thermostat error: No sensor object provided. Please set the thermoSensor property.');
  }
};

// Stops the thermostat, setting the switch off, and canceling the temperature check intervals
Thermostat.prototype.stop = function() {
  if(this._interval) {
    clearInterval(this._interval);
    this._interval = null;
  }
  this._setState(false);
};

module.exports = Thermostat;
