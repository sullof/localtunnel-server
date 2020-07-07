const log = require('book');
const Koa = require('koa');
const tldjs = require('tldjs');
const Debug = require('./utils/Debug');
const http = require('http');
const Router = require('koa-router');
const {version} = require('../package.json');
const {Crypto, Secrez} = require('@secrez/core');

const ClientManager = require('./lib/ClientManager');
const debug = Debug('localtunnel:server');

const allIds = {}

function getRandomId(publicKey) {
  let id
  let prefix = Crypto.toBase58(publicKey).substring(0, 4)
  for (; ;) {
    id = (prefix + Crypto.getRandomId()).toLowerCase()
    if (allIds) {
      if (allIds[id]) {
        continue
      }
    }
    return id
  }
}

module.exports = function (opt) {
  opt = opt || {};

  const validHosts = (opt.domain) ? [opt.domain] : undefined;
  const myTldjs = tldjs.fromUserSettings({validHosts});
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
      const result = {
        status_code: 404,
        message: 'Not found'
      }
      ctx.status = 404;
      ctx.body = result;
      return;
    }

    const stats = client.stats();
    ctx.body = {
      connected_sockets: stats.connectedSockets,
    };
  });

  router.get('/api/v1/tunnel/new', async (ctx, next) => {
    let {reqId, salt, publicKey, signature} = ctx.request.query;
    if (!Secrez.isValidPublicKey(publicKey)) {
      const result = {
        status_code: 400,
        message: 'Wrong public key'
      }
      ctx.status = 400;
      ctx.body = result;
      return;

    }
    if (Crypto.verifySignature([reqId || '', publicKey, salt].join(''), signature, publicKey)) {
      const result = {
        status_code: 400,
        message: 'Wrong signature'
      }
      ctx.status = 400;
      ctx.body = result;
      return;
    }
    if (reqId) {
      if (!Crypto.isBase58String(reqId) || reqId.length !== 8 || allIds[reqId]) {
        const result = {
          status_code: 400,
          message: 'Wrong requested id'
        }
        ctx.status = 400;
        ctx.body = result;
        return;
      }
    }
    if (!reqId) {
      reqId = getRandomId(publicKey);
    }
    debug('making new client with id %s', reqId);

    const info = await manager.newClient(reqId, debug);
    const url = schema + '://' + info.id + '.' + ctx.request.host;
    info.url = url;
    ctx.body = info;
    allIds[reqId] = true;
  });

  router.get('/api/v1/courier/:cmd', async (ctx, next) => {

    const hostname = ctx.request.headers.host;
    const clientId = GetClientIdFromHostname(hostname);

    if (!clientId) {
      appCallback(req, res);
      return;
    }

    const client = manager.getClient(clientId);

    if (!client) {
      const result = {
        status_code: 404,
        message: 'Not found'
      }
      ctx.status = 404;
      ctx.body = result;
      return;
    }

    client.handleRequest(ctx.request, ctx.response);

  })

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

  const server = http.createServer();

  const appCallback = app.callback();

  server.on('request', (req, res) => {
    // without a hostname, we won't know who the request is for

    const hostname = req.headers.host;
    if (!hostname) {
      res.statusCode = 400;
      let result = {
        status_code: 400,
        message: 'Host header is required'
      }
      res.end(JSON.stringify(result));
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
      let result = {
        status_code: 404,
        message: 'Not found'
      }
      res.end(JSON.stringify(result));
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
