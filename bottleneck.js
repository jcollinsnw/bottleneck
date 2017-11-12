(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// Generated by CoffeeScript 2.0.2
(function() {
  var Bottleneck, DLList, MIDDLE_PRIORITY, NB_PRIORITIES, parser,
    slice = [].slice;

  NB_PRIORITIES = 10;

  MIDDLE_PRIORITY = 5;

  parser = require("./parser");

  DLList = require("./DLList");

  Bottleneck = (function() {
    class Bottleneck {
      constructor(options = {}, ...invalid) {
        var ref;
        this.submit = this.submit.bind(this);
        this.schedule = this.schedule.bind(this);
        if (!((options != null) && typeof options === "object" && invalid.length === 0)) {
          throw new Bottleneck.prototype.BottleneckError("Bottleneck v2 takes a single object argument. Refer to https://github.com/SGrondin/bottleneck#upgrading-from-v1 if you're upgrading from Bottleneck v1.");
        }
        parser.load(options, this.defaults, this);
        this._nextRequest = Date.now();
        this._running = 0;
        this._queues = this._makeQueues();
        this._executing = {};
        this._nextIndex = 0;
        this._unblockTime = 0;
        this.penalty = (ref = options.penalty) != null ? ref : (15 * this.minTime) || 5000;
        this._limiter = null;
        this._events = {};
      }

      _addListener(name, status, cb) {
        var base;
        if ((base = this._events)[name] == null) {
          base[name] = [];
        }
        this._events[name].push({cb, status});
        return this;
      }

      _trigger(name, args) {
        if (this.rejectOnDrop && name === "dropped") {
          args.forEach(function(job) {
            return job.cb.apply({}, [new Bottleneck.prototype.BottleneckError("This job has been dropped by Bottleneck")]);
          });
        }
        if (this._events[name] == null) {
          return;
        }
        this._events[name] = this._events[name].filter(function(event) {
          return event.status !== "none";
        });
        return setTimeout((() => {
          return this._events[name].forEach(function(event) {
            if (event.status === "none") {
              return;
            }
            if (event.status === "once") {
              event.status = "none";
            }
            return event.cb.apply({}, args);
          });
        }), 0);
      }

      _makeQueues() {
        var i, j, ref, results;
        results = [];
        for (i = j = 1, ref = NB_PRIORITIES; 1 <= ref ? j <= ref : j >= ref; i = 1 <= ref ? ++j : --j) {
          results.push(new DLList());
        }
        return results;
      }

      chain(_limiter) {
        this._limiter = _limiter;
        return this;
      }

      isBlocked() {
        return this._unblockTime >= Date.now();
      }

      _sanitizePriority(priority) {
        var sProperty;
        sProperty = ~~priority !== priority ? MIDDLE_PRIORITY : priority;
        if (sProperty < 0) {
          return 0;
        } else if (sProperty > NB_PRIORITIES - 1) {
          return NB_PRIORITIES - 1;
        } else {
          return sProperty;
        }
      }

      _find(arr, fn) {
        var ref;
        return (ref = (function() {
          var i, j, len, x;
          for (i = j = 0, len = arr.length; j < len; i = ++j) {
            x = arr[i];
            if (fn(x)) {
              return x;
            }
          }
        })()) != null ? ref : [];
      }

      queued(priority) {
        if (priority != null) {
          return this._queues[this._sanitizePriority(priority)].length;
        } else {
          return this._queues.reduce((function(a, b) {
            return a + b.length;
          }), 0);
        }
      }

      running() {
        return this._running;
      }

      _getFirst(arr) {
        return this._find(arr, function(x) {
          return x.length > 0;
        });
      }

      _conditionsCheck(weight) {
        return ((this.maxConcurrent == null) || this.running() + weight <= this.maxConcurrent) && ((this.reservoir == null) || this.reservoir - weight >= 0);
      }

      check(weight = 1) {
        return this._conditionsCheck(weight) && (this._nextRequest - Date.now()) <= 0;
      }

      _tryToRun() {
        var done, index, next, queued, wait;
        if ((queued = this.queued()) === 0) {
          return false;
        }
        if (this._conditionsCheck(this._getFirst(this._queues).first().options.weight)) {
          next = this._getFirst(this._queues).shift();
          this._running += next.options.weight;
          if (this.reservoir != null) {
            this.reservoir -= next.options.weight;
          }
          wait = Math.max(this._nextRequest - Date.now(), 0);
          this._nextRequest = Date.now() + wait + this.minTime;
          if (queued === 1) {
            this._trigger("empty", []);
          }
          done = false;
          index = this._nextIndex++;
          this._executing[index] = {
            timeout: setTimeout(() => {
              var completed;
              completed = (...args) => {
                var ref;
                if (!done) {
                  done = true;
                  delete this._executing[index];
                  this._running -= next.options.weight;
                  while (this._tryToRun()) {}
                  if (this.running() === 0 && this.queued() === 0) {
                    this._trigger("idle", []);
                  }
                  if (!this.interrupt) {
                    return (ref = next.cb) != null ? ref.apply({}, args) : void 0;
                  }
                }
              };
              if (this._limiter != null) {
                return this._limiter.submit.apply(this._limiter, Array.prototype.concat(next.task, next.args, completed));
              } else {
                return next.task.apply({}, next.args.concat(completed));
              }
            }, wait),
            job: next
          };
          return true;
        } else {
          return false;
        }
      }

      _loadJobOptions(options) {
        options = parser.load(options, this.jobDefaults);
        if ((this.maxConcurrent != null) && options.weight > this.maxConcurrent) {
          throw new Bottleneck.prototype.BottleneckError("Impossible to add a job having a weight of " + options.weight + " to a limiter having a maxConcurrent setting of " + this.maxConcurrent);
        } else {
          return options;
        }
      }

      submit(...args) {
        var cb, j, job, l, options, reachedHighWaterMark, ref, ref1, shifted, task;
        if (typeof args[0] === "function") {
          ref = args, task = ref[0], args = 3 <= ref.length ? slice.call(ref, 1, j = ref.length - 1) : (j = 1, []), cb = ref[j++];
          options = this.jobDefaults;
        } else {
          ref1 = args, options = ref1[0], task = ref1[1], args = 4 <= ref1.length ? slice.call(ref1, 2, l = ref1.length - 1) : (l = 2, []), cb = ref1[l++];
          options = this._loadJobOptions(options);
        }
        job = {options, task, args, cb};
        options.priority = this._sanitizePriority(options.priority);
        reachedHighWaterMark = (this.highWater != null) && this.queued() === this.highWater && !this.check(options.weight);
        if (this.strategy === Bottleneck.prototype.strategy.BLOCK && (reachedHighWaterMark || this.isBlocked())) {
          this._unblockTime = Date.now() + this.penalty;
          this._nextRequest = this._unblockTime + this.minTime;
          this._queues = this._makeQueues();
          this._trigger("dropped", [job]);
          return true;
        } else if (reachedHighWaterMark) {
          shifted = this.strategy === Bottleneck.prototype.strategy.LEAK ? this._getFirst(this._queues.slice(options.priority).reverse()).shift() : this.strategy === Bottleneck.prototype.strategy.OVERFLOW_PRIORITY ? this._getFirst(this._queues.slice(options.priority + 1).reverse()).shift() : this.strategy === Bottleneck.prototype.strategy.OVERFLOW ? job : void 0;
          if (shifted != null) {
            this._trigger("dropped", [shifted]);
          }
          if ((shifted == null) || this.strategy === Bottleneck.prototype.strategy.OVERFLOW) {
            return reachedHighWaterMark;
          }
        }
        this._queues[options.priority].push(job);
        this._tryToRun();
        return reachedHighWaterMark;
      }

      schedule(...args) {
        var options, task, wrapped;
        if (typeof args[0] === "function") {
          [task, ...args] = args;
          options = this.jobDefaults;
        } else {
          [options, task, ...args] = args;
          options = this._loadJobOptions(options);
        }
        wrapped = function(...args) {
          var cb, j, ref;
          ref = args, args = 2 <= ref.length ? slice.call(ref, 0, j = ref.length - 1) : (j = 0, []), cb = ref[j++];
          return (task.apply({}, args)).then(function(...args) {
            return cb.apply({}, Array.prototype.concat(null, args));
          }).catch(function(...args) {
            return cb.apply({}, args);
          });
        };
        return new this.Promise((resolve, reject) => {
          return this.submit.apply({}, Array.prototype.concat(options, wrapped, args, function(...args) {
            return (args[0] != null ? reject : (args.shift(), resolve)).apply({}, args);
          }));
        });
      }

      wrap(fn) {
        return (...args) => {
          return this.schedule.apply({}, Array.prototype.concat(fn, args));
        };
      }

      updateSettings(options = {}) {
        parser.overwrite(options, this.defaults, this);
        while (this._tryToRun()) {}
        return this;
      }

      incrementReservoir(incr = 0) {
        this.updateSettings({
          reservoir: this.reservoir + incr
        });
        return this;
      }

      on(name, cb) {
        return this._addListener(name, "many", cb);
      }

      once(name, cb) {
        return this._addListener(name, "once", cb);
      }

      removeAllListeners(name = null) {
        if (name != null) {
          delete this._events[name];
        } else {
          this._events = {};
        }
        return this;
      }

      stopAll(interrupt = this.interrupt) {
        var job, k, keys;
        this.interrupt = interrupt;
        keys = Object.keys(this._executing);
        (function() {
          var j, len, results;
          results = [];
          for (j = 0, len = keys.length; j < len; j++) {
            k = keys[j];
            results.push(clearTimeout(this._executing[k].timeout));
          }
          return results;
        }).call(this);
        this._tryToRun = function() {};
        this.check = function() {
          return false;
        };
        this.submit = function(...args) {
          var cb, j, ref;
          ref = args, args = 2 <= ref.length ? slice.call(ref, 0, j = ref.length - 1) : (j = 0, []), cb = ref[j++];
          return cb(new Bottleneck.prototype.BottleneckError("This limiter is stopped"));
        };
        this.schedule = function() {
          return this.Promise.reject(new Bottleneck.prototype.BottleneckError("This limiter is stopped"));
        };
        if (this.interrupt) {
          (function() {
            var j, len, results;
            results = [];
            for (j = 0, len = keys.length; j < len; j++) {
              k = keys[j];
              results.push(this._trigger("dropped", [this._executing[k].job]));
            }
            return results;
          }).call(this);
        }
        while (job = this._getFirst(this._queues).shift()) {
          this._trigger("dropped", [job]);
        }
        this._trigger("empty", []);
        if (this.running() === 0) {
          this._trigger("idle", []);
        }
        return this;
      }

    };

    Bottleneck.default = Bottleneck;

    Bottleneck.strategy = Bottleneck.prototype.strategy = {
      LEAK: 1,
      OVERFLOW: 2,
      OVERFLOW_PRIORITY: 4,
      BLOCK: 3
    };

    Bottleneck.BottleneckError = Bottleneck.prototype.BottleneckError = require("./BottleneckError");

    Bottleneck.Cluster = Bottleneck.prototype.Cluster = require("./Cluster");

    Bottleneck.prototype.jobDefaults = {
      priority: MIDDLE_PRIORITY,
      weight: 1,
      id: "<none>"
    };

    Bottleneck.prototype.defaults = {
      maxConcurrent: null,
      minTime: 0,
      highWater: null,
      strategy: Bottleneck.prototype.strategy.LEAK,
      rejectOnDrop: true,
      reservoir: null,
      interrupt: false,
      Promise: Promise
    };

    return Bottleneck;

  })();

  module.exports = Bottleneck;

}).call(this);

},{"./BottleneckError":2,"./Cluster":3,"./DLList":4,"./parser":6}],2:[function(require,module,exports){
// Generated by CoffeeScript 2.0.2
(function() {
  var BottleneckError;

  BottleneckError = class BottleneckError extends Error {};

  module.exports = BottleneckError;

}).call(this);

},{}],3:[function(require,module,exports){
// Generated by CoffeeScript 2.0.2
(function() {
  var Cluster,
    hasProp = {}.hasOwnProperty;

  Cluster = class Cluster {
    constructor(maxNb, minTime, highWater, strategy, rejectOnDrop) {
      this.maxNb = maxNb;
      this.minTime = minTime;
      this.highWater = highWater;
      this.strategy = strategy;
      this.rejectOnDrop = rejectOnDrop;
      this.limiters = {};
      this.Bottleneck = require("./Bottleneck");
      this.timeout = 1000 * 60 * 5;
      this.startAutoCleanup();
    }

    key(key = "") {
      var ref;
      return (ref = this.limiters[key]) != null ? ref : (this.limiters[key] = new this.Bottleneck(this.maxNb, this.minTime, this.highWater, this.strategy, this.rejectOnDrop));
    }

    deleteKey(key = "") {
      return delete this.limiters[key];
    }

    all(cb) {
      var k, ref, results, v;
      ref = this.limiters;
      results = [];
      for (k in ref) {
        if (!hasProp.call(ref, k)) continue;
        v = ref[k];
        results.push(cb(v));
      }
      return results;
    }

    keys() {
      return Object.keys(this.limiters);
    }

    startAutoCleanup() {
      var base;
      this.stopAutoCleanup();
      return typeof (base = (this.interval = setInterval(() => {
        var k, ref, results, time, v;
        time = Date.now();
        ref = this.limiters;
        results = [];
        for (k in ref) {
          v = ref[k];
          if ((v._nextRequest + this.timeout) < time) {
            results.push(this.deleteKey(k));
          } else {
            results.push(void 0);
          }
        }
        return results;
      }, this.timeout / 10))).unref === "function" ? base.unref() : void 0;
    }

    stopAutoCleanup() {
      return clearInterval(this.interval);
    }

    changeTimeout(timeout) {
      this.timeout = timeout;
      return this.startAutoCleanup();
    }

  };

  module.exports = Cluster;

}).call(this);

},{"./Bottleneck":1}],4:[function(require,module,exports){
// Generated by CoffeeScript 2.0.2
(function() {
  var DLList;

  DLList = class DLList {
    constructor() {
      this._first = null;
      this._last = null;
      this.length = 0;
    }

    push(value) {
      var node;
      this.length++;
      node = {
        value,
        next: null
      };
      if (this._last != null) {
        this._last.next = node;
        this._last = node;
      } else {
        this._first = this._last = node;
      }
      return void 0;
    }

    shift() {
      var ref1, value;
      if (this._first == null) {
        return void 0;
      } else {
        this.length--;
      }
      value = this._first.value;
      this._first = (ref1 = this._first.next) != null ? ref1 : (this._last = null);
      return value;
    }

    first() {
      if (this._first != null) {
        return this._first.value;
      }
    }

    getArray() {
      var node, ref, results;
      node = this._first;
      results = [];
      while (node != null) {
        results.push((ref = node, node = node.next, ref.value));
      }
      return results;
    }

  };

  module.exports = DLList;

}).call(this);

},{}],5:[function(require,module,exports){
// Generated by CoffeeScript 2.0.2
(function() {
  module.exports = require("./Bottleneck");

}).call(this);

},{"./Bottleneck":1}],6:[function(require,module,exports){
// Generated by CoffeeScript 2.0.2
(function() {
  exports.load = function(received, defaults, onto = {}) {
    var k, ref, v;
    for (k in defaults) {
      v = defaults[k];
      onto[k] = (ref = received[k]) != null ? ref : v;
    }
    return onto;
  };

  exports.overwrite = function(received, defaults, onto = {}) {
    var k, v;
    for (k in received) {
      v = received[k];
      if (defaults[k] !== void 0) {
        onto[k] = v;
      }
    }
    return onto;
  };

}).call(this);

},{}]},{},[5]);
