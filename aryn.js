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
    this.id       = BreakPoint.num++;
    this.process  = null;
    this.released = false;
    this.timeout  = timeout;
}

BreakPoint.num = 0;

BreakPoint.prototype = {

    isReleased: function() {
        return this.released;
    },

    bind: function(process) {
        var me = this;

        if (me.process || me.isReleased()) {
            throw 'This break-point has been already binded';
        }

        me.process = process;

        if (!isNaN(me.timeout)) {
            schedule(function(){ me.release() }, me.timeout);
        }
    },

    release: function(withValue) {
        var process;

        if (this.process) {
            this.released = true;
            process       = this.process;
            this.process  = null;
            schedule(function(){ process.runNext(withValue) })
        }
    },

    throw: function(e) {
        var process;

        if (this.process) {
            this.released  = true;
            process        = this.process;
            this.process.routine.throw(e);
            this.process   = null;
        }
    },

    pushToArray: function(array) {
        array.push(this);
        return this;
    }
}

BreakPoint.releaseAll = function(array, withValue) {
    while (array.length) {
        array.shift().release(withValue);
    }
}

// Process
function Process(generator) {
    this.id           = Process.num++;
    this.routineState = void 0;
    this.generator    = generator;
    this.routine      = void 0;
    this.forever      = false;
    this.args         = void 0;
    this.updateState(Process.SUSPENDED);
}

Process.num       = 0;
Process.SUSPENDED = 0;
Process.RUNNING   = 1;
Process.DONE      = 2;
Process.FAIL      = 3;

Process.prototype = {

    debug: true,

    errorHandler: function(){ },

    catch: function(errorHandler) {
        this.errorHandler = errorHandler;
    },

    done: indentityFn,

    isSuspended: function() {
        return this.routineState.value instanceof BreakPoint && !this.routineState.value.isReleased();
    },

    run: function() {
        var me = this;
        this.args         = arguments;
        this.routineState = { done: false, value: void 0 };
        this.routine      = this.generator.apply({}, this.args);
        
        schedule(function(){
            me.updateState(Process.RUNNING);
            me.runNext();    
        })
    },

    runNext: function(withValue) {
        var value,
        me = this;

        if (me.isSuspended()) { return }

        if (me.debug) {
            me.routineState = me.routine.next(withValue);    
        } else {
            try {
                me.routineState = me.routine.next(withValue);
            } catch (e) {
                this.updateState(Process.FAIL);
                me.errorHandler(e);
                if (this.forever) {
                    return me.run(this.args);
                }
                return;
            }
        }
        
        value = me.routineState.value;
        if (value instanceof BreakPoint) {
            this.updateState(Process.SUSPENDED);
            value.bind(me);
            return;
        }

        if (! me.routineState.done) {
            this.updateState(Process.RUNNING);
            me.runNext(value);
        } else if (this.forever) {
            me.run.apply(me, this.args);
        } else {
            this.updateState(Process.DONE);
            this.done(value);
        }
    },

    fork: function() {
        var
        process = new Process(this.generator);
        process.forever = this.forever;
        return process;
    },

    updateState: function(state) {
        if (this.state !== state) {
            this.state = state;
            return true;
        }
        return false;
    }
}


function Buffer(size) {
    this.id    = Buffer.num++;
    this.size  = isNaN(size) ? 1 : size;
    this.array = [];
}

Buffer.num = 0;

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
    this.id                  = Channel.num++;
    this.buffer              = buffer;
    this.closed              = false;
    this.data                = void 0;
    this.senderBreakPoints   = [];
    this.receiverBreakPoints = [];
    this.transform           = transform || indentityFn;
}

Channel.num = 0;

Channel.prototype = {

    receive: function() {
        var data;

        // is unbuffered
        if (! this.buffer) {
            if (this.data !== void 0) {
                if (this.senderBreakPoints[0]) {
                    this.senderBreakPoints.shift().release();
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
                this.senderBreakPoints.shift().release();
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
                    this.receiverBreakPoints.shift().release(this.data);
                }
            } else {
                if (this.receiverBreakPoints[0]) {
                    this.data = void 0;
                    this.receiverBreakPoints.shift().release(this.transform(data));
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
                this.receiverBreakPoints.shift().release(this.buffer.shift());
            }
        }

        if (this.buffer.isFull()) {
            return (new BreakPoint()).pushToArray(this.senderBreakPoints);
        }
    },

    close: function() {
        this.closed            = true;
        this.senderBreakPoints = [];
        BreakPoint.releaseAll(this.receiverBreakPoints);
    }
}

// Stream
function Stream(wait, transform) {
    this.id                  = Channel.num++;
    this.closed              = false;
    this.receiverBreakPoints = [];

    this.wait = wait || 0;
    this.resetTimer(Date.now());
    this.releasingTime = 0;

    this.trailingEdgeTimeout = null;
    this.transform = transform || indentityFn;
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
            BreakPoint.releaseAll(this.receiverBreakPoints, this.transform(data));
            this.resetTimer(now);
        } else {
            this.trailingEdgeTimeout = setTimeout(function() {
                BreakPoint.releaseAll(me.receiverBreakPoints, this.transform(data));
                me.resetTimer(Date.now());
            }, remaining);
        }
    },

    resetTimer: function(now) {
        this.previousTime  = now;
        this.releasingTime = this.wait + this.previousTime;
    },

}, Object.create(Channel.prototype));


// aryn lib
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

function wrap(generator, forever) {
    return function run() {
        var
        process = new Process(generator);
        process.forever = !!forever;
        process.run.apply(process, arguments);
        return process;
    }
}

function toBreakPoint(obj) {
    var breakp;

    if (obj instanceof BreakPoint) {
        return obj;
    }

    if (isChannel(obj)) {
        return obj.receive();
    }

    if (isPromise(obj)) {
        breakp = new BreakPoint();
        obj.then(function receive(v) { breakp.release(v) });
        return breakp;
    }

    if (obj instanceof Process) {
        breakp = new BreakPoint();
        obj.done = function receive(v) { breakp.release(v) }
        return breakp;
    }

    if (obj instanceof Array) {
        return arrToBreakPoint(obj);
    }

    throw 'unable to convert object to BreakPoint';
}

function arrToBreakPoint(arr) {
    var
    i, breakp, oRelease,
    breakpArr  = [],
    valuesArr  = [],
    ret        = new BreakPoint(),
    len        = arr.length,
    numPending = len;

    for (i = 0; i < len; i++) {
        breakp   = toBreakPoint(arr[i]);
        oRelease = breakp.release;

        breakp.release = (function(oRelease, valuesArr) {
            return function release(value) {
                oRelease.apply(this, arguments);
                valuesArr.push(value);
                numPending--;
                if (numPending === 0) {
                    ret.release(valuesArr);
                }
            }
        })(oRelease, valuesArr);

        breakpArr.push(breakp);
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
                    breakp.release(value);
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

var API = {

    filter: filter,

    run: function run(gen) {
        var args = slice.call(arguments, 1);

        if (gen instanceof Process) {
            return wrap(gen.generator, gen.forever).apply(this, args);
        }
        return wrap(gen, false).apply(this, slice.call(arguments, 1));
    },

    forever: function forever(gen) {
        var args = slice.call(arguments, 1);

        if (gen instanceof Process) {
            return wrap(gen.generator, true).apply(this, args);
        }
        return wrap(gen, true).apply(this, args);
    },

    timeout: function timeout(t) {
        return new BreakPoint(t);
    },

    chan: function chan(size, transform) {
        var ch;
        if (size instanceof Buffer) {
            ch = new Channel(size, transform);
        } else if (isNaN(size)) {
            ch = new Channel(null, transform);
        } else {
            ch = new Channel(new Buffer(size), transform);
        }
        return ch;
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

    receive: function receive(obj) {
        return toBreakPoint(obj);
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
                    aryn.send(chan, filtr(arguments));
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
                if (obj.hasOwnProperty(name) && !syncPrefix.test(name)) {
                    prop = obj[name];
                    newObj[name] = isFunction(prop) ? driveFn(prop, ctx || obj) : prop;
                }
            }
            return newObj;
        }
    }
};

global.aryn = {
    API                : API,
    copy               : copy,
    eventFunctionNames : eventFunctionNames,

    BreakPoint         : BreakPoint,
    Process            : Process,
    Channel            : Channel,
    Stream             : Stream,

    global: function _global() {
        copy(API, global, true);
    },

    debug: function debug(d) {
        Process.prototype.debug = !!d;
    },

    module: function module(fn) {
        if (! isFunction(fn)) { throw 'module must be a function' }

        var
        i, parsed,
        params, param,
        args = [],
        str  = String(fn);

        parsed = /\(([\w,\s]+)\)/.exec(str);
        if (parsed) {
            params = parsed[1].replace(/\s+/g, '').split(',');
        }

        if (params) {
            for (i = 0; i < params.length; i++) {
                param = params[i];
                if (API.hasOwnProperty(param)) {
                    args.push(API[param]);
                } else {
                    args.push(void 0);
                }
            }
        }

        fn.apply({}, args);
    }
}

copy(API, global.aryn);

})(global_);