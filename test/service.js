'use strict';

const os = require('os');
const test = require('tape');
const Service = require('../lib/service');

const getAddressesRecords = function (host) {
	const records = [];
	const itrs = os.networkInterfaces();
	for (let i in itrs) {
		const addrs = itrs[i];
		for (const j in addrs) {
			if (addrs[j].internal === false) {
				records.push({data: addrs[j].address, name: host, ttl: 120, type: addrs[j].family === 'IPv4' ? 'A' : 'AAAA'})
			}
		}
	}
	return records
};

test('no name', function (t) {
	t.throws(function () {
		new Service({type: 'http', port: 3000}) // eslint-disable-line no-new
	}, 'Required name not given');
	t.end()
});

test('no type', function (t) {
	t.throws(function () {
		new Service({name: 'Foo Bar', port: 3000}) // eslint-disable-line no-new
	}, 'Required type not given');
	t.end()
});

test('no port', function (t) {
	t.throws(function () {
		new Service({name: 'Foo Bar', type: 'http'}) // eslint-disable-line no-new
	}, 'Required port not given');
	t.end()
});

test('minimal', function (t) {
	const s = new Service({name: 'Foo Bar', type: 'http', port: 3000});
	t.equal(s.name, 'Foo Bar');
	t.equal(s.protocol, 'tcp');
	t.equal(s.type, '_http._tcp');
	t.equal(s.host, os.hostname());
	t.equal(s.port, 3000);
	t.equal(s.fqdn, 'Foo Bar._http._tcp.local');
	t.equal(s.txt, null);
	t.equal(s.subtypes, null);
	t.equal(s.flush, false);
	t.equal(s.published, false);
	t.end()
});

test('protocol', function (t) {
	const s = new Service({name: 'Foo Bar', type: 'http', port: 3000, protocol: 'udp'});
	t.deepEqual(s.protocol, 'udp');
	t.end()
});

test('host', function (t) {
	const s = new Service({name: 'Foo Bar', type: 'http', port: 3000, host: 'example.com'});
	t.deepEqual(s.host, 'example.com');
	t.end()
});

test('txt', function (t) {
	const s = new Service({name: 'Foo Bar', type: 'http', port: 3000, txt: {foo: 'bar'}});
	t.deepEqual(s.txt, {foo: 'bar'});
	t.end()
});

test('addresses', function (t) {
	const s1 = new Service({
		name: 'Foo Bar',
		type: 'http',
		port: 3000,
		host: 'testhost1.com',
		addresses: {ipv4: ['1.2.3.4'], ipv6: ['2001:db8::01:02', 'fe80::01:02']}
	});
	const s2 = new Service({
		name: 'Foo Bar',
		type: 'http',
		port: 3000,
		host: 'testhost2.com',
		addresses: {ipv4: ['5.6.7.8', '9.10.11.12']}
	});

	t.deepEqual(s1.addresses, {ipv4: ['1.2.3.4'], ipv6: ['2001:db8::01:02', 'fe80::01:02']});
	t.deepEqual(s2.addresses, {ipv4: ['5.6.7.8', '9.10.11.12']});
	t.end()
});

test('flush', function (t) {
	const s = new Service({name: 'Foo Bar', type: 'http', port: 3000, host: 'example.com', flush: true});
	t.deepEqual(s.flush, true);
	t.end()
});

test('_records() - minimal', function (t) {
	const s = new Service({name: 'Foo Bar', type: 'http', protocol: 'tcp', port: 3000});
	t.deepEqual(s._records(), [
		{data: '_http._tcp.local', name: '_services._dns-sd._udp.local', ttl: 28800, type: 'PTR', flush: false},
		{data: s.fqdn, name: '_http._tcp.local', ttl: 28800, type: 'PTR', flush: false},
		{data: {port: 3000, target: os.hostname()}, name: s.fqdn, ttl: 120, type: 'SRV', flush: false},
		{data: new Buffer('00', 'hex'), name: s.fqdn, ttl: 4500, type: 'TXT', flush: false}
	].concat(getAddressesRecords(s.host)));
	t.end()
});

test('_records() - everything bar addresses', function (t) {
	const s = new Service({
		name: 'Foo Bar',
		type: 'http',
		protocol: 'tcp',
		port: 3000,
		host: 'example.com',
		txt: {foo: 'bar'}
	});
	t.deepEqual(s._records(), [
		{data: '_http._tcp.local', name: '_services._dns-sd._udp.local', ttl: 28800, type: 'PTR', flush: false},
		{data: s.fqdn, name: '_http._tcp.local', ttl: 28800, type: 'PTR', flush: false},
		{data: {port: 3000, target: 'example.com'}, name: s.fqdn, ttl: 120, type: 'SRV', flush: false},
		{data: new Buffer('07666f6f3d626172', 'hex'), name: s.fqdn, ttl: 4500, type: 'TXT', flush: false}
	].concat(getAddressesRecords(s.host)));
	t.end()
});

test('_records() - everything including addresses', function (t) {
	const s = new Service({
		name: 'Foo Bar',
		type: 'http',
		protocol: 'tcp',
		port: 3000,
		host: 'example.com',
		txt: {foo: 'bar'},
		addresses: {ipv4: ['13.14.15.16'], ipv6: ['2001:db8::01:03', 'fe80::01:03']}
	});
	t.deepEqual(s._records(), [
		{data: '_http._tcp.local', name: '_services._dns-sd._udp.local', ttl: 28800, type: 'PTR', flush: false},
		{data: s.fqdn, name: '_http._tcp.local', ttl: 28800, type: 'PTR', flush: false},
		{data: {port: 3000, target: 'example.com'}, name: s.fqdn, ttl: 120, type: 'SRV', flush: false},
		{data: new Buffer('07666f6f3d626172', 'hex'), name: s.fqdn, ttl: 4500, type: 'TXT', flush: false},
		{data: '13.14.15.16', name: 'example.com', ttl: 120, type: 'A'},
		{data: '2001:db8::01:03', name: 'example.com', ttl: 120, type: 'AAAA'},
		{data: 'fe80::01:03', name: 'example.com', ttl: 120, type: 'AAAA'}
	]);
	t.end()
});
