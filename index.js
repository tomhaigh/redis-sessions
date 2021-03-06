// Generated by CoffeeScript 1.6.3
/*
Redis Sessions

The MIT License (MIT)

Copyright © 2013 Patrick Liess, http://www.tcs.de

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/


(function() {
  var RedisInst, RedisSessions, _,
    __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

  _ = require("underscore");

  RedisInst = require("redis");

  RedisSessions = (function() {
    function RedisSessions(o) {
      var wipe, _ref, _ref1;
      if (o == null) {
        o = {};
      }
      this._wipe = __bind(this._wipe, this);
      this._returnSessions = __bind(this._returnSessions, this);
      this._initErrors = __bind(this._initErrors, this);
      this._handleError = __bind(this._handleError, this);
      this.soid = __bind(this.soid, this);
      this.soapp = __bind(this.soapp, this);
      this.set = __bind(this.set, this);
      this.killsoid = __bind(this.killsoid, this);
      this.killall = __bind(this.killall, this);
      this._kill = __bind(this._kill, this);
      this.kill = __bind(this.kill, this);
      this.get = __bind(this.get, this);
      this.create = __bind(this.create, this);
      this.activity = __bind(this.activity, this);
      this._initErrors();
      this.redisns = o.namespace || "rs";
      this.redisns = this.redisns + ":";
      if (((_ref = o.client) != null ? (_ref1 = _ref.constructor) != null ? _ref1.name : void 0 : void 0) === "RedisClient") {
        this.redis = o.client;
      } else {
        this.redis = RedisInst.createClient(o.port || 6379, o.host || "127.0.0.1", o.options || {});
      }
      wipe = o.wipe || 600;
      if (wipe < 10) {
        wipe = 10;
      }
      setInterval(this._wipe, wipe * 1000);
    }

    RedisSessions.prototype.activity = function(options, cb) {
      if (this._validate(options, ["app", "dt"], cb) === false) {
        return;
      }
      this.redis.zcount("" + this.redisns + options.app + ":_users", this._now() - options.dt, "+inf", function(err, resp) {
        if (err) {
          cb(err);
          return;
        }
        cb(null, {
          activity: resp
        });
      });
    };

    RedisSessions.prototype.create = function(options, cb) {
      var mc, token;
      options = this._validate(options, ["app", "id", "ip", "ttl"], cb);
      if (options === false) {
        return;
      }
      token = this._createToken();
      mc = this._createMultiStatement(options.app, token, options.id, options.ttl);
      mc.push(["sadd", "" + this.redisns + options.app + ":us:" + options.id, token]);
      mc.push(["hmset", "" + this.redisns + options.app + ":" + token, "id", options.id, "r", 1, "w", 1, "ip", options.ip, "la", this._now(), "ttl", parseInt(options.ttl)]);
      this.redis.multi(mc).exec(function(err, resp) {
        if (err) {
          cb(err);
          return;
        }
        if (resp[4] !== "OK") {
          cb("Unknow error");
          return;
        }
        cb(null, {
          token: token
        });
      });
    };

    RedisSessions.prototype.get = function(options, cb) {
      var now, thekey,
        _this = this;
      options = this._validate(options, ["app", "token"], cb);
      if (options === false) {
        return;
      }
      now = this._now();
      thekey = "" + this.redisns + options.app + ":" + options.token;
      this.redis.hmget(thekey, "id", "r", "w", "ttl", "d", "la", "ip", function(err, resp) {
        var mc, o;
        if (err) {
          cb(err);
          return;
        }
        o = _this._prepareSession(resp);
        if (o === null) {
          cb(null, {});
          return;
        }
        if (options._noupdate) {
          cb(null, o);
          return;
        }
        mc = _this._createMultiStatement(options.app, options.token, o.id, o.ttl);
        mc.push(["hincrby", thekey, "r", 1]);
        if (o.idle > 1) {
          mc.push(["hset", thekey, "la", now]);
        }
        _this.redis.multi(mc).exec(function(err, resp) {
          if (err) {
            cb(err);
            return;
          }
          cb(null, o);
        });
      });
    };

    RedisSessions.prototype.kill = function(options, cb) {
      var _this = this;
      options = this._validate(options, ["app", "token"], cb);
      if (options === false) {
        return;
      }
      options._noupdate = true;
      this.get(options, function(err, resp) {
        if (err) {
          cb(err);
          return;
        }
        if (!resp.id) {
          cb(null, {
            kill: 0
          });
          return;
        }
        options.id = resp.id;
        _this._kill(options, cb);
      });
    };

    RedisSessions.prototype._kill = function(options, cb) {
      var mc,
        _this = this;
      mc = [["zrem", "" + this.redisns + options.app + ":_sessions", "" + options.token + ":" + options.id], ["srem", "" + this.redisns + options.app + ":us:" + options.id, options.token], ["zrem", "" + this.redisns + "SESSIONS", "" + options.app + ":" + options.token + ":" + options.id], ["del", "" + this.redisns + options.app + ":" + options.token], ["exists", "" + this.redisns + options.app + ":us:" + options.id]];
      this.redis.multi(mc).exec(function(err, resp) {
        if (err) {
          cb(err);
          return;
        }
        if (resp[4] === 0) {
          _this.redis.zrem("" + _this.redisns + options.app + ":_users", options.id, function() {
            if (err) {
              cb(err);
              return;
            }
            cb(null, {
              kill: resp[3]
            });
          });
        } else {
          cb(null, {
            kill: resp[3]
          });
        }
      });
    };

    RedisSessions.prototype.killall = function(options, cb) {
      var appsessionkey, appuserkey,
        _this = this;
      options = this._validate(options, ["app"], cb);
      if (options === false) {
        return;
      }
      appsessionkey = "" + this.redisns + options.app + ":_sessions";
      appuserkey = "" + this.redisns + options.app + ":_users";
      this.redis.zrange(appsessionkey, 0, -1, function(err, resp) {
        var e, globalkeys, mc, thekey, tokenkeys, userkeys, ussets, _i, _len;
        if (err) {
          cb(err);
          return;
        }
        if (!resp.length) {
          cb(null, {
            kill: 0
          });
          return;
        }
        globalkeys = [];
        tokenkeys = [];
        userkeys = [];
        for (_i = 0, _len = resp.length; _i < _len; _i++) {
          e = resp[_i];
          thekey = e.split(":");
          globalkeys.push("" + options.app + ":" + e);
          tokenkeys.push("" + _this.redisns + options.app + ":" + thekey[0]);
          userkeys.push(thekey[1]);
        }
        userkeys = _.uniq(userkeys);
        ussets = (function() {
          var _j, _len1, _results;
          _results = [];
          for (_j = 0, _len1 = userkeys.length; _j < _len1; _j++) {
            e = userkeys[_j];
            _results.push("" + this.redisns + options.app + ":us:" + e);
          }
          return _results;
        }).call(_this);
        mc = [["zrem", appsessionkey].concat(resp), ["zrem", appuserkey].concat(userkeys), ["zrem", "" + _this.redisns + "SESSIONS"].concat(globalkeys), ["del"].concat(ussets), ["del"].concat(tokenkeys)];
        _this.redis.multi(mc).exec(function(err, resp) {
          if (err) {
            cb(err);
            return;
          }
          cb(null, {
            kill: resp[0]
          });
        });
      });
    };

    RedisSessions.prototype.killsoid = function(options, cb) {
      var _this = this;
      options = this._validate(options, ["app", "id"], cb);
      if (options === false) {
        return;
      }
      this.redis.smembers("" + this.redisns + options.app + ":us:" + options.id, function(err, resp) {
        var mc, token, _i, _len;
        if (err) {
          cb(err);
          return;
        }
        if (!resp.length) {
          cb(null, {
            kill: 0
          });
          return;
        }
        mc = [];
        for (_i = 0, _len = resp.length; _i < _len; _i++) {
          token = resp[_i];
          mc.push(["zrem", "" + _this.redisns + options.app + ":_sessions", "" + token + ":" + options.id]);
          mc.push(["srem", "" + _this.redisns + options.app + ":us:" + options.id, token]);
          mc.push(["zrem", "" + _this.redisns + "SESSIONS", "" + options.app + ":" + token + ":" + options.id]);
          mc.push(["del", "" + _this.redisns + options.app + ":" + token]);
        }
        mc.push(["exists", "" + _this.redisns + options.app + ":us:" + options.id]);
        _this.redis.multi(mc).exec(function(err, resp) {
          var e, total, _j, _len1, _ref;
          if (err) {
            cb(err);
            return;
          }
          total = 0;
          _ref = resp.slice(3);
          for (_j = 0, _len1 = _ref.length; _j < _len1; _j += 4) {
            e = _ref[_j];
            total = total + e;
          }
          if (_.last(resp) === 0) {
            _this.redis.zrem("" + _this.redisns + options.app + ":_users", options.id, function() {
              cb(null, {
                kill: total
              });
            });
          } else {
            cb(null, {
              kill: total
            });
          }
        });
      });
    };

    RedisSessions.prototype.set = function(options, cb) {
      var _this = this;
      options = this._validate(options, ["app", "token", "d"], cb);
      if (options === false) {
        return;
      }
      options._noupdate = true;
      this.get(options, function(err, resp) {
        var e, mc, nullkeys, thekey;
        if (err) {
          cb(err);
          return;
        }
        if (!resp.id) {
          cb(null, {});
          return;
        }
        nullkeys = [];
        for (e in options.d) {
          if (options.d[e] === null) {
            nullkeys.push(e);
          }
        }
        if (resp.d) {
          resp.d = _.extend(_.omit(resp.d, nullkeys), _.omit(options.d, nullkeys));
        } else {
          resp.d = _.omit(options.d, nullkeys);
        }
        thekey = "" + _this.redisns + options.app + ":" + options.token;
        mc = _this._createMultiStatement(options.app, options.token, resp.id, resp.ttl);
        mc.push(["hincrby", thekey, "w", 1]);
        if (resp.idle > 1) {
          mc.push(["hset", thekey, "la", _this._now()]);
        }
        if (_.keys(resp.d).length) {
          mc.push(["hset", thekey, "d", JSON.stringify(resp.d)]);
        } else {
          mc.push(["hdel", thekey, "d"]);
          resp = _.omit(resp, "d");
        }
        _this.redis.multi(mc).exec(function(err, reply) {
          if (err) {
            cb(err);
            return;
          }
          resp.w = reply[3];
          cb(null, resp);
        });
      });
    };

    RedisSessions.prototype.soapp = function(options, cb) {
      var _this = this;
      if (this._validate(options, ["app", "dt"], cb) === false) {
        return;
      }
      this.redis.zrevrangebyscore("" + this.redisns + options.app + ":_sessions", "+inf", this._now() - options.dt, function(err, resp) {
        var e;
        if (err) {
          cb(err);
          return;
        }
        resp = (function() {
          var _i, _len, _results;
          _results = [];
          for (_i = 0, _len = resp.length; _i < _len; _i++) {
            e = resp[_i];
            _results.push(e.split(':')[0]);
          }
          return _results;
        })();
        _this._returnSessions(options, resp, cb);
      });
    };

    RedisSessions.prototype.soid = function(options, cb) {
      var _this = this;
      options = this._validate(options, ["app", "id"], cb);
      if (options === false) {
        return;
      }
      this.redis.smembers("" + this.redisns + options.app + ":us:" + options.id, function(err, resp) {
        if (err) {
          cb(err);
          return;
        }
        _this._returnSessions(options, resp, cb);
      });
    };

    RedisSessions.prototype._createMultiStatement = function(app, token, id, ttl) {
      var now;
      now = this._now();
      return [["zadd", "" + this.redisns + app + ":_sessions", now, "" + token + ":" + id], ["zadd", "" + this.redisns + app + ":_users", now, id], ["zadd", "" + this.redisns + "SESSIONS", now + ttl, "" + app + ":" + token + ":" + id]];
    };

    RedisSessions.prototype._createToken = function() {
      var i, possible, t, _i;
      t = "";
      possible = "ABCDEFGHIJKLMNOPQRSTUVWXYabcdefghijklmnopqrstuvwxyz0123456789";
      for (i = _i = 0; _i < 55; i = ++_i) {
        t += possible.charAt(Math.floor(Math.random() * possible.length));
      }
      return t + 'Z' + new Date().getTime().toString(36);
    };

    RedisSessions.prototype._handleError = function(cb, err, data) {
      var _err, _ref;
      if (data == null) {
        data = {};
      }
      if (_.isString(err)) {
        _err = new Error();
        _err.name = err;
        _err.message = ((_ref = this._ERRORS) != null ? typeof _ref[err] === "function" ? _ref[err](data) : void 0 : void 0) || "unkown";
      } else {
        _err = err;
      }
      cb(_err);
    };

    RedisSessions.prototype._initErrors = function() {
      var key, msg, _ref;
      this._ERRORS = {};
      _ref = this.ERRORS;
      for (key in _ref) {
        msg = _ref[key];
        this._ERRORS[key] = _.template(msg);
      }
    };

    RedisSessions.prototype._now = function() {
      return parseInt((new Date()).getTime() / 1000);
    };

    RedisSessions.prototype._prepareSession = function(session) {
      var now, o;
      now = this._now();
      if (session[0] === null) {
        return null;
      }
      o = {
        id: session[0],
        r: Number(session[1]),
        w: Number(session[2]),
        ttl: Number(session[3]),
        idle: now - session[5],
        ip: session[6]
      };
      if (o.ttl < o.idle) {
        return null;
      }
      if (session[4]) {
        o.d = JSON.parse(session[4]);
      }
      return o;
    };

    RedisSessions.prototype._returnSessions = function(options, sessions, cb) {
      var e, mc,
        _this = this;
      if (!sessions.length) {
        cb(null, {
          sessions: []
        });
        return;
      }
      mc = (function() {
        var _i, _len, _results;
        _results = [];
        for (_i = 0, _len = sessions.length; _i < _len; _i++) {
          e = sessions[_i];
          _results.push(["hmget", "" + this.redisns + options.app + ":" + e, "id", "r", "w", "ttl", "d", "la", "ip"]);
        }
        return _results;
      }).call(this);
      this.redis.multi(mc).exec(function(err, resp) {
        var o;
        if (err) {
          cb(err);
          return;
        }
        o = (function() {
          var _i, _len, _results;
          _results = [];
          for (_i = 0, _len = resp.length; _i < _len; _i++) {
            e = resp[_i];
            _results.push(this._prepareSession(e));
          }
          return _results;
        }).call(_this);
        cb(null, {
          sessions: o
        });
      });
    };

    RedisSessions.prototype._VALID = {
      app: /^([a-zA-Z0-9_-]){3,20}$/,
      id: /^([a-zA-Z0-9_-]){1,64}$/,
      ip: /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
      token: /^([a-zA-Z0-9]){64}$/
    };

    RedisSessions.prototype._validate = function(o, items, cb) {
      var e, item, keys, _i, _len;
      for (_i = 0, _len = items.length; _i < _len; _i++) {
        item = items[_i];
        switch (item) {
          case "app":
          case "id":
          case "ip":
          case "token":
            if (!o[item]) {
              this._handleError(cb, "missingParameter", {
                item: item
              });
              return false;
            }
            o[item] = o[item].toString();
            if (!this._VALID[item].test(o[item])) {
              this._handleError(cb, "invalidFormat", {
                item: item
              });
              return false;
            }
            break;
          case "ttl":
            o.ttl = parseInt(o.ttl || 7200, 10);
            if (_.isNaN(o.ttl) || !_.isNumber(o.ttl) || o.ttl < 10) {
              this._handleError(cb, "invalidValue", {
                msg: "ttl must be a positive integer >= 10"
              });
              return false;
            }
            break;
          case "dt":
            o[item] = parseInt(o[item], 10);
            if (_.isNaN(o[item]) || !_.isNumber(o[item]) || o[item] < 10) {
              this._handleError(cb, "invalidValue", {
                msg: "ttl must be a positive integer >= 10"
              });
              return false;
            }
            break;
          case "d":
            if (!o[item]) {
              this._handleError(cb, "missingParameter", {
                item: item
              });
              return false;
            }
            if (!_.isObject(o.d)) {
              this._handleError(cb, "invalidValue", {
                msg: "d must be an object"
              });
              return false;
            }
            keys = _.keys(o.d);
            if (!keys.length) {
              this._handleError(cb, "invalidValue", {
                msg: "d must containt at least one key."
              });
              return false;
            }
            for (e in o.d) {
              if (!_.isString(o.d[e]) && !_.isNumber(o.d[e]) && !_.isBoolean(o.d[e]) && !_.isNull(o.d[e])) {
                this._handleError(cb, "invalidValue", {
                  msg: "d." + e + " has a forbidden type. Only strings, numbers, boolean and null are allowed."
                });
                return false;
              }
            }
        }
      }
      return o;
    };

    RedisSessions.prototype._wipe = function() {
      var _this = this;
      this.redis.zrangebyscore("" + this.redisns + "SESSIONS", "-inf", this._now(), function(err, resp) {
        if (err) {
          return;
        }
        if (resp.length) {
          console.log("WIPING:", resp.length, " sessions");
          _.each(resp, function(e) {
            var options;
            e = e.split(':');
            options = {
              app: e[0],
              token: e[1],
              id: e[2]
            };
            _this._kill(options, function() {});
          });
        }
      });
    };

    RedisSessions.prototype.ERRORS = {
      "missingParameter": "No <%= item %> supplied",
      "invalidFormat": "Invalid <%= item %> format",
      "invalidValue": "<%= msg %>"
    };

    return RedisSessions;

  })();

  module.exports = RedisSessions;

}).call(this);
