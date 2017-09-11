'use strict';

const Registry = require('./lib/registry');
const Server = require('./lib/mdns-server');
const Browser = require('./lib/browser');

class Bonjour {

	static create(opts) {
		return new Bonjour(opts);
	}

	constructor(opts) {
		this._server = new Server(opts);
		this._registry = new Registry(this._server)
	}

	publish(opts) {
		return this._registry.publish(opts)
	}

	unpublishAll(cb) {
		this._registry.unpublishAll(cb)
	}

	find(opts, onup) {
		return new Browser(this._server.mdns, opts, onup)
	}

	findOne(opts, cb) {
		const browser = new Browser(this._server.mdns, opts);
		browser.once('up', function (service) {
			browser.stop();
			if (cb) cb(service)
		});
		return browser
	}

	destroy() {
		this._registry.destroy();
		this._server.mdns.destroy()
	}
}

module.exports = Bonjour;
