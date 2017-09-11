const browser = require('..')();

const name = process.argv[2];
const found = {};

browser.find({type: name}, function (service) {
	if (service.fqdn in found) return;
	found[service.fqdn] = true;
	console.log(service.fqdn);
});
