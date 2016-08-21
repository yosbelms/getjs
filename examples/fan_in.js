var get = require('../get')

var producer = get(function *(ch, time) {
    for (var i = 0; i < 20; i++) {
        yield get.send(ch, i)
        yield get.timeout(time)
    }

    ch.close(ch)
})

var reader = get(function *(out) {
    while(true) {
        console.log(yield get.recv(out))
    }
})

get.go(function *() {
    var ch  = get.chan()
    var out = get.chan()
    
    producer(ch, 100)
    producer(ch, 200)
    reader(out)

    while (!ch.closed) {
        yield get.send(out, yield get.recv(ch))
    }

    out.close()
})