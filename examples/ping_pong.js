var get = require('../get')

var player = get(function*(name, table) {
    var ball
    while (true) {
        ball = yield get(table)
        if (table.closed) {
            console.log(name, 'table is gone')
            return
        }
        ball.hits += 1

        console.log(name, ball.hits)
        yield get.timeout(100)

        if (! table.closed) {
            yield get.send(table, ball)
        }
    }
})

get.go(function*() {
    var
    table = get.chan()

    player('Ping', table)
    player('Pong', table)
    
    yield get.send(table, {hits: 0})
    yield get.timeout(1000)

    get.close(table)
})