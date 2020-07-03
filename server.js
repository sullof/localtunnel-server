const log = require('book');
const Koa = require('koa');
const tldjs = require('tldjs');
const Debug = require('debug');
const http = require('http');
const Router = require('koa-router');
const {version} = require('./package.json');
const {Crypto} = require('@secrez/core');

const ClientManager = require('./lib/ClientManager');

const allIds = [];

const debug = Debug('localtunnel:server');

module.exports =  function(opt) {
    opt = opt || {};

    const validHosts = (opt.domain) ? [opt.domain] : undefined;
    const myTldjs = tldjs.fromUserSettings({ validHosts });
    const landingPage = opt.landing;

    function GetClientIdFromHostname(hostname) {
        return myTldjs.getSubdomain(hostname);
    }

    const manager = new ClientManager(opt);

    const schema = opt.secure ? 'https' : 'http';

    const app = new Koa();
    const router = new Router();

    router.get('/api/v1/status', async (ctx, next) => {
        const stats = manager.stats;
        ctx.body = {
            tunnels: stats.tunnels,
            mem: process.memoryUsage(),
        };
    });

    router.get('/api/v1/tunnels/:id/status', async (ctx, next) => {
        const clientId = ctx.params.id;
        const client = manager.getClient(clientId);
        if (!client) {
            ctx.throw(404);
            return;
        }

        const stats = client.stats();
        ctx.body = {
            connected_sockets: stats.connectedSockets,
        };
    });

    router.get('/api/v1/tunnel/new', async (ctx, next) => {
        const reqId = Crypto.getRandomId(allIds);
        allIds.push(reqId);
        debug('making new client with id %s', reqId);

        const info = await manager.newClient(reqId, debug);
        const url = schema + '://' + info.id + '.' + ctx.request.host;
        info.url = url;
        ctx.body = info;
    });

    // router.get('/api/v1/courier/*', async (ctx, next) => {
    //
    //     const hostname = ctx.request.headers.host;
    //     const clientId = GetClientIdFromHostname(hostname);
    //
    //     if (!clientId) {
    //         appCallback(req, res);
    //         return;
    //     }
    //
    //     const client = manager.getClient(clientId);
    //
    //     if (!client) {
    //         res.statusCode = 404;
    //         res.end('404');
    //         return;
    //     }
    //
    //     client.handleRequest(ctx.request, ctx.response);
    //
    // })

    app.use(router.routes());
    app.use(router.allowedMethods());

    // root endpoint
    app.use(async (ctx, next) => {
        const path = ctx.request.path;

        const hostname = ctx.request.headers.host;

        // skip anything not on the root path
        if (path !== '/' || GetClientIdFromHostname(hostname)) {
            await next();
            return;
        }
        if (landingPage) {
            // no new client request, send to landing page
            ctx.redirect(landingPage);
        } else {
            ctx.body = {
                welcome_to: 'Secrez Hub',
                version,
                more_info_at: 'https://secrez.github.io/secrez'
            }
            return;
        }
    });

    // anything after the / path is a request for a specific client name
    // This is a backwards compat feature
    app.use(async (ctx, next) => {
        const parts = ctx.request.path.split('/');

        // any request with several layers of paths is not allowed
        // rejects /foo/bar
        // allow /foo
        if (parts.length !== 2) {
            await next();
            return;
        }

        const reqId = parts[1];

        // limit requested hostnames to 63 characters
        if (! /^(?:[a-z0-9][a-z0-9\-]{4,63}[a-z0-9]|[a-z0-9]{4,63})$/.test(reqId)) {
            const msg = 'Invalid subdomain. Subdomains must be lowercase and between 4 and 63 alphanumeric characters.';
            ctx.status = 403;
            ctx.body = {
                message: msg,
            };
            return;
        }

        debug('making new client with id %s', reqId);
        const info = await manager.newClient(reqId);

        const url = schema + '://' + info.id + '.' + ctx.request.host;
        info.url = url;
        ctx.body = info;
        return;
    });

    const server = http.createServer();

    const appCallback = app.callback();

    server.on('request', (req, res) => {
        // without a hostname, we won't know who the request is for
        const hostname = req.headers.host;
        if (!hostname) {
            res.statusCode = 400;
            res.end('Host header is required');
            return;
        }

        const clientId = GetClientIdFromHostname(hostname);

        if (!clientId) {
            appCallback(req, res);
            return;
        }

        const client = manager.getClient(clientId);

        if (!client) {
            res.statusCode = 404;
            res.end('404');
            return;
        }

        client.handleRequest(req, res);
    });

    server.on('upgrade', (req, socket, head) => {
        const hostname = req.headers.host;
        if (!hostname) {
            socket.destroy();
            return;
        }

        const clientId = GetClientIdFromHostname(hostname);
        if (!clientId) {
            socket.destroy();
            return;
        }

        const client = manager.getClient(clientId);

        if (!client) {
            socket.destroy();
            return;
        }

        client.handleUpgrade(req, socket);
    });

    return server;
};
