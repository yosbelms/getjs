require('../aryn.js');
var setup = require('./setup.js');
var buff  = setup.buffer;
var time  = setup.time;

var arynChan = aryn.chan();

// send
aryn.run(function*() {
    var i, len = buff.length;
    for (i = 0; i < len; i++) {
        yield aryn.send(arynChan, buff[i])
    }
    aryn.close(arynChan)
})

// receive
aryn.run(function*() {
    var startTime = time();
    while (! arynChan.closed) {
        yield aryn.receive(arynChan)
    }
    console.log('Aryn unbuffered channel:', time() - startTime);
})