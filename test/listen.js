
describe('listen function', function() {

    function EmitterMock(evtRegName) {
        this.listeners   = { }
        this[evtRegName] = function(evtName, fn) {
            this.listeners[evtName] = fn
        }
    }

    it('whith on', function() {
        var em = new EmitterMock('on');
        get.listen(em, 'click', get.chan())

        expect(isFunction(em.listeners['click'])).toBe(true)
    })

    it('whith attachEvent', function() {
        var em = new EmitterMock('attachEvent');
        get.listen(em, 'click', get.chan())

        expect(isFunction(em.listeners['click'])).toBe(true)
    })

    it('whith addEventListener', function() {
        var em = new EmitterMock('addEventListener');
        get.listen(em, 'click', get.chan())

        expect(isFunction(em.listeners['click'])).toBe(true)
    })

    it('emitting', function() {
        var em = new EmitterMock('on');
        var ch = get.listen(em, 'click', get.chan())

        em.listeners['click'](1)
        expect(get(ch)).toBe(1)

        em.listeners['click'](2)
        expect(get(ch)).toBe(2)
    })

})