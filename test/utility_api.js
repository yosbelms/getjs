describe('sender function', function() {
    it('should repeatedly send to a channel', function(done) {
        var
        ch     = get.chan(5), // buffered
        sender = get.sender(ch);

        sender(1)
        sender(2)
        sender(3)

        get.go(function*() {
            expect(yield get(ch)).toBe(1)
            expect(yield get(ch)).toBe(2)
            expect(yield get(ch)).toBe(3)

            done()
        })
    })
})

describe('copy function', function() {
    function Obj() {
        this.someProp = true
    }

    Obj.prototype.someFn = function() {
        //...
    }

    it('should copy all properties', function() {
        var obj = get.copy(new Obj(), {});
        expect(obj.someFn).toBeTruthy()
    })

    it('should copy only own properties', function() {
        var obj = get.copy(new Obj(), {}, true);
        expect(obj.someFn).toBeFalsy()
    })
})