'use strict';

const util = require('util');
const EventEmitter = require('events').EventEmitter;
const serviceName = require('multicast-dns-service-types');
const dnsEqual = require('dns-equal');
const dnsTxt = require('dns-txt');

const TLD = '.local';
const WILDCARD = '_services._dns-sd._udp' + TLD;

module.exports = Browser;

util.inherits(Browser, EventEmitter);

/**
 * Start a browser
 *
 * The browser listens for services by querying for PTR records of a given
 * type, protocol and domain, e.g. _http._tcp.local.
 *
 * If no type is given, a wild card search is performed.
 *
 * An internal list of online services is kept which starts out empty. When
 * ever a new service is discovered, it's added to the list and an "up" event
 * is emitted with that service. When it's discovered that the service is no
 * longer available, it is removed from the list and a "down" event is emitted
 * with that service.
 */
function Browser(mdns, opts, onup) {
	if (typeof opts === 'function') return new Browser(mdns, null, opts);

	EventEmitter.call(this);

	opts = opts || {};

	this._mdns = mdns;
	this._onresponse = null;
	this._serviceMap = {};
	this._txt = dnsTxt(opts.txt);

	let types = opts.types || [];
	if (!Array.isArray(types)) {
		types = [types];
	}

	if ((types.length === 0) && (opts.type)) {
		if (opts.subtypes) {
			types.push({[opts.type]: opts.subtypes});
		} else {
			types.push(opts.type);
		}
	}

	this._wildcard = !Boolean(types.length);
	this._names = this._wildcard ? [WILDCARD] : [];
	if (types.length) {
		types.filter(type => Boolean(type)).forEach(type => {
			if (typeof type === 'string') {
				this._names.push(serviceName.stringify(type, opts.protocol || 'tcp') + TLD);
			} else if (typeof type === 'object') {
				const names = Object.keys(type);
				names.forEach(name => {
					let subtypes = type[name];
					if (!subtypes) return;
					if (!Array.isArray(subtypes)) subtypes = [subtypes];
					subtypes.forEach(subtype => {
						this._names.push('_' + subtype + '._sub.' + serviceName.stringify(name, opts.protocol || 'tcp') + TLD);
					});
				});
			}
		});
	}

	this.services = [];

	if (onup) this.on('up', onup);

	this.start()
}

Browser.prototype.start = function () {
	if (this._onresponse) return;
	const self = this;
	const nameMap = {};
	const nameInMap = function (recordName) {
		let nameMatch = false;
		self._names.forEach(function (name) {
			if (name === recordName) {
				nameMatch = true
			}
		});
		return nameMatch
	};

	// List of names for the browser to listen for. In a normal search this will
	// be the primary name stored on the browser. In case of a wildcard search
	// the names will be determined at runtime as responses come in.
	if (!this._wildcard) {
		this._names.forEach(function (name) {
			nameMap[name] = true
		})
	}

	this._onresponse = function (packet, rinfo) {
		if (self._wildcard) {
			packet.answers.forEach(function (answer) {
				if (answer.type !== 'PTR' || nameInMap(answer.map) || answer.name in nameMap) return;
				nameMap[answer.data] = true;
				self._mdns.query(answer.data, 'PTR')
			})
		}

		Object.keys(nameMap).forEach(function (name) {
			// unregister all services shutting down
			goodbyes(name, packet).forEach(self._removeService.bind(self));

			// register all new services
			const matches = buildServicesFor(name, packet, self._txt, rinfo);
			if (matches.length === 0) return;

			matches.forEach(function (service) {
				let serviceIndex = 0;
				if (self._serviceMap[service.fqdn]) {
					// ignore already registered services, which exist is the new service
					// has no subtype
					if (service.subtypes.length === 0) return;

					// Check to see if this includes a subtype that didn't exist previously
					// If so, add it to the service already cached and emit a CB
					for (serviceIndex = 0; serviceIndex < self.services.length; serviceIndex += 1) {
						if (self.services[serviceIndex].fqdn === service.fqdn) {
							break
						}
					}
					// If the service subtype type already exists in the service, ignore it.
					if (self.services[serviceIndex].subtypes.indexOf(service.subtypes[0]) !== -1) return;

					self.services[serviceIndex].subtypes.push(service.subtypes[0]);
					self.emit('up', self.services[serviceIndex])
				} else {
					self._addService(service)
				}
			})
		})
	};

	this._mdns.on('response', this._onresponse);
	this.update()
};

Browser.prototype.stop = function () {
	if (!this._onresponse) return;

	this._mdns.removeListener('response', this._onresponse);
	this._onresponse = null
};

Browser.prototype.update = function () {
	const self = this;
	this._names.forEach(function (name) {
		self._mdns.query(name, 'PTR')
	})
};

Browser.prototype._addService = function (service) {
	this.services.push(service);
	this._serviceMap[service.fqdn] = true;
	this.emit('up', service)
};

Browser.prototype._removeService = function (fqdn) {
	let service, index;
	this.services.some(function (s, i) {
		if (dnsEqual(s.fqdn, fqdn)) {
			service = s;
			index = i;
			return true
		}
	});
	if (!service) return;
	this.services.splice(index, 1);
	delete this._serviceMap[fqdn];
	this.emit('down', service)
};

// PTR records with a TTL of 0 is considered a "goodbye" announcement. I.e. a
// DNS response broadcasted when a service shuts down in order to let the
// network know that the service is no longer going to be available.
//
// For more info see:
// https://tools.ietf.org/html/rfc6762#section-8.4
//
// This function returns an array of all resource records considered a goodbye
// record
function goodbyes(name, packet) {
	return packet.answers.concat(packet.additionals)
		.filter(function (rr) {
			return rr.type === 'PTR' && rr.ttl === 0 && dnsEqual(rr.name, name)
		})
		.map(function (rr) {
			return rr.data
		})
}

function buildServicesFor(name, packet, txt, referer) {
	const records = packet.answers.concat(packet.additionals).filter(function (rr) {
		return rr.ttl > 0 // ignore goodbye messages
	});

	return records
		.filter(function (rr) {
			return rr.type === 'PTR' && dnsEqual(rr.name, name)
		})
		.map(function (ptr) {
			const service = {
				addresses: []
			};

			records
				.filter(function (rr) {
					return (rr.type === 'SRV' || rr.type === 'TXT') && dnsEqual(rr.name, ptr.data)
				})
				.forEach(function (rr) {
					if (rr.type === 'SRV') {
						const parts = rr.name.split('.');
						const name = parts[0];
						const types = serviceName.parse(parts.slice(1, -1).join('.'));
						const subparts = ptr.name.split('.');
						service.name = name;
						service.fqdn = rr.name;
						service.host = rr.data.target;
						service.referer = referer;
						service.port = rr.data.port;
						service.type = types.name;
						service.protocol = types.protocol;

						// If the subparts length is larger than the parts length, then
						// there does indeed exist a subtype and we add that to the main
						// service record.
						if (subparts.length > (parts.length - 1)) {
							service.subtypes = [subparts[0].slice(1)]
						} else {
							service.subtypes = []
						}
					} else if (rr.type === 'TXT') {
						service.rawTxt = rr.data;
						service.txt = txt.decode(rr.data)
					}
				});

			if (!service.name) return;

			records
				.filter(function (rr) {
					return (rr.type === 'A' || rr.type === 'AAAA') && dnsEqual(rr.name, service.host)
				})
				.forEach(function (rr) {
					service.addresses.push(rr.data)
				});

			return service
		})
		.filter(function (rr) {
			return !!rr
		})
}
