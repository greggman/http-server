var send = require('send');
var debug = require('debug')('compress');
var parse = require('url').parse;
var fs = require('fs');
var path = require('path');
var mime = send.mime;

function setHeader(res, path, encoding) {
  var type = mime.lookup(path);
  var charset = mime.charsets.lookup(type);

  debug('content-type %s', type);
  res.setHeader('Content-Type', type + (charset ? '; charset=' + charset : ''));
  res.setHeader('Content-Encoding', encoding);
  res.setHeader('Vary', 'Accept-Encoding');
}

function handleGzipBroti(root, options) {
  var setHeaders = options.setHeaders;

  var methods = [];
  if (options.brotli) {
    methods.push({ extension: '.br', encoding: 'br' });
  }
  if (options.gzip) {
    methods.push({ extension: '.gz', encoding: 'gzip' });
  }

  function checkExtension(req, method) {
    var acceptEncoding = req.headers['accept-encoding'] || '';
    if (!~acceptEncoding.indexOf(method.encoding)) {
      return;
    }

    var name = {
      orig: parse(req.url).pathname
    };

    if (name.orig[name.orig.length - 1] === '/') {
      name.compressed = name.orig;
      name.orig += options.index;
      name.index = options.index + method.extension;
    }
    else {
      name.compressed = name.orig + method.extension;
    }
    name.full = path.join(root, name.orig + method.extension);
    debug('request %s, check for %s', req.url, name.full);

    try {
      var stats = fs.statSync(name.full);
      if (!stats.isDirectory()) {
        name.encoding = method.encoding;
        return name;
      }
    }
    catch (e) {
      // file probably didn't exist
    }
  }

  return function (req, res, next) {
    if (req.method !== 'GET'  && req.method !== 'HEAD') {
      return next();
    }

    var name;
    for (var i = 0; !name && i < methods.length; i++) {
      name = checkExtension(req, methods[i]);
    }
    if (!name) {
      debug('Passing %s', req.url);
      return next();
    }

    debug('Sending %s', name.full);
    setHeader(res, name.orig, name.encoding);

    var stream = send(req, name.compressed, {
        maxAge: options.maxAge || 0,
        root:  root,
        index: name.index,
        cacheControl: options.cacheControl,
        lastModified: options.lastModified,
        etag: options.etag,
        dotfiles: options.dotfiles
      })
      .on('error', next);

    if (setHeaders) {
      stream.on('headers', setHeaders);
    }
    stream.pipe(res);
  };
}

module.exports = handleGzipBroti;
