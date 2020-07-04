const fs = require('fs-extra')
const tls = require('tls')
const https = require('https')

class Server {

  static get() {

    const baseCert = fs.readFileSync(process.env.BASE_CERT, 'utf8')
    const baseKey = fs.readFileSync(process.env.BASE_KEY, 'utf8')
    const wildcardCert = fs.readFileSync(process.env.WILDCARD_CERT, 'utf8')
    const wildcardKey = fs.readFileSync(process.env.WILDCARD_KEY, 'utf8')

    const secureContext = {
      base: tls.createSecureContext({
        key: baseKey,
        cert: baseCert
      }),
      wildcard: tls.createSecureContext({
        key: wildcardKey,
        cert: wildcardCert
      })
    }

    try {
      var options = {
        SNICallback: function (domain, cb) {
          let what = domain.split('.').length === 2 ? 'base' : 'wildcard';
          if (secureContext[what]) {
            if (cb) {
              cb(null, secureContext[what]);
            } else {
              // compatibility for older versions of node
              return secureContext[what];
            }
          } else {
            throw new Error('No keys/certificates for domain requested');
          }
        },
        key: baseKey,
        cert: baseCert
      }
      const server = https.createServer(options);
      return server;
    } catch (err) {
      console.error(err.message);
      console.error(err.stack);
    }

  }


}


module.exports = Server
