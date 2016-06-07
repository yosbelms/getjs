var get   = require('../get.js');
var setup = require('./setup.js');
var buff  = setup.buffer;
var time  = setup.time;

var getChan = get.chan();

// send
get.go(function*() {
    var i, len = buff.length;
    for (i = 0; i < len; i++) {
        yield get.send(getChan, buff[i])
    }
    get.close(getChan)
})

// receive
get.go(function*() {
    var startTime = time();
    while (! getChan.closed) {
        yield get(getChan)
    }
    console.log('Getjs unbuffered channel:', setup.toKbps(buff.length, time() - startTime));
})