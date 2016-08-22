var get = require('../get')

var producer = get(function *(ch, time) {
    for (var i = 0; i < 20; i++) {
        if (ch.closed) {
            break
        }
        yield get.send(ch, i)
        yield get.timeout(time)
    }

    get.close(ch)
})

var reader = get(function *(out) {
    while(out.opened) {
        console.log(yield get.recv(out))
    }
})

get.go(function *() {
    var val
    var ch  = get.chan()
    var out = get.chan()

    producer(ch, 100)
    producer(ch, 200)
    reader(out)

    while (ch.opened) {
        yield get.send(out, yield get.recv(ch))
    }

    get.close(out)
})