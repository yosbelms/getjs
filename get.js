var global_ = typeof global !== 'undefined'
        ? global
        : typeof window !== 'undefined'
        ? window
        : typeof self !== 'undefined'
        ? self
        : this;

(function(global) {
"use strict";

var
slice       = Array.prototype.slice,
indentityFn = function(x){ return x };

var DoneMixin = {

    done: function(fn) {
        if (! this.doneListeners) { this.doneListeners = [] }
        this.doneListeners.push(fn);
        return this;
    },

    fireDone: function(val, err) {
        if (this.doneListeners) {
            this.doneListeners.forEach(function(listener){
                listener(val, err);
            });
        }
    }
}

function schedule(fn, time) {
    if (time === void 0 && typeof global.setImmediate !== 'undefined') {
        setImmediate(fn);
    } else {
        setTimeout(fn, +time);
    }
}

function Breakpoint(timeout) {
    this.process = void 0;
    this.resumed = false;
    this.timeout = timeout;
}

Breakpoint.prototype = {

    isResumed: function() {
        return this.resumed;
    },

    bind: function(process) {
        var me = this;

        if (me.process || me.isResumed()) {
            throw 'this break-point has been already binded';
        }

        me.process = process;

        if (!isNaN(me.timeout)) {
            schedule(function(){ me.resume() }, me.timeout);
        }
    },

    resume: function(value) {
        var process;

        if (this.process) {
            this.resumed = true;
            process      = this.process;
            this.process = null;
            schedule(function(){ process.runNext(value) })
            this.fireDone(value);
        }
    },

    throw: function(err) {
        var process;

        if (this.process) {
            this.resumed = true;
            process      = this.process;
            this.process = null;
            this.fireDone(void 0, err);
            process.routine.throw(err);
        }
    },

    pushToArray: function(array) {
        array.push(this);
        return this;
    }
}

copy(DoneMixin, Breakpoint.prototype);

Breakpoint.resumeAll = function(array, withValue) {
    while (array.length) {
        array.shift().resume(withValue);
    }
}

// Process
function Process(generator, scope) {
    this.scope     = scope || {};
    this.state     = { done: false, value: void 0 };
    this.generator = generator;
    this.routine   = void 0;
}

Process.prototype = {

    throws: false,

    isSuspended: function() {
        return isBreakpoint(this.state.value) && !this.state.value.isResumed();
    },

    run: function() {
        var me = this;
        this.routine = this.generator.apply(this.scope, arguments);
        schedule(function(){ me.runNext() });
    },

    runNext: function(withValue) {
        var value;

        if (this.isSuspended()) { return }

        if (this.throws) {
            this.state = this.routine.next(withValue);
        } else {
            try {
                this.state = this.routine.next(withValue);
            } catch (err) {
                this.fireDone(void 0, err);
                return;
            }
        }

        value = this.state.value;
        if (isBreakpoint(value)) {
            value.bind(this);
            return;
        }

        if (! this.state.done) {
            this.runNext(value);
        } else {
            this.fireDone(value);
        }
    }
}

copy(DoneMixin, Process.prototype);


function Buffer(size) {
    this.size  = isNaN(size) ? 1 : size;
    this.array = [];
}

Buffer.prototype = {

    shift: function() {
        return this.array.shift();
    },

    push: function(value) {
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

function Channel(buffer, transform) {
    this.buffer              = buffer;
    this.closed              = false;
    this.data                = void 0;
    this.senderBreakpoints   = [];
    this.receiverBreakpoints = [];
    this.transform           = transform || indentityFn;
}

Channel.prototype = {

    receive: function() {
        var data;

        // is unbuffered
        if (! this.buffer) {
            if (this.data !== void 0) {
                if (this.senderBreakpoints[0]) {
                    this.senderBreakpoints.shift().resume();
                }
                data      = this.data;
                this.data = void 0;
                return data;
            } else {
                return (new Breakpoint()).pushToArray(this.receiverBreakpoints);
            }
        }

        // if buffered
        if (this.buffer.isEmpty()) {
            return (new Breakpoint()).pushToArray(this.receiverBreakpoints);
        } else {
            if (this.senderBreakpoints[0]) {
                this.senderBreakpoints.shift().resume();
            }
            return this.buffer.shift();
        }
    },

    send: function(data) {
        if (this.closed) { throw 'closed channel' }

        // is unbuffered
        if (! this.buffer) {
            if (this.data !== void 0) {
                if (this.receiverBreakpoints[0]) {
                    this.receiverBreakpoints.shift().resume(this.data);
                }
            } else {
                if (this.receiverBreakpoints[0]) {
                    this.data = void 0;
                    this.receiverBreakpoints.shift().resume(this.transform(data));
                    return new Breakpoint(0);
                }
            }
            this.data = this.transform(data);
            return (new Breakpoint()).pushToArray(this.senderBreakpoints);
        }

        // if buffered
        if (! this.buffer.isFull()) {
            this.buffer.push(this.transform(data));
            if (this.receiverBreakpoints[0]) {
                this.receiverBreakpoints.shift().resume(this.buffer.shift());
            }
        }

        if (this.buffer.isFull()) {
            return (new Breakpoint()).pushToArray(this.senderBreakpoints);
        }
    },

    close: function() {
        this.closed            = true;
        this.senderBreakpoints = [];
        Breakpoint.resumeAll(this.receiverBreakpoints);
    }
}

// Stream
function Stream(wait, transform) {
    this.closed              = false;
    this.receiverBreakpoints = [];
    this.trailingEdgeTimeout = null;
    this.releasingTime       = 0;
    this.wait                = wait || 0;
    this.transform           = transform || indentityFn;

    this.resetTimer(Date.now());
}

Stream.prototype = copy({

    receive: function() {
        return (new Breakpoint()).pushToArray(this.receiverBreakpoints);
    },

    send: function(data) {
        if (this.closed) { throw 'closed channel' }

        var
        remaining,
        me  = this,
        now = Date.now();

        if (this.wait > 0) {
            remaining = this.releasingTime - now;
            clearTimeout(this.trailingEdgeTimeout);

            this.trailingEdgeTimeout = setTimeout(function() {
                Breakpoint.resumeAll(me.receiverBreakpoints, this.transform(data));
                me.resetTimer(Date.now());
            }, remaining);
        } else {
            Breakpoint.resumeAll(this.receiverBreakpoints, this.transform(data));
            this.resetTimer(now);
        }

        return new Breakpoint(0);
    },

    resetTimer: function(now) {
        this.previousTime  = now;
        this.releasingTime = this.wait + this.previousTime;
    },

}, Object.create(Channel.prototype));


// get lib
function copy(from, to, own) {
    for (var name in from) {
        if (own === true) {
            if (from.hasOwnProperty(name)) {
                to[name] = from[name];
            }
        }
        else {
            to[name] = from[name];
        }
    }
    return to;
}

function isFunction(fn) {
    return typeof fn === 'function';
}

function isChannel(ch) {
    return ch instanceof Channel;
}

function isPromise(pr) {
    return pr && isFunction(pr.then);
}

function isObject(obj) {
    return obj && Object == obj.constructor;
}

function isArray(arr) {
    return Array.isArray(arr);
}

function isBreakpoint(obj) {
    return obj instanceof Breakpoint;
}

function isGeneratorFunction(obj) {
    var
    constr,
    proto;

    if (obj === void 0) { return false }
    constr = obj.constructor;
    if (! constr) { return false }
    if ((constr.name || constr.displayName) === 'GeneratorFunction') {
        return true;
    }
    proto = constr.prototype;
    return (isFunction(proto.next) && isFunction(proto.throw));
}

function filter(filter) {
    if (filter === void 0) {
        return function filter(){
            return slice.call(arguments);
        }
    }

    if (isFunction(filter)) {
        return filter;
    }

    if (!isNaN(filter)) {
        return function singleArgFilter() {
            return arguments[filter];
        }
    }

    if (isArray(filter)) {
        return function arrayToObject(val) {
            var i, prop, ret = {};
            for (i = 0; i < filter.length; i++) {
                prop = filter[i];
                ret[prop] = val[prop];
            }
            return ret;
        }
    }
}

function toBreakpoint(obj) {
    var breakp;

    if (isBreakpoint(obj)) {
        return obj;
    }

    if (isChannel(obj)) {
        return obj.receive();
    }

    if (isPromise(obj)) {
        breakp = new Breakpoint();
        obj.then(function receive(v) { breakp.resume(v) });
        isFunction(obj.catch) || obj.catch(function _throw(e) { breakp.throw(e) });
        return breakp;
    }

    if (obj instanceof Process) {
        breakp = new Breakpoint();
        obj.done(function done(val, err) {
            breakp.resume(val);
            breakp.fireDone(val, err);
        });
        return breakp;
    }

    if (isArray(obj)) {
        return arrToBreakpoint(obj);
    }

    if (isObject(obj)) {
        return objToBreakpoint(obj);
    }
}

function arrToBreakpoint(arr) {
    var
    i, breakp, oResume,
    valuesArr  = [],
    ret        = new Breakpoint(),
    len        = arr.length,
    numPending = len;

    for (i = 0; i < len; i++) {
        breakp  = toBreakpoint(arr[i]);
        oResume = breakp.resume;

        breakp.resume = (function(oResume, valuesArr) {
            return function resume(value) {
                oResume.apply(this, arguments);
                valuesArr.push(value);
                numPending--;
                if (numPending === 0) {
                    ret.resume(valuesArr);
                }
            }
        })(oResume, valuesArr);
    }

    return ret;
}

function objToBreakpoint(obj) {
    var
    i, name, breakp, oResume,
    valuesObj  = {},
    keys       = Object.keys(obj),
    ret        = new Breakpoint(),
    len        = keys.length,
    numPending = len;

    for (i = 0; i < len; i++) {
        name    = keys[i];
        breakp  = toBreakpoint(obj[name]);
        oResume = breakp.resume;

        breakp.resume = (function(oResume, valuesObj, name) {
            return function resume(value) {
                oResume.apply(this, arguments);
                valuesObj[name] = value;
                numPending--;
                if (numPending === 0) {
                    ret.resume(valuesObj);
                }
            }
        })(oResume, valuesObj, name);
    }

    return ret;
}

function driveFn(fn, ctx) {
    if (!fn.__drivenFn) {
        fn.__drivenFn = function drivenFn() {
            var
            args   = slice.call(arguments),
            breakp = new Breakpoint();

            args.push(function(err, value) {
                if (err) {
                    breakp.throw(err);
                } else {
                    breakp.resume(value);
                }
            });

            fn.apply(ctx || this, args);

            return breakp;
        }
    }

    return fn.__drivenFn;
}

var eventFunctionNames = [
    'addEventListener',
    'attachEvent',
    'on',
];


function wrap(gen) {
    if (! isGeneratorFunction(gen)) {
        throw 'invalid generator function';
    }

    return function process() {
        var
        process = new Process(gen, this),
        breakp  = toBreakpoint(process);
        process.run.apply(process, arguments);
        return breakp;
    }
}

function get(obj) {
    if (isGeneratorFunction(obj)) { return wrap(obj) }
    return toBreakpoint(obj);
}

copy({
    get                : get,
    copy               : copy,
    eventFunctionNames : eventFunctionNames,

    Breakpoint         : Breakpoint,
    Process            : Process,
    Channel            : Channel,
    Stream             : Stream,

    global: function _global() {
        copy(get, global, true);
    },

    throws: function throws(d) {
        Process.prototype.throws = !!d;
    },

    // API

    go: function go(gen) {
        return wrap(gen).call(this);
    },

    filter: filter,

    timeout: function timeout(t) {
        return new Breakpoint(t);
    },

    chan: function chan(size, transform) {
        if (size instanceof Buffer) {
            return new Channel(size, transform);
        }

        // isNaN(null) == false  :O
        if (isNaN(size) || size === null) {
            return new Channel(null, transform);
        }

        return new Channel(new Buffer(size), transform);
    },

    stream: function stream(wait, transform) {
        return new Stream(wait, transform);
    },

    sender: function sender(chan, filtr) {
        if (! isChannel(chan)) { throw 'invalid channel' }
        filtr = filter(filtr || 0);
        return function sender() {
            chan.send(filtr.apply(this, arguments));
        }
    },

    send: function send(chan, value) {
        if (isChannel(chan)) {
            return chan.send(value);
        } else {
            throw 'invalid channel';
        }
    },

    close: function close(chan) {
        if (isChannel(chan)) {
            return chan.close();
        } else {
            throw 'invalid channel';
        }
    },

    listen: function listen(obj, eventName, chan, filtr) {
        var name, i, isRegistered,
        len = eventFunctionNames.length;

        filtr = (filtr === void 0) ? filter(0) : filter(filtr);

        if (! isChannel(chan)) { throw 'invalid channel' }
        if (! obj) { throw 'invalid object' }

        for (i = 0; i < len; i++) {
            name = eventFunctionNames[i];
            if (isFunction(obj[name])) {
                obj[name](eventName, function EventListener() {
                    get.send(chan, filtr.apply(this, arguments));
                });
                isRegistered = true;
                break;
            }
        }

        if (! isRegistered) {
            throw 'the object provided must have one of the following functions: "'
            + eventFunctionNames.join('", "') + '"';
        }

        return chan;
    },

    drive: function drive(obj, ctx) {
        var
        newObj, name, prop,
        syncPrefix = /Sync$/;

        if (! obj) { return }

        ctx = ctx || obj;

        if (isFunction(obj)) {
            return driveFn(obj, ctx);
        } else {
            newObj = {};
            for (name in obj) {
                if (syncPrefix.test(name)) { continue }
                prop = obj[name];
                newObj[name] = isFunction(prop) ? driveFn(prop, ctx) : prop;
            }
            return newObj;
        }
    }

}, get);


if (typeof exports !== 'undefined' && typeof require === 'function') {
    module.exports = get;
} else {
    global.get = get;
}

})(global_);
