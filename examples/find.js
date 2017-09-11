const bonjour = require('..').create();

const found = {};

bonjour.find({types: ['ipp', 'pdl-datastream']}, function (service) {
	if (service.fqdn in found) return;
	found[service.fqdn] = service;
	console.log(service.fqdn);
});
