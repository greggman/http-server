'use strict';

var fs = require('fs'),
    express = require('express'),
    serveStatic = require('serve-static'),
    serveIndex = require('serve-index'),
    auth = require('basic-auth'),
    httpProxy = require('http-proxy'),
    cors = require('cors'),
    secureCompare = require('secure-compare'),
    compress = require('./compress');

//
// Remark: backwards compatibility for previous
// case convention of HTTP
//
exports.HttpServer = exports.HTTPServer = HttpServer;

/**
 * Returns a new instance of HttpServer with the
 * specified `options`.
 */
exports.createServer = function (options) {
  return new HttpServer(options);
};

/**
 * Constructor function for the HttpServer object
 * which is responsible for serving static files along
 * with other HTTP-related features.
 */
function HttpServer(options) {
  options = options || {};

  if (options.root) {
    this.root = options.root;
  }
  else {
    try {
      fs.lstatSync('./public');
      this.root = './public';
    }
    catch (err) {
      this.root = './';
    }
  }

  this.headers = options.headers || {};

  this.cache = (
    options.cache === undefined ? 3600 :
    // -1 is a special case to turn off caching.
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#Preventing_caching
    options.cache === -1 ? 'no-cache, no-store, must-revalidate' :
    options.cache // in seconds.
  );
  this.showDir = options.showDir !== 'false';
  this.autoIndex = options.autoIndex !== 'false';
  this.showDotfiles = options.showDotfiles;
  this.gzip = options.gzip === true;
  this.brotli = options.brotli === true;
  this.contentType = options.contentType || 'application/octet-stream';

  if (options.ext) {
    this.ext = options.ext === true
      ? 'html'
      : options.ext;
  }

  var before = options.before ? options.before.slice() : [];
  var app = express();

  app.use(function (req, res, next) {
    if (options.logFn) {
      options.logFn(req, res);
    }
    next();
  });

  if (options.username || options.password) {
    app.use(function (req, res, next) {
      var credentials = auth(req);

      // We perform these outside the if to avoid short-circuiting and giving
      // an attacker knowledge of whether the username is correct via a timing
      // attack.
      if (credentials) {
        var usernameEqual = secureCompare(options.username, credentials.name);
        var passwordEqual = secureCompare(options.password, credentials.pass);
        if (usernameEqual && passwordEqual) {
          return next();
        }
      }

      res.statusCode = 401;
      res.setHeader('WWW-Authenticate', 'Basic realm=""');
      res.end('Access denied');
    });
  }

  if (options.cors) {
    app.use(cors());
  }

  if (options.robots) {
    app.use(function (req, res, next) {
      if (req.url === '/robots.txt') {
        res.setHeader('Content-Type', 'text/plain');
        var robots = options.robots === true
          ? 'User-agent: *\nDisallow: /'
          : options.robots.replace(/\\n/, '\n');

        return res.end(robots);
      }

      next();
    });
  }

  app.use(function (req, res, next) {
    for (var key in this.headers) {
      if (this.headers.hasOwnProperty(key)) {
        res.setHeader(key, this.headers[key]);
      }
    }
    next();
  }.bind(this));

  var staticOptions = {
    //    cache: this.cache,
    dotfiles: this.showDotfiles ? 'allow' : 'ignore',
    index: this.autoIndex ? ['index.html'] : false,
    extensions: this.ext ? [this.ext] : false
    //    contentType: this.contentType,
    //    handleError: typeof options.proxy !== 'string'
  };

  if (this.gzip || this.brotli) {
    app.use(compress(this.root, Object.assign({}, staticOptions, {
      gzip: this.gzip,
      brotli: this.brotli
    })));
  }

  app.use(serveStatic(this.root, staticOptions));

  if (this.showDir) {
    app.use(serveIndex(this.root, {
      icons: true
    }));
  }

  if (typeof options.proxy === 'string') {
    var proxy = httpProxy.createProxyServer({});
    app.use(function (req, res, next) {
      proxy.web(req, res, {
        target: options.proxy,
        changeOrigin: true
      }, function (err, req, res, target) {
        if (options.logFn) {
          options.logFn(req, res, {
            message: err.message,
            status: res.statusCode });
        }
        next();
      });
    });
  }

  app.use(function (req, res) {
    if (options.logFn) {
      options.logFn(req, res, {
        message: 'not found',
        status: 404 });
    }
    res.status(404);
    res.end('(404) Not Found: ' + req.url);
  });

  this.app = app;
  //  listen(8080, hostname);
  //  var serverOptions = {
  //    before: before,
  //    headers: this.headers,
  //    onError: function (err, req, res) {
  //      if (options.logFn) {
  //        options.logFn(req, res, err);
  //      }
  //
  //      res.end();
  //    }
  //  };
  //
  //  if (options.https) {
  //    serverOptions.https = options.https;
  //  }
  //
  //  this.server = union.createServer(serverOptions);
  console.log('-----');
  setTimeout(function () {
    this.server.close();
  }.bind(this), 5 * 1000);
}

var util = require('util');
util.print = function () {
  throw new Error('foo:' + (new Error('')).stack);
};

HttpServer.prototype.listen = function () {
  this.server = this.app.listen.apply(this.app, arguments);
};

HttpServer.prototype.close = function () {
  return this.server.destroy();
};
