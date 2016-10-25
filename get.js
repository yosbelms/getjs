(function() {

// Global (using `self` in the browser and `global` on the server)
var global = (typeof self == 'object' && self.self == self && self) ||
             (typeof global == 'object' && global.global == global && global),
    slice  = Array.prototype.slice;

// main function
// returns a function if a generator function is provided,
// returns a promise (if can be converted)
function get(obj, ctx) {
    return isGeneratorFunction(obj)
            ? get.wrap.call(this, obj, ctx)
            : toPromise(obj);
}

function schedule(fn, time) {
    if (time === void 0 && typeof global.setImmediate !== 'undefined') {
        setImmediate(fn);
    } else {
        setTimeout(fn, +time);
    }
}

function isPromise(p) {
    return p && typeof p.then === 'function';
}

function isFunction(f) {
    return typeof f === 'function';
}

function isObject(obj) {
    return obj && Object == obj.constructor;
}

function isArray(arr) {
    return Array.isArray(arr);
}

function isChannel(ch) {
    return ch instanceof Channel;
}

function isGeneratorFunction(obj) {
    var constr, proto;

    if (obj === void 0) { return false }
    constr = obj.constructor;
    if (! constr) { return false }
    if ((constr.name || constr.displayName) === 'GeneratorFunction') {
        return true;
    }
    proto = constr.prototype;
    return (isFunction(proto.next) && isFunction(proto.throw));
}

// returns new object whith the properties
// promise: a Promise object
// resolve: a function that resolves the promise
// reject: a function that rejects the promise
function deferredPromise() {
    var deferred = {};
    deferred.promise = new Promise(function(resolve, reject) {
        deferred.resolve = resolve;
        deferred.reject  = reject;
    })

    return deferred;
}

// convert to promise as much as possible
// taking into account the following order
// 1. Promise
// 2. Channel
function toPromise(obj) {
    if (isPromise(obj)) {
        return obj;
    }

    if (isChannel(obj)) {
        return obj.receive();
    }
}

// convert array to promise
function arrayToPromiseAll(array) {
    var promise;
    return Promise.all(array.map(function(value) {
        promise = toPromise(value);
        if (isPromise(promise)) {
            return promise;
        }

        return value;
    }));
}

// converts object to promise
function objectToPromiseAll(obj) {
    var promise,
    promises = [],
    result   = {},
    array    = Object.keys(obj);

    return new Promise(function(resolve) {

        array.map(function(key, index) {
            promise = toPromise(obj[key]);
            if (isPromise(promise)) {
                setupThen(promise, key);
            } else {
                result[key] = obj[key];
            }
        })

        Promise.all(promises).then(function() {
            resolve(result);
        })

        function setupThen(promise, key) {
            // default value
            result[key] = void 0;

            promise.then(function(value) {
                result[key] = value;
            })

            promises.push(promise);
        }
    })
}

// convert array to promise
function arrayToPromiseRace(array) {
    var promise, isResolved = false;
    return new Promise(function(resolve) {
        array.map(function(value, key) {
            promise = toPromise(value);
            if (isPromise(promise)) {
                setupThen(promise, key, resolve);
            }
        })

        function setupThen(promise, key, resolve) {
            promise.then(function(value) {
                if (isResolved) { return }
                isResolved = true;
                resolve({which: key, value: value});
            })
        }
    });
}


// convert array to promise that
function objectToPromiseRace(obj) {
    var promise, isResolved = false,
    array = Object.keys(obj);

    return new Promise(function(resolve) {
        array.map(function(key) {
            promise = toPromise(obj[key]);
            if (isPromise(promise)) {
                setupThen(promise, key, resolve);
            }
        })

        function setupThen(promise, key, resolve) {
            promise.then(function(value) {
                if (isResolved) { return }
                isResolved = true;
                resolve({which: key, value: value});
            })
        }
    });
}

// wrap a function that accepts callback as the last arguments
// and makes it to return a Promise
function promisifyFn(fn, ctx) {
    var
    args     = slice.call(arguments),
    deferred = deferredPromise();

    if (!fn.__promisifiedFn) {
        fn.__promisifiedFn = function promisifiedFn() {
            var
            args     = slice.call(arguments),
            deferred = deferredPromise();

            args.push(function(err, value) {
                if (err) {
                    deferred.reject(err);
                } else {
                    deferred.resolve(value);
                }
            })

            fn.apply(ctx || this, args)

            return deferred.promise;
        }
    }

    return fn.__promisifiedFn;
}

// Buffer: simple array based buffer to use with channels
function Buffer(size) {
    this.size  = isNaN(size) ? 1 : size;
    this.array = [];
}

Buffer.prototype = {

    read: function() {
        return this.array.shift();
    },

    write: function(value) {
        if (this.isFull()) { return false }
        this.array.push(value);
        return true;
    },

    isFull: function() {
        return !(this.array.length < this.size);
    },

    isEmpty: function() {
        return this.array.length === 0;
    }
}

// Channel: a structure to transport messages
function indentityFn(x) {return x}

function scheduledResolve(deferred, value) {
    schedule(function() { deferred.resolve(value) })
}

function Channel(transform) {
    this.id               = '#' + Channel.id++;
    this.closed           = false;
    this.opened           = true;
    this.data             = void 0;
    this.senderPromises   = [];
    this.receiverPromises = [];
    this.transform        = transform || indentityFn;
}

Channel.id = 0;

Channel.prototype = {

    receive: function() {
        var data, deferred;

        // there is data?
        if (this.data !== void 0) {
            // resume the first sender coroutine
            if (this.senderPromises[0]) {
                scheduledResolve(this.senderPromises.shift());
            }
            // clean and return
            data      = this.data;
            this.data = void 0;
            return data;

        // if no data
        } else {
            // suspend the coroutine wanting to receive
            deferred = deferredPromise();
            this.receiverPromises.push(deferred);
            return deferred.promise;
        }
    },

    send: function(data) {
        if (this.closed) { throw 'Error: closed channel ' + this.id }
        var deferred;

        // some stored data?
        if (this.data !== void 0) {
            // deliver data to the first waiting coroutine
            if (this.receiverPromises[0]) {
                scheduledResolve(this.receiverPromises.shift(), this.data);
            }

        // no stored data?
        } else {
            // pass sent data directly to the first waiting for it
            if (this.receiverPromises[0]) {
                this.data = void 0;
                scheduledResolve(this.receiverPromises.shift(), this.transform(data));
                // schedule the the sender coroutine
                return get.timeout(0);
            }
        }

        // else, store the transformed data
        this.data = this.transform(data);
        deferred = deferredPromise();
        this.senderPromises.push(deferred);
        return deferred.promise;
    },

    close: function() {
        this.closed         = true;
        this.opened         = false;
        this.senderPromises = [];
        while (this.receiverPromises.length) {
            scheduledResolve(this.receiverPromises.shift());
        }
    }
}

// Buffered Channel
function BufferedChannel(buffer, transform) {
    Channel.call(this, transform);
    this.buffer = buffer;
}

BufferedChannel.prototype = new Channel();

Object.assign(BufferedChannel.prototype, {

    senderPromises  : null,

    receiverPromises: null,

    receive: function() {
        var deferred;

        // empty buffer?
        if (this.buffer.isEmpty()) {
            // suspend the coroutine wanting to receive
            deferred = deferredPromise();
            this.receiverPromises.push(deferred);
            return deferred.promise;
        }

        // resume the first sender coroutine
        if (this.senderPromises[0]) {
            scheduledResolve(this.senderPromises.shift());
        }
        // clean and return
        return this.buffer.read();
    },

    send: function(data) {
        if (this.closed) { throw 'Error: closed channel ' + this.id }
        var deferred;

        // full buffer?
        if (this.buffer.isFull()) {
            // stop until the buffer start to be drained
            deferred = deferredPromise();
            this.senderPromises.push(deferred);
            return deferred.promise;
        }

        // TODO: optimize below code
        // store sent value in the buffer
        this.buffer.write(this.transform(data));
        // if any waiting for the data, give it
        if (this.receiverPromises[0]) {
            scheduledResolve(this.receiverPromises.shift(), this.buffer.read());
        }
    },
})


// spawns a coroutine
get.go = function go(genf, args, ctx) {
    var state,
    gen = genf.apply(ctx || {}, args);

    return new Promise(function(resolve, reject) {
        // ensure it runs asynchronously
        schedule(next);

        function next(value) {
            if (state && state.done) {
                return resolve(value);
            }

            try {
                state = gen.next(value);
                value = state.value;
            } catch (e) {
                if (get.debug) {
                    console.error(e.stack || e);
                }
                return reject(e);
            }

            if (isPromise(value)) {
                return value.then(
                    function onFulfilled(value) {
                        next(value)
                    },
                    function onRejected(reason) {
                        gen.throw(reason)
                    }
                );
            }

            next(value);
        }
    })
}

get.debug = true;

// wraps a generator function
// returns a function that spawns a coroutine
get.wrap = function wrap(genf, ctx) {
    if (isGeneratorFunction(genf)) {
        return function go() {
            return get.go(genf, slice.call(arguments), ctx || this);
        }
    }
    throw 'Error: invalid generator';
}

// sends a value to a channels
get.send = function send(chan, value) {
    if (isChannel(chan)) {
        return chan.send(value);
    }
    throw 'Error: unable to send values';
}

// receives from a channel or promise
get.recv = function receive(chan) {
    if (isChannel(chan)) {
        return chan.receive();
    }
    throw 'Error: unable to receive values';
}

// stops a coroutine for a defined time
get.timeout = function timeout(time) {
    if (!isNaN(time) && time !== null) {
        return new Promise(function(resolve) {
            schedule(resolve, time)
        })
    }
    throw 'Error: invalid time';
}

// creates a channel
get.chan = function chan(size, transform) {
    // isNaN(null) == false  :O
    // is it a bug ?
    if (isNaN(size) || size === null) {
        return new Channel(transform);
    }

    return new BufferedChannel(new Buffer(size), transform);
}

// closes a channel
get.close = function close(chan) {
    if (isChannel(chan)) {
        return chan.close();
    } else {
        throw 'Error: invalid channel';
    }
}

// returns an object that contains all functions of
// the passed object promisified
get.promisify = function promisify(obj, ctx) {
    var
    newObj, name, value,
    syncPrefix = /Sync$/;

    if (!obj) { return }

    ctx = ctx || obj;

    if (isFunction(obj)) {
        return promisifyFn(obj, ctx);
    }

    newObj = {};

    for (name in obj) {
        value = obj[name];
        if (syncPrefix.test(name) || !obj.hasOwnProperty(name)) {
            continue;
        }
        newObj[name] = isFunction(value) ? promisifyFn(value, ctx) : value;
    }
    return newObj;
}

// receives an array or object with promises
// returns a promise that is resolved once al provided
// promises are resolved
get.all = function all(obj) {
    if (isArray(obj)) {
        return arrayToPromiseAll(obj);
    }

    if (isObject(obj)){
        return objectToPromiseAll(obj);
    }
    throw 'Error: invalid object'
}

// receives an array or object with promises
// returns a promise that resolves once one of the provided
// promises is resolved
get.race = function race(obj) {
    if (isArray(obj)) {
        return arrayToPromiseRace(obj);
    }

    if (isObject(obj)){
        return objectToPromiseRace(obj);
    }
    throw 'Error: invalid object'
}

// publish
if (typeof module === 'object') {
    module.exports = get;
} else {
    global.get = get;
}

})();