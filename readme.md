#Aryn

Communicating sequential processes in JavaScript.

Aryn is a thin library that brings CSP (Communicating Sequential Processes) to JavaScript as a programming idiom. It is built around channels, runners, suspenders, and also *Promises*.

Examples with jQuery:

With DOM events
```js
aryn.global()

// listening events
var clickStrm = listen($('#button1'), 'click', stream())

forever(function*(){
    var event = yield receive(clickChan)
    console.log(event)
})
```

With AJAX
```js
aryn.global()

run(function*(){
    // http request
    var json = yield receive($.get('http://github.com'))
    console.log(json)
})
```

Pingpong (ported from [Go](http://talks.golang.org/2013/advconc.slide#6))
```js
aryn.global()

var player = runner(function*(name, table) {
    var ball;
    while (true) {
        ball = yield receive(table)
        if (table.closed) {
            console.log('Table is gone')
            return
        }
        ball.hits += 1

        console.log(name, ball.hits)
        yield suspend(100)

        if (! table.closed) {
            yield send(table, ball)
        }
    }
});

run(function*() {
    var
    table = chan()

    player('A', table)
    player('B', table)
    
    yield send(table, {hits: 0})
    yield suspend(1000)

    close(table)
})
```

## With Aryn

* Your application will be composed of lightweight proccesses which comunicate by passing messages through channels.
* You will be able to take advantage of the JavaScript asynchronicity by writing synchronic code.
* You will be able reuse your Promise-based library avoiding `then-callback` boilerplate.


## API

The API is published under the `aryn.` namespace, however it is possible to use it globally by using the `aryn.global()` function. There is also a modular mode using Angular-like injection.

```js
// qualified
aryn.run()

// using the global scope
aryn.global()
run(...)

// modular
aryn.module(function(run, send, receive){
    
})
```

> The rest of this document assumes using `aryn.global()` for all the following code snippets.

## Runners
Runners (a.k.a. tasks or coroutines) are lightweight scheduled functions. It accepts *Generator Function*s as the first parameter. Aryn takes advantage of the native scheduler, that is, there is not a custom scheduler implementation. Runners along with Channels are the main pieces of the Aryn CSP approach.

### runner(gen: GeneratorFunction): Function
Returns a function that executes a new runner each time it is called.
```js
// create a runner
var myTask = runner(function*(url){
    ...
})

// run it
myTask('http://github.com')

// fork it
myTask('http://gitlab.com')
```


### run(gen: GeneratorFunction, [params...]): Runner
Creates a new runner and executes it returning a `runner` object.
```js
run(function*(url){
    ...
}, 'http://github.com')
```


## Channels
Channels are the central piece of CSP. They are structures used to communicate and synchronize runners, between them or with the outside world.

Channels can be buffered or unbuffered. When sending data through unbuffered channels it always blocks the sender until some other runner receives. Once the data has been received, the sender will be unblocked and the receptor will be blocked until new data is received. Unbuffered channels are also known as _synchronic channels_. When some data is sent to a buffered channel it only blocks the runners if the buffer is full. The receiver only blocks if there is no data in the buffer. The behavior is exactly like in Go language.

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

run(function(){
    console.log(yield receive(ch))
})

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
Sends data to a channel. Always use it preceded by the `yield` keyword, unless you are using it from outside of a runner.
```js
var ch = chan()
run(function*(){
    yield send(ch, 'some message')
})
```

### yield receive(channel: Channel): Object
Receives data from a channel or a Promise.
```js
var ch = chan()
run(function*(){
    var msg = yield receive(ch)
})
```
> Notice: The `yield` keyword is needed.

Example using jQuery promises implementation:
```js
var player = yield receive(jQuery.get('http://api.com/player/1'))
console.log(player)
```

### close(channel: Channel)
Closes a channel.
```js
close(ch)
```


## Utilities
### yield suspend(time: Number)
Suspends a runner for the specified time (in milliseconds).
```js
run(function*(){
    yield suspend(100) // pause it 100 milliseconds
})
```
> Notice: The `yield` keyword is needed

### debug(debug? Boolean)
Sets whether to make runners fails loudly or not. The Aryn runners fail just like a normal JavaScript function by default, which is good for development but not for production. If you want runners to fail silently -á la Erlang- just turn off the debug mode:

```js
// make runners fail silently
aryn.debug(false)
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

If given an array, it will use the array content as keys to extract the values of the properties in filtered object.

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
run(function*() {
    while (true) console.log(yield receive(ch))
})
```

### forever(gen: GeneratorFunction, params?...): Runner
Spawns a new runner but once the runner ends or fails it is automatically restarted. It is a convenient way to persistently execute code blocks, avoiding `while(true)` boilerplate with additional fail-over.

Example with using `run`:
```js
run(function*() {
    while (true) {
        yield suspend(500)
        var event = yield receive(mChan)
        console.log(event.layerX || event.clientX)
    }
})
```

Example using forever:
```js
forever(function*() {
    yield suspend(500)
    var event = yield receive(mChan)
    console.log(event.layerX || event.clientX)
})
```
Advantages:

1. `while(true)` boilerplate removal.
2. Restarts once terminated.
3. Restarts when fails.

