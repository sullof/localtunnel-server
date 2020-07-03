const util = require('util')


module.exports = (prefix) => {
  return (...content) => {
    if (process.env.NODE_ENV !== 'test') {
      console.info(prefix, '>>', util.format(...content))
    }
  }
}
