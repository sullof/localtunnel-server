const fs = require('fs-extra')
const tls = require('tls')
const https = require('https')

class Server {

  static get(app) {

    let baseCert = fs.readFileSync(process.env.BASE_CERT, 'utf8')
    let baseKey = fs.readFileSync(process.env.BASE_KEY, 'utf8')
    let wildcardCert = fs.readFileSync(process.env.WILDCARD_CERT, 'utf8')
    let wildcardKey = fs.readFileSync(process.env.WILDCARD_KEY, 'utf8')

    const secureContext = {}

    console.log(baseKey, baseCert)

    secureContext.base = tls.createSecureContext({
      key: baseKey,
      cert: baseCert
    })
    secureContext.wildcard = tls.createSecureContext({
      key: wildcardKey,
      cert: wildcardCert
    })

    try {
      var options = {
        SNICallback: function (domain, cb) {

          console.log('domain', domain)

          let what = domain.split('.').length === 2 ? 'base' : 'wildcard';
          console.log(secureContext[what])
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
      const server = https.createServer(options); //, app.callback);
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
