const fs = require('fs-extra')
const path = require('path')
const tls = require('tls')
const crypto = require('crypto')

class Server {

  static get() {

    if ('env' in process) {
      this.baseCert = fs.readFileSync(process.env.BASE_CERT, 'utf8')
      this.baseKey = fs.readFileSync(process.env.BASE_KEY, 'utf8')
      this.wildcardCert = fs.readFileSync(process.env.WILDCARD_CERT, 'utf8')
      this.wildcardKey = fs.readFileSync(process.env.WILDCARD_KEY, 'utf8')
      this.domain = process.env.DOMAIN
    } else {
      throw new Error('No env found')
    }

    const secureContext = {}

    secureContext[this.domain] = tls.createSecureContext({
        key: this.baseKey,
        cert: this.baseCert
      })
    secureContext[`*.${this.domain}`] = tls.createSecureContext({
      key: this.wildcardKey,
      cert: this.wildcardCert
    })

    try {
      var options = {
        SNICallback: function (domain, cb) {
          if (domain !== this.domain) {
            domain = `*.${this.domain}`
          }
          if (secureContext[domain]) {
            if (cb) {
              cb(null, secureContext[domain]);
            } else {
              // compatibility for older versions of node
              return secureContext[domain];
            }
          } else {
            throw new Error('No keys/certificates for domain requested');
          }
        },
        key: this.baseKey,
        cert: this.baseCert
      }
      const server = https.createServer(options);
      //     , function (req, res) {
      //   res.end('Your dynamic SSL server worked!')
      //   // Here you can put proxy server routing here to send the request
      //   // to the application of your choosing, running on another port.
      //   // node-http-proxy is a great npm package for this
      // }); //.listen(443);
      return server;
    } catch (err) {
      console.error(err.message);
      console.error(err.stack);
    }
    // Inside the server you can use nodejs

  }


}


module.exports = Server
