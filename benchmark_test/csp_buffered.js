var csp   = require('./vendor/csp/csp.js');
var setup = require('./setup.js');
var buff  = setup.bigBuffer;
var time  = setup.time;

var cspChan = csp.chan(500);

// send
csp.go(function*() {
    var i, len = buff.length;
    for (i = 0; i < len; i++) {
        yield csp.put(cspChan, buff[i])
    }
    cspChan.close()
})

// receive
csp.go(function*() {
    var startTime = time(), v;
    while (true) {
        v = yield csp.take(cspChan)
        if (csp.CLOSED === v) break
    }
    console.log('JS-CSP buffered channel:', time() - startTime);
})
