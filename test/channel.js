describe('channels', function() {
    it('should accept transformers', function(done) {
        var
        transform = function(x) { return x*2 },
        uch = get.chan(null, transform),
        bch = get.chan(5, transform),
        stm = get.stream(null, transform);

        // receive first
        get.go(function*() {
            expect(yield get(uch)).toBe(10)
            expect(yield get(bch)).toBe(10)
            expect(yield get(stm)).toBe(10)

            done()
        })

        get.go(function*() {
            get.send(uch, 5)
            get.send(bch, 5)

            // break execution to allow receiving first
            yield get.timeout(0)
            get.send(stm, 5)
        })

    })
})

describe('unbuffered channels', function() {

    it('it should behave sending and receving messages synchronously', function(done) {
        var proc = get(function*(ch, name){
            var m;
            while(!ch.closed) {
                m = yield get(ch)
                m.stack.push(0) // register receive
                m.procTick.push(name) // register this execution

                yield get.send(ch, m)
                m.stack.push(1) // register send
            }
        })


        get.go(function*(){
            var
            ch  = get.chan(),
            msg = {stack: [], procTick: []};

            get.send(ch, msg)

            proc(ch, 0)
            proc(ch, 1)

            yield get.timeout(5)
            get.close(ch)

            // alternate get and send
            expect(msg.stack.slice(1, 5)).toEqual([0, 1, 0, 1])

            // altername procs execution
            expect(msg.procTick.slice(0, 4)).toEqual([0, 1, 0, 1])
            done()
        })

    })

})

describe('buffered channels', function() {

    it('it should behave sending and receving messages asynchronously', function(done) {
        var arr = [];

        var procSend = get(function*(ch){
            while(!ch.closed) {
                yield get.send(ch, 0)
                arr.push(0) // register send
            }
        })

        var procReceive = get(function*(ch) {
            while(!ch.closed) {
                yield get(ch)
                arr.push(1) // register receive
            }
        })


        get.go(function*(){
            var ch = get.chan(5);

            procSend(ch)
            procReceive(ch)

            yield get.timeout(1)
            get.close(ch)

            expect(arr.slice(0, 3)).toEqual([0, 0, 0])
            done()
        })

    })

})

describe('stream channels', function() {

    it('it should me multicast', function(done) {
        var arr = [];

        var procSend = get(function*(ch){
            while(!ch.closed) {
                yield get.send(ch, 0)
                arr.push(0) // register send
            }
        })

        var procReceive = get(function*(ch) {
            while(!ch.closed) {
                yield get(ch)
                arr.push(1) // register receive
            }
        })

        get.go(function*(){
            var ch = get.stream();

            procSend(ch)
            procReceive(ch)
            procReceive(ch)

            yield get.timeout(10)
            get.close(ch)

            expect(arr.slice(0, 6)).toEqual([0, 1, 1, 0, 1, 1])
            done()
        })

    })

})
