const request = require('supertest');
const chai = require('chai');
const assert = chai.assert;
const {Server} = require('ws');
const WebSocketServer = Server;
const WebSocket = require('ws');
const net = require('net');

const createServer = require('../server');

describe('Server', () => {
  it('server starts and stops', async () => {
    const server = createServer();
    await new Promise(resolve => server.listen(resolve));
    await new Promise(resolve => server.close(resolve));
  });

  it('should show the welcome json', async () => {
    const server = createServer();
    const res = await request(server).get('/');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.welcome_to, 'Secrez Hub');
  });

  it('reject long domain name requests', async () => {
    const server = createServer();
    const res = await request(server).get('/thisdomainisoutsidethesizeofwhatweallowwhichissixtythreecharacters');
    assert.equal(res.body.message, 'Invalid subdomain. Subdomains must be lowercase and between 4 and 63 alphanumeric characters.');
  });

  it('should upgrade websocket requests', async () => {
    const hostname = 'websocket-test';
    const server = createServer({
      domain: 'example.com',
    });
    await new Promise(resolve => server.listen(resolve));

    const res = await request(server).get('/websocket-test');
    const localTunnelPort = res.body.port;

    const wss = await new Promise((resolve) => {
      const wsServer = new WebSocketServer({port: 0}, () => {
        resolve(wsServer);
      });
    });

    const websocketServerPort = wss.address().port;

    const ltSocket = net.createConnection({port: localTunnelPort});
    const wsSocket = net.createConnection({port: websocketServerPort});
    ltSocket.pipe(wsSocket).pipe(ltSocket);

    wss.once('connection', (ws) => {
      ws.once('message', (message) => {
        ws.send(message);
      });
    });

    const ws = new WebSocket('http://localhost:' + server.address().port, {
      headers: {
        host: hostname + '.example.com',
      }
    });

    ws.on('open', () => {
      ws.send('something');
    });

    await new Promise((resolve) => {
      ws.once('message', (msg) => {
        assert.equal(msg, 'something');
        resolve();
      });
    });

    wss.close();
    await new Promise(resolve => server.close(resolve));
  });

  it('should support the /api/v1/tunnels/:id/status endpoint', async () => {
    const server = createServer();
    await new Promise(resolve => server.listen(resolve));

    // no such tunnel yet
    const res = await request(server).get('/api/v1/tunnels/foobar-test/status');
    assert.equal(res.statusCode, 404);

    // request a new client called foobar-test
    {
      const res = await request(server).get('/foobar-test');
    }

    {
      const res = await request(server).get('/api/v1/tunnels/foobar-test/status');
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, {
        connected_sockets: 0,
      });
    }

    await new Promise(resolve => server.close(resolve));
  });
});
