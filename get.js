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

function schedule(fn, time) {
    if (time === void 0 && typeof global.setImmediate !== 'undefined') {
        setImmediate(fn);
    } else {
        setTimeout(fn, +time);
    }
}

function BreakPoint(timeout) {
    this.process       = void 0;
    this.resumed       = false;
    this.timeout       = timeout;
    this.doneListeners = void 0;
}

BreakPoint.prototype = {

    isResumed: function() {
        return this.resumed;
    },

    bind: function(process) {
        var me = this;

        if (me.process || me.isResumed()) {
            throw 'This break-point has been already binded';
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
            this.process.routine.throw(err);
            this.process = null;
            this.fireDone(void 0, err);
        }
    },

    done: function(fn) {
        if (! this.doneListeners) { this.doneListeners = [] }
        this.doneListeners.push(fn);
    },

    fireDone: function(val, err) {
        if (this.doneListeners) {
            this.doneListeners.forEach(function(listener){
                listener(val, err);
            });
        }
    },

    pushToArray: function(array) {
        array.push(this);
        return this;
    }
}

BreakPoint.resumeAll = function(array, withValue) {
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
    this.args      = void 0;
}

Process.prototype = {

    throws: false,

    done : indentityFn,
    catch: indentityFn,

    isSuspended: function() {
        return this.state.value instanceof BreakPoint && !this.state.value.isResumed();
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
            } catch (e) {
                this.catch(e);
                return;
            }
        }

        value = this.state.value;
        if (isBreakPoint(value)) {
            value.bind(this);
            return;
        }

        if (! this.state.done) {
            this.runNext(value);
        } else {
            this.done(value);
        }
    }
}

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
    this.senderBreakPoints   = [];
    this.receiverBreakPoints = [];
    this.transform           = transform || indentityFn;
}

Channel.prototype = {

    receive: function() {
        var data;

        // is unbuffered
        if (! this.buffer) {
            if (this.data !== void 0) {
                if (this.senderBreakPoints[0]) {
                    this.senderBreakPoints.shift().resume();
                }
                data      = this.data;
                this.data = void 0;
                return data;
            } else {
                return (new BreakPoint()).pushToArray(this.receiverBreakPoints);
            }
        }

        // if buffered
        if (this.buffer.isEmpty()) {
            return (new BreakPoint()).pushToArray(this.receiverBreakPoints);
        } else {
            if (this.senderBreakPoints[0]) {
                this.senderBreakPoints.shift().resume();
            }
            return this.buffer.shift();
        }
    },

    send: function(data) {
        if (this.closed) { throw 'closed channel' }

        // is unbuffered
        if (! this.buffer) {
            if (this.data !== void 0) {
                if (this.receiverBreakPoints[0]) {
                    this.receiverBreakPoints.shift().resume(this.data);
                }
            } else {
                if (this.receiverBreakPoints[0]) {
                    this.data = void 0;
                    this.receiverBreakPoints.shift().resume(this.transform(data));
                    return new BreakPoint(0);
                }
            }
            this.data = this.transform(data);
            return (new BreakPoint()).pushToArray(this.senderBreakPoints);
        }

        // if buffered
        if (! this.buffer.isFull()) {
            this.buffer.push(this.transform(data));
            if (this.receiverBreakPoints[0]) {
                this.receiverBreakPoints.shift().resume(this.buffer.shift());
            }
        }

        if (this.buffer.isFull()) {
            return (new BreakPoint()).pushToArray(this.senderBreakPoints);
        }
    },

    close: function() {
        this.closed            = true;
        this.senderBreakPoints = [];
        BreakPoint.resumeAll(this.receiverBreakPoints);
    }
}

// Stream
function Stream(wait, transform) {
    this.closed              = false;
    this.receiverBreakPoints = [];
    this.trailingEdgeTimeout = null;
    this.releasingTime       = 0;
    this.wait                = wait || 0;
    this.transform           = transform || indentityFn;

    this.resetTimer(Date.now());
}

Stream.prototype = copy({

    receive: function() {
        return (new BreakPoint()).pushToArray(this.receiverBreakPoints);
    },

    send: function(data) {
        if (this.closed) { throw 'closed channel' }

        var
        me        = this,
        now       = Date.now(),
        remaining = this.releasingTime - now;

        clearTimeout(this.trailingEdgeTimeout);

        if (remaining <= 0) {
            BreakPoint.resumeAll(this.receiverBreakPoints, this.transform(data));
            this.resetTimer(now);
        } else {
            this.trailingEdgeTimeout = setTimeout(function() {
                BreakPoint.resumeAll(me.receiverBreakPoints, this.transform(data));
                me.resetTimer(Date.now());
            }, remaining);
        }
    },

    resetTimer: function(now) {
        this.previousTime  = now;
        this.releasingTime = this.wait + this.previousTime;
    },

}, Object.create(Channel.prototype));


// go lib
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

function isBreakPoint(obj) {
    return obj instanceof BreakPoint;
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
        return function singleArgFilter(val) {
            return val[filter];
        }
    }

    if (filter.length !== void 0) {
        return function arrayToObject(val) {
            var i, ret = {};
            for (i = 0; i < filter.length; i++) {
                ret[filter[i]] = val[i];
            }
            return ret;
        }
    }
}

function toBreakPoint(obj) {
    var breakp;

    if (isBreakPoint(obj)) {
        return obj;
    }

    if (isChannel(obj)) {
        return obj.receive();
    }

    if (isPromise(obj)) {
        breakp = new BreakPoint();
        obj.then(function receive(v) { breakp.resume(v) });
        isFunction(obj.catch) || obj.catch(function _throw(e) { breakp.throw(e) });
        return breakp;
    }

    if (obj instanceof Process) {
        breakp   = new BreakPoint();
        obj.done = function receive(v) { breakp.resume(v) }
        return breakp;
    }

    if (isArray(obj)) {
        return arrToBreakPoint(obj);
    }

    if (isObject(obj)) {
        return objToBreakPoint(obj);
    }
}

function arrToBreakPoint(arr) {
    var
    i, breakp, oResume,
    valuesArr  = [],
    ret        = new BreakPoint(),
    len        = arr.length,
    numPending = len;

    for (i = 0; i < len; i++) {
        breakp  = toBreakPoint(arr[i]);
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

function objToBreakPoint(obj) {
    var
    i, name, breakp, oResume,
    valuesObj  = {},
    keys       = Object.keys(obj),
    ret        = new BreakPoint(),
    len        = keys.length,
    numPending = len;

    for (i = 0; i < len; i++) {
        name    = keys[i];
        breakp  = toBreakPoint(obj[name]);
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
            args = slice.call(arguments),
            breakp = new BreakPoint();

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
    return function process() {
        var
        process = new Process(gen, this),
        breakp  = toBreakPoint(process);

        process.done  = function(val){ breakp.fireDone(val) }
        process.catch = function(err){ breakp.fireDone(void 0, err) }

        process.run.apply(process, arguments);
        return breakp;
    }
}

function get(obj) {
    if (isGeneratorFunction(obj)) { return wrap(obj) }
    return toBreakPoint(obj);
}

copy({
    get                : get,
    go                 : wrap,
    copy               : copy,
    eventFunctionNames : eventFunctionNames,

    BreakPoint         : BreakPoint,
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

    filter: filter,

    timeout: function timeout(t) {
        return new BreakPoint(t);
    },

    chan: function chan(size, transform) {
        if (size instanceof Buffer) {
            return new Channel(size, transform);
        }

        if (isNaN(size)) {
            return new Channel(null, transform);
        }

        return new Channel(new Buffer(size), transform);
    },

    stream: function stream(wait, transform) {
        return new Stream(wait, transform);
    },

    sender: function sender(chan, filtr) {
        if (! isChannel(cha)) { throw 'invalid channel' }
        filtr = filter(filtr || 0);
        return function sender() {
            chan.send(filtr(arguments));
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

        filtr = filter(filtr || 0);

        if (! isChannel(chan)) { throw 'invalid channel' }
        if (! obj) { throw 'invalid object' }

        for (i = 0; i < len; i++) {
            name = eventFunctionNames[i];
            if (isFunction(obj[name])) {
                obj[name](eventName, function EventListener() {
                    go.send(chan, filtr(arguments));
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

    drive: function(obj, ctx) {
        var
        newObj, name, prop,
        syncPrefix = /Sync$/;

        if (! obj) { return }

        if (isFunction(obj)) {
            return driveFn(obj, ctx);
        } else {
            newObj = {};
            for (name in obj) {
                if (syncPrefix.test(name)) { continue }
                prop = obj[name];
                newObj[name] = isFunction(prop) ? driveFn(prop, ctx || obj) : prop;
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
