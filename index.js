'use strict';

const Registry = require('./lib/registry');
const Server = require('./lib/mdns-server');
const Browser = require('./lib/browser');

function Bonjour(opts) {
	if (!(this instanceof Bonjour)) return new Bonjour(opts);
	this._server = new Server(opts);
	this._registry = new Registry(this._server);
}

Bonjour.prototype.publish = function(opts) {
	return this._registry.publish(opts);
}

Bonjour.prototype.unpublishAll = function(cb) {
	this._registry.unpublishAll(cb);
}

Bonjour.prototype.find = function(opts, onup) {
	return new Browser(this._server.mdns, opts, onup);
}

Bonjour.prototype.findOne = function(opts, cb) {
	let browser = new Browser(this._server.mdns, opts);
	browser.once('up', function (service) {
		browser.stop();
		if (cb){
			cb(service);
		}
	});
	return browser;
}

Bonjour.prototype.destroy = function () {
	this._registry.destroy();
	this._server.mdns.destroy();
}

module.exports = Bonjour;
