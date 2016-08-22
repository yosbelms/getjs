var get = require('../get')

var worker = get(function *(ch, name) {
    var val;
    while (ch.opened) {
        val = yield get.recv(ch)
        yield get.timeout(val*30)
        console.log('worker: ', name, ' task:', val)
    }
})

var pool = get(function *(ch, numWorkers, numTasks) {
    for (var i = 0; i < numWorkers; i++) {
        worker(ch, i)
    }

    for (var i = 0; i < numTasks; i++) {
        yield get.send(ch, i)
    }

    console.log('close')
    get.close(ch)
})

get.go(function *() {
    var ch = get.chan()
    pool(ch, 10, 50)
})