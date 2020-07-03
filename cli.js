
require('localenv');
const optimist = require('optimist');

const log = require('book');
const Debug = require('debug');

const CreateServer = require('./src/server');

const debug = Debug('localtunnel');

const argv = optimist
    .usage('Usage: $0 --port [num]')
    .options('secure', {
        default: true,
        describe: 'use this flag to indicate proxy over https'
    })
    .options('port', {
        default: '9494',
        describe: 'listen on this port for outside requests'
    })
    .options('landing', {
        describe: 'the url of the landing page, if any'
    })
    .options('address', {
        default: '0.0.0.0',
        describe: 'IP address to bind to'
    })
    .options('domain', {
        default: 'secrez.cc',
        describe: 'Specify the base domain name. This is optional if hosting localtunnel from a regular example.com domain. This is required if hosting a localtunnel server from a subdomain (i.e. lt.example.dom where clients will be client-app.lt.example.come)',
    })
    .options('max-sockets', {
        default: 10,
        describe: 'maximum number of tcp sockets each client is allowed to establish at one time (the tunnels)'
    })
    .argv;

if (argv.help) {
    optimist.showHelp();
    process.exit();
}

const server = CreateServer({
    max_tcp_sockets: argv['max-sockets'],
    secure: argv.secure,
    domain: argv.domain,
    landing: argv.landing
});

server.listen(argv.port, argv.address, () => {
    debug('server listening on port: %d', server.address().port);
});

process.on('SIGINT', () => {
    process.exit();
});

process.on('SIGTERM', () => {
    process.exit();
});

process.on('uncaughtException', (err) => {
    log.error(err);
});

process.on('unhandledRejection', (reason, promise) => {
    log.error(reason);
});


