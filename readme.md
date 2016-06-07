#Getjs

Unifying library to make sequential your asynchonous code.

**Getjs** is a control flow library based in generators to be free of callbacks and Promises boilerplate, making sequential your asynchonous code. The Getjs key feature is the interoperability with thirth-party libraries, so it is possible to consume callbacks, event-driven, or Promise based APIs, and the code will remain sequential.

Example in Node.js:
```js
var fs = get.drive(require('fs'))

get.go(function*(){
    var stat = get(fs.stat(__filename))
    console.log(stat)
})
```

In ~15Kb (unminified and uncompressed) Getjs makes possible to take advantage of libraries based on most used techniques such as callbacks, events, and Promises, to take advantage of the huge JavaScript ecosystem including the whole Node.js API. It also brings CSP (Communicating Sequential Processes) to the JavaScript world.

Examples of how Getjs allows you to reuse Promise-based libraries, for example, jQuery:

**DOM events**
```js
get.global()

// converting events to stream
var clickStrm = listen($('#button1'), 'click', stream())

get.go(function*(){
    while(true) {
        console.log(yield get(clickStrm))
    }
})
```

**AJAX**
```js
get.global()

get.go(function*(){
    // http request
    var json = yield get($.get('http://github.com'))
    console.log(json)
})
```

Example that shows CSP with Getjs. Pingpong (ported from [Go](http://talks.golang.org/2013/advconc.slide#6))
```js
get.global()

var player = get(function*(name, table) {
    var ball;
    while (true) {
        ball = yield get(table)
        if (table.closed) {
            console.log('Table is gone')
            return
        }
        ball.hits += 1

        console.log(name, ball.hits)
        yield timeout(100)

        if (! table.closed) {
            yield send(table, ball)
        }
    }
})

get(function*() {
    var
    table = chan()

    player('A', table)
    player('B', table)

    yield send(table, {hits: 0})
    yield timeout(1000)

    close(table)
})()
```


## With Getjs

* You will be able to take advantage of the JavaScript asynchronicity by writing sequential code.
* You will be able to reuse any Promise-based library avoiding `then-callback` boilerplate.
* You will use the whole Node.js asynchonous API without the annoying `callback-hell`.
* You can compose your application by creating lightweight proccesses which comunicate by passing messages through channels.


## API

The API is published under the `get.` namespace, however it is possible to use it globally by using the `get.global()` function.

```js
// namespaced
get()

// using the global scope
get.global()
get(...)
```

> The rest of this document assumes using `get.global()` for all the following code snippets.


## Get
The `get` function is overloaded, it makes possible to await future values and convert generator functions to processes.

Examples:
```
// generator to process
var proc = get(function*(firstName, lastName) {
    return firstName + ' ' + lastName
})

// awaiting the returning value of a process
yield get(proc('Yosbel', 'Marin'))

// awaiting a value from a channel
yield get(ch)

// awaiting a promise
yield get($.get('http://github.com'))


// awaiting a parallel resolution
yield get([
    $.get('http://github.com/yosbelms/getjs'),
    $.get('http://github.com/yosbelms/cor')
])
```

Always use `yield` keyword before the `get` function unless you want to create a process by passing a generator function. There is detailed examples below.


## Breakpoint
Breakpoints are objects that tells the processes to stop once yielded, it resumes the process execution once the asynchronus task ends. It has a method (`done`) which accept callbacks to be executed either when the task is terminated or a error has occured inside a process.

Example:
```
var proc = get(function*(){
    
})

// when a process is executed it returns a Breakpoint
proc().done(function(returned, error){
    // ...
})
```

Example using `get.go`:
```
get.go(function*(){
    return 'ok'
}).done(function(ret){
    console.log(ret) //ok
})
```


## Processes
Processes (a.k.a. tasks or coroutines) are lightweight scheduled functions. It accepts *Generator Function*s as the first parameter. Getjs takes advantage of the native scheduler, that is, there is not a custom scheduler implementation. Processes along with Channels are the main pieces of the Getjs CSP approach.


### go(gen: GeneratorFunction): Breakpoint
Creates a new process and executes it returning a function.
```js
var task = get.go(function*(url){
    ...
})

task('http://github.com')
```

## Driven Callbacks
Driven callbacks are callbacks converted to the breakpoint underlaying architecture, it's the same idea behind **promisifyAll** in the Bluebird library.

### drive(object?: Function|Object, ctx?: Object): Object|Function
Converts a callback-based function or an object containing callback-based functions to a function or object ready to be used with `yield get()` function.

With a function:
```js
var stat = get.drive(require('fs').stat)

get(function*() {
    var stats = yield get(stat(__filename))
    console.log(stats)
})()
```

With an object containing callback-based functions:
```js
var fs = get.drive(require('fs'))

get(function*() {
    var stat = yield get(fs.stat(__filename))
    console.log(stat)
})()
```

## Channels
Channels are the central piece of CSP. They are structures used to communicate and synchronize processes, between them or with the outside world.

Channels can be buffered or unbuffered. When sending data through unbuffered channels it always blocks the sender until some other process receives. Once the data has been received, the sender will be unblocked and the receptor will be blocked until new data is received. Unbuffered channels are also known as _synchronic channels_. When some data is sent to a buffered channel it only blocks the processes if the buffer is full. The receiver only blocks if there is no data in the buffer. The behavior is exactly like in Go language.

A stream is an unbuffered (but not synchronic) channel which satisfies certain requirements. It will block the sender, but rewrite the data if it has not been received yet, a sort of sliding buffer of size 1. In addition, it guarantees to deliver data to all receivers -multicast- and can be throttled.


### chan(bufferSize?: Number, transform?: Function): Channel
Creates a new `channel`. If `transform` is given then each value will be transformed on send.
```js
var ch  = chan()  // unbuffered channel
var bch = chan(5) // buffered channel which its buffer size is 5
```

With transformers:
```js
var ch = chan(3, function(v){ return v * 2 })

send(ch, 1)
send(ch, 2)
send(ch, 3)

get(function(){
    console.log(yield get(ch))
})()

output:
2
4
6
```

### stream(throttle?: Number, transform? Function): Stream
Creates a stream, optionally receiving a throttling time in milliseconds.
```js
var stm  = stream()    // unthrottled
var tstm = stream(100) // stream throttled with a 100 msecs
```

### yield? send(channel: Channel, data: Object)
Sends data to a channel. Always use it preceded by the `yield` keyword, unless you are using it from outside of a process.
```js
var ch = chan()
get(function*(){
    yield send(ch, 'some message')
})()
```

### yield get(channel: Channel): Object
Receives data from a channel, Promise or `driven` functions. If given an native array or object, `get` will resolve all in parallel.
```js
var ch = chan()
get(function*(){
    var msg = yield get(ch)
})()
```
> Notice: The `yield` keyword is needed.

Example using jQuery promises implementation:
```js
var player = yield get($.get('http://api.com/player/1'))
console.log(player)
```

Example using driven callbacks in Node.js:
```js
var fs = get.drive(require('fs'))

get(function*(){
    var stat = yield get(fs.stat(__filename))
    console.log(stat)
})()
```

Example using parallel resolutions:
```js
var result = yield get([
    $.get('http://api.com/books'),
    $.get('http://api.com/authors')
]);

var books   = result[0];
var authors = result[1];

// even better with objects

var result = yield get({
    books:   $.get('http://api.com/books'),
    authors: $.get('http://api.com/authors')
});

var books   = result.books;
var authors = result.authors;
```

### close(channel: Channel)
Closes a channel.
```js
close(ch)
```


## Utilities
### yield timeout(time: Number)
Stops a process for the specified time (in milliseconds).
```js
get(function*(){
    yield timeout(100) // pause it 100 milliseconds
})()
```
> Notice: The `yield` keyword is needed

### throws(throws? Boolean)
Sets whether to make processes throws on fail or not. The Getjs processes fails silently by default, but if you want processes fails loudly while debugging you code, just write `get.throws(true)` somewhere in your code:

```js
// make processes throws on fail
get.throws(true)
```

> Recommended for production.

## Idiomatic API
### filter(filter: Undefined|Function|Number|Array): Function
Returns a filter function.

If the filter parameter is _Undefined_ the returning function converts its arguments into an array and returns that.

```js
var filt = filter()
filt(1, 2) // [1, 2]
```

If given a Function, the returned function will be the same as the one passed in.

```js
var filt = filter(function(a, b){
    return a + b
})

filt(1, 2) // 3
```

If given a number, the filter function will return the n-th (0-based) argument.
```js
var filt = filter(1)
filt(1, 2) // 2
```

If given an array, it will use the array values as keys to extract the values of the properties in a filtered object.

```js
var person = {
    name    : 'Yosbel',
    surName : 'Marin',
    age     : 28
}

var filt = filter(['name', 'age'])

filt(person) // {name: 'Yosbel', age: 28}
```

### sender(channel: Channel, filter: Function): Function
Returns a function that sends its arguments to a channel each time it is called. The channel will receive the function's arguments in the form of an array.
```js
var ch = chan()
var sendr = sender(ch)

sendr(1, 2) // an array equal to [1, 2] will be sent
```

The true usefulness of this function is when used with events. For example:
```js
$('.button').on('click', sender(ch))
// send the event's parameters to the channel on each click
```

### listen(eventEmitter: Object, eventName: String, channel: Channel, filterFunction?: Function): Channel
Adds a callback event listener to an Object and returns a channel passed as the third argument. This utility assumes the `eventEmitter` has a function to add event listeners of the following form:
```js
addEventListener|attachEvent|on(eventName: String, callback: Function)
```
The default filter is `filter(0)`

Example:
```js
elem = document.getElementById('button')

// listen to the element through a Stream
ch = listen(elem, 'click', stream())

// log to the console all sent event objects
get(function*() {
    while (true) console.log(yield get(ch))
})()
```