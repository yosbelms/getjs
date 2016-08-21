
describe('Coroutines', function() {

    it('should resolve its prmise with the returned value', function(done) {
        get.go(function*() {
            return 2
        }).then(function(r) {
            expect(r).toBe(2)
            done()
        })
    })

    it('should reject if any error occur inside', function(done) {
        get.go(function*() {
            throw 'Error!'
        }).catch(function(err) {
            expect(err).toBe('Error!')
            done()
        })
    })


    it('should receive returned values from other coroutines', function(done) {
        var cor = get.wrap(function*(num){
            return num + 5
        })

        get(function*() {
            expect(yield cor(5)).toBe(10)
            done()
        })()
    })

})