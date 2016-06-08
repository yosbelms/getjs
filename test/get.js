

describe('get function should', function() {
    var br, ch;

    it('return a function if generator is given', function() {
        br = get(function*(){})
        expect(isFunction(br)).toBe(true)
    })

    it('return a breakpoint if promise is given', function() {
        br = get(new Promise(function(){}))
        expect(isBreakpoint(br)).toBe(true)
    })

    it('return a breakpoint if process is given', function() {
        br = get(new get.Process())
        expect(isBreakpoint(br)).toBe(true)
    })

    it('return a breakpoint if array is given', function() {
        br = get([])
        expect(isBreakpoint(br)).toBe(true)
    })

    it('return a breakpoint if object is given', function() {
        br = get({})
        expect(isBreakpoint(br)).toBe(true)
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
        br = get(1)
        expect(br).toBeUndefined()
    })
})