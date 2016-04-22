#Aryn

Communicating sequential processes in javascript.

Aryn is a thin library that brings CSP (Communicating Secuential Process) to javascript as a programming idiom. It works around channels, runners, and suspenders, and also *Promises*.

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

run(function* start() {
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

* Your application will be composed by lightweight proccesses which comunicates by passing messages through channels.
* Your will take advantage of the javascript asynchronicity by writting synchronic code.
* You will be able reuse your Promise based library avoiding the `then-callback` boilerplate.


## API

The API is published under the `aryn.` namespace, however it is possible to use it globally by using `aryn.global()` function. There is also a modular mode using Angular-like injection.

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

> The rest of this document assumes to use `aryn.global()` for all the following code snipets.

## Runners
Runners (a.k.a. tasks or coroutines) are lightweight scheduled functions. It accepts *Generator Function*s as the first parametter. Aryn takes advantage of the native scheduler, that is, there is not custom scheduler implementation. Runners along with Channels are the main pieces of the Aryn CSP approach.

### runner(gen: GeneratorFunction): Function
Returns a new function that executes a new runner each time is called.
```js
// create a runner
var myTask = runner(function*(url){
    ...
})

// run it
myTask('http://github.com')
```


### run(gen: GeneratorFunction, [params...]): Runner
Creates a new runner and executes it returning a `runner` object.
```js
run(function*(url){
    ...
}, 'http://github.com')
```


## Channels
Channels are the central piece of CSP, those are structures to communicate and synchronize runners, beetween them, or with the outer world.

Channels can be buffered or unbuffered. When sending data through unbuffered channels it always blocks the sender until some other receives, once the data has been received the sender will be unblocked and the receptor will be blocked until some data be received. Unbuffered channels are also known as _synchronic channels_. When some data is sent to a buffered channel it only blocks the runners if the buffer is full. The receiver only blocks if there is no data in the buffer. The behavior is exactly like in Go laguage.

Signal channels is a flavor of unbuffered (but not synchronic) channel which satisfaces certain kind of requirements. It will never block the sender, but will rewrite the data if it has not been received yet, a sort of sliding buffer of size 1. In addition, it can be throttled.


### chan([bufferSize: Number]): Channel
Creates a new `channel`
```js
var ch  = chan()  // unbufferd channel
var bch = chan(5) // buffered channel which its buffer size is 5
```

### signal([throttle: Number]): SignalChannel
Creates a signal-channel optianally receiving a throttling time in milliseconds.
```js
var sig  = signal()    // unthrottled
var tsig = signal(100) // signal with a 100 msecs throttle
```

### send(channel: Channel, data: Object)
Sends data to a channel. Always use it preceded by the `yield` keyword, unless you are using it from outside of a runner.
```js
var ch = chan()
run(function*(){
    yield send(ch, 'some message')
})
```

### receive(channel: Channel): Object
Receives data from a channel or a Promise.
```js
var ch = chan()
run(function*(){
    var msg = yield receive(ch)
})
```
> Notice the `yield` keyword usage.

Example using jQuery promises implementation:
```
var player = yield receive(jQuery.get('http://api.com/player/1'))
console.log(player)
```

### close(channel: Channel)
Closes a channel.
```js
close(ch)
```


## Utilities
### suspend(time: Number)
Suspends a runner during the specified time(in milliseconds).
```js
run(function*(){
    yield suspend(100) // pause it 100 milliseconds
})
```
> Notice the `yield` keyword

### debug()
Aryn runners fails silently by default -á la Erlang-, which is good for production but for development not so, this function will makes your runners fail loudly, as a normal Error throwing.
```js
aryn.debug()
```


## Idiamatic API
### filter(filter: [Undefined|Function|Number|Array]): Function
Returns a filter function.

If the filter parametter is Undefined the returning function converts its arguments in array and return it.

```js
var filt = filter()
filt(1, 2) // [1, 2]
```

If is a Function, the returned function will be the same as the passed one.

```js
var filt = filter(function(a, b){
    return a + b
})

filt(1, 2) // 3
```

If Number, the function will return a n-th (0-based) passed argument.
```js
var filt = filter(1)
filt(1, 2) // 2
```

If an Array, it will use the array content as keys to extract the values of the properties in filtered object.

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
Returns a function that sends its arguments to a channel each time it is called. The channel will receive functions arguments in a form of array.
```js
var ch = chan()
var sendr = sender(ch)

sendr(1, 2) // an array equal to [1, 2] will be sent
```

The true usefullness of this function is to be used with events. Example.
```js
$('.button').on('click', sender(ch))
// send the events parammetters to the channel on each click
```

### listen(eventEmitter: Object, eventName: String, channel: Channel, [filterFunction: Function]): Channel
Adds a callback event listener to an Object and returns a channel passed as 3rd arguments. This utility assumes the `eventEmitter` has a function to add event listeners in the following form:
```
addEventListener|attachEvent|on(eventName: String, callback: Function)
```
The default filter is `filter(0)`

Example:
```
elem = document.getElementById('button')

// listen to the element through a SignalChannel
ch = listen(elem, 'click', signal())

// log to the console all sended event objects
run(function*() {
    while (true) console.log(yield receive(ch))
})
```

### forever(gen: GeneratorFunction, [params...]): Runner
Spawns a new runner but once the runner ends or fails it automatically will restart. It is a convenient way to persistently execute code blocks avoiding `while(true)` boilerplate with additional fail-over.

Example with using `run`:
```
run(function*() {
    while (true) {
        yield suspend(500)
        var event = yield receive(mChan)
        console.log(event.layerX || event.clientX)
    }
})
```

Example using forever:
```
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