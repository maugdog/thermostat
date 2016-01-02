Thermostat
=========

Node.js application for driving a Power Switch Tail II according to thermocouple data amplified via the Adafruit MAX31855
amplifier.

**Note:** (As of 12/29/2015) The SPI master driver is disabled by default on Raspian Linux and must be enabled before using this application
with hardware SPI. See [here](https://www.raspberrypi.org/documentation/hardware/raspberrypi/spi/README.md). Also due to permissions, you *may* need to run node with sudo to access the SPI bus.

## Usage

    var Thermostat = require('thermostat');
    var thermostat = new Thermostat(options);

    // Create a Thermostat instance
    var thermostat = new Thermostat(thermostatOptions());
    // Configure the power switch to be controlled, and the sensor to provide temperature input data
    thermostat.powerSwitch = yourPowerSwitchObject;
    thermostat.thermoSensor = yourThermoSensorObject;
    // Optional handler can be called after the thermostat takes a temp reading
    thermostat.afterTempRead = function(sender) { ... };
    // Go!
    thermostat.run();

## Options

TODO

## Release History

* 1.0.0 Initial release
