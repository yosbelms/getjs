#Getjs

![badge](https://circleci.com/gh/yosbelms/getjs/tree/master.png?circle-token=1ed7f0fa8180138ce80a45c727fff58cefe49736)

Light weight JavaScript library to express concurrency patterns.

Getjs is a control flow library based in generators to simplify the development of concurrent solutions for JavaScript. It works in both nodejs and the browser, allowing you to deal with the JavaScript asynchronous nature by writting sequential code.

Getjs implements _Communicating Sequential Process_(CSP) by emulating Golang concurrency primitives as much as possible with few deviations to fit in the JavaScript ecosystem. It works with every library based on Promises.

Pingpong example (ported from [Go](http://talks.golang.org/2013/advconc.slide#6))

```js
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
```

## Documentation

0. [Installation](#installation)
0. [Coroutines](#coroutines)
0. [Channels](#channels)
0. [Parallel Resolution](#parallel-resolution)
0. [Race Resolution](#race-resolution)
0. [Pausing Coroutines](#pausing-coroutines)
0. [Promisifying](#promisifying)
0. [Idiomatic Getjs](#idiomatic-getjs)
0. [Debugging](#debugging)


## Installation

**Browser**

```html
<script src="get.js"></script>
```

**Nodejs**

```js
var get = require('getjs')
```

## Coroutines

Coroutines are functions that runs asynchronously. The body of coroutines are generator functions, each time a promise is _yielded_ inside a coroutine it blocks until the promise is resolved or rejected. Each coroutine execution returns a promise that is resolve when the coroutine returns, or rejected if an error occurs.

Spawning a coroutine.

```js
get.go(function *() {
    console.log('executed')
})

// with arguments
get.go(function *(name, age) {
    console.log(name, age)
}, ['john', 30])
```

In many occasions you may need to declare coroutines to spawn it on demmand.

```js
var worker = get.wrap(function *(time) {
    console.log(time)
})

worker(100)
worker(500)
```

Waiting for a promise.

```js
get.go(function *() {
    var n = yield Promise.resolve(1)
})
```

Promise flow.

```js
get.go(function *() {
    return 5
}).then(function(v) {
    console.log(v)
}).catch(function(e) {
    console.log(e.stack)
})
```

## Channels

Channels are structures used to communicate and synchronize coroutines. The behavior is exactly like in Go language.

Channels can be buffered or unbuffered. When sending data through unbuffered channels it always blocks the sender until some other process receives. Once the data has been received, the sender will be unblocked and the receptor will be blocked until new data is received. Unbuffered channels are also known as _synchronic channels_.


`get.send` and `get.recv` operations must preceded by the `yield` keyword.

```js
// create new channel
var ch = get.chan()

get.go(function *() {
    // send 'message' to a `ch`
    yield get.send(ch, 'message')

    // close the channel
    ch.close()
})

get.go(function *() {
    // receive from `ch`
    var msg = yield get.recv(ch)

    console.log(msg)
})
```

When some data is sent to a buffered channel it only blocks the coroutine if the buffer is full. The receiver only blocks if there is no data in the buffer.

```js
var bufferSize = 20
var ch = get.chan(bufferSize)
```

Values passed through channels can be tranformed before to be delivered.

```js
function trans(x) {
    return x*2
}

// provide a transformer
var ch = chan(null, trans)
```

## Parallel Resolution

You can wait for many tasks executed in parallel by using `get.all`.

```js
// proding an array of promises
var result = yield get.all([
    $.get('http://api.com/books'),
    $.get('http://api.com/authors')
]);

var books   = result[0];
var authors = result[1];
```

You can cast by keys by using objects.

```js
// roviding an object
var result = yield get.all({
    books:   $.get('http://api.com/books'),
    authors: $.get('http://api.com/authors')
});

var books   = result.books;
var authors = result.authors;
```

## Race Resolution

`get.race` returns promise that resolves once one of them has been resolved. The returned promise resolves with an object whith the format `{which: key, value: value}`.

```js
get.go(function *() {
    var result = yield get.race([$.get('http://api.com/books'), timeout(500)])

    // found books
    if (result.which === 0) {
        var books = result.value;
    } else {
        // timed out
    }
})
```

Also support objects.

```js
get.go(function *() {
    var result = yield get.race({
        books   : $.get('http://api.com/books'),
        timeout : timeout(500)
    })

    // found books
    if (result.which === 'books') {
        var books = result.value;
    } else {
        // timed out
    }
})
```

## Pausing Coroutines

Some times you want to block a couroutine a span of time.

```js
// stop by 20 milliseconds
yield get.timeout(20)
```

## Promisifying

It is possible to adapt callback-based API to be used with Getjs.

```js
var fs = require('fs')

// make the callback-based function returns a promise
var stat = get.promisify(fs.stat)


get.go(function *() {
    var stats = yield get(stat('path/to/file'))
    console.log(stats)
})
```

Also you can promisify the entire module.

```js
var fs = get.promisify(require('fs'))

get.go(function *() {
    var stats = yield fs.stat('path/to/file')
})
```

## Idiomatic Getjs

The `get` function is overloaded, making possible to write more succint code. If the first parametter is a generator function it will relay on `get.wrap` else it will try to convert the value to a promise through `get.recv` if channel, or `get.all` is object or array is provided.

```js
// wrapped coroutine
func = get(function *() {})

// receive from a channel
yield get(channel)

// parallel resolution
yield get([a, b, c])
```

## Debugging

Coroutine errors are easy to handle because the promise `catch` function. During development all coroutine errors are logged to the console. For production you should avoid this behaviour by turning `get.debug` to `false`.

```
get.debug = false
```

(c) 2016 Yosbel Marín
