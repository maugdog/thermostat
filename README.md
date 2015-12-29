Thermostat
=========

Node.js application for driving a Power Switch Tail II according to thermocouple data amplified via the Adafruit MAX31855
amplifier.

**Note:** (As of 12/29/2015) The SPI master driver is disabled by default on Raspian Linux and must be enabled before using this application
with hardware SPI. See [here](https://www.raspberrypi.org/documentation/hardware/raspberrypi/spi/README.md). Also due to permissions, you *may* need to run node with sudo to access the SPI bus.

## Usage

    $ sudo node thermostat.js

## Release History

* 1.0.0 Initial release
