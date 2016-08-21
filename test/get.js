
describe('get function should', function() {
    var promise, ch, fn;

    it('return a function if generator is given', function() {
        fn = get(function*(){})
        expect(isFunction(fn)).toBe(true)
    })

    it('return the same promise if promise is given', function() {
        promise = get(new Promise(function(){}))
        expect(isPromise(promise)).toBe(true)
    })

    it('delegate to `receive` if channel is given', function() {
        var flag = false;

        ch = get.chan()

        // intercept `receive` method
        ch.receive = function() { flag = true }

        get(ch)

        expect(flag).toBe(true)
    })

    it('return a undefined else', function() {
        promise = get(1)
        expect(promise).toBeUndefined()
    })
})